/**
 * AI Ads add-on endpoints (/api/ai/*). Mounted from handleAdmin after the session is
 * resolved, so `acc` is already the authenticated account id. Every action that costs
 * money checks the add-on entitlement + charges credits (refunding on failure).
 */
import { json, err } from '../_lib/http.js';
import { randomId } from '../_lib/crypto.js';
import { getFunnelById } from '../_lib/funnels.js';
import { getAddon, isEnabled, chargeCredits, refundCredits, grantCredits, COSTS } from '../_lib/credits.js';
import { briefFromFunnel, generateStrategy, generateCreativeCopy, generateImage, analyzeCompetitors } from '../_lib/ai.js';
import { searchAdLibrary, isConfigured as metaConfigured } from '../_lib/meta_ads.js';

const nowISO = () => new Date().toISOString();

export async function handleAi(db, env, request, path, url, acc) {
  // ── Entitlement + credit balance ──
  if (path === '/api/ai/addon' && request.method === 'GET') {
    const a = await getAddon(db, acc);
    return json({
      enabled: !!a.enabled, credits: a.credits, plan: a.plan || null,
      costs: COSTS,
      providers: { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, meta: metaConfigured(env) },
    });
  }

  // Dev/admin helper: grant credits (guarded — only the account owner, and only when
  // explicitly enabled via env to avoid a free-credits hole in production).
  if (path === '/api/ai/grant' && request.method === 'POST') {
    if (env.AI_ALLOW_SELF_GRANT !== '1') return err('Not available', 403);
    const b = await request.json().catch(() => ({}));
    const credits = await grantCredits(db, acc, Math.max(0, parseInt(b.credits || 0, 10)), { enable: true });
    return json({ ok: true, credits });
  }

  // ── Projects ──
  if (path === '/api/ai/projects') {
    if (request.method === 'GET') {
      const r = await db.prepare(
        `SELECT id, funnel_id, name, status, created_at, updated_at,
                (strategy IS NOT NULL) AS has_strategy
         FROM ad_projects WHERE account_id = ? ORDER BY updated_at DESC`
      ).bind(acc).all();
      return json({ results: r.results || [] });
    }
    if (request.method === 'POST') {
      if (!(await isEnabled(db, acc))) return err('AI Ads add-on is not active', 403);
      const b = await request.json().catch(() => ({}));
      let funnelId = null, name = (b.name || '').trim(), brief = {};
      if (b.funnelId) {
        const f = await getFunnelById(db, acc, b.funnelId);
        if (!f) return err('Funnel not found', 404);
        funnelId = f.id; brief = briefFromFunnel(f); if (!name) name = `Ads — ${f.name || f.slug}`;
      } else {
        brief = { name: name || 'New campaign', inputUrl: (b.url || '').trim(), notes: (b.notes || '').trim() };
      }
      if (!name) name = 'New campaign';
      const id = randomId('adp'); const ts = nowISO();
      await db.prepare(
        `INSERT INTO ad_projects (id, account_id, funnel_id, name, input_url, brief, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(id, acc, funnelId, name, brief.inputUrl || null, JSON.stringify(brief), 'draft', ts, ts).run();
      return json({ id, name, funnel_id: funnelId }, 201);
    }
  }

  const pm = path.match(/^\/api\/ai\/projects\/([^/]+)$/);
  if (pm) {
    const project = await db.prepare('SELECT * FROM ad_projects WHERE account_id = ? AND id = ?').bind(acc, pm[1]).first();
    if (!project) return err('Not found', 404);
    if (request.method === 'GET') {
      const creatives = await db.prepare(
        'SELECT id, platform, persona, headline, primary_text, cta, image_key, favorite, created_at FROM ad_creatives WHERE account_id = ? AND project_id = ? ORDER BY created_at DESC'
      ).bind(acc, project.id).all();
      const comp = await db.prepare(
        'SELECT id, source, page_name, ad_text, cta, media_url, angle, fetched_at FROM competitor_ads WHERE account_id = ? AND project_id = ? ORDER BY fetched_at DESC LIMIT 60'
      ).bind(acc, project.id).all();
      return json({
        ...projectPublic(project),
        creatives: creatives.results || [],
        competitorAds: comp.results || [],
      });
    }
    if (request.method === 'DELETE') {
      await db.batch([
        db.prepare('DELETE FROM ad_creatives WHERE account_id = ? AND project_id = ?').bind(acc, project.id),
        db.prepare('DELETE FROM competitor_ads WHERE account_id = ? AND project_id = ?').bind(acc, project.id),
        db.prepare('DELETE FROM ad_projects WHERE account_id = ? AND id = ?').bind(acc, project.id),
      ]);
      return json({ ok: true });
    }
  }

  // ── Generate strategy ──
  const sm = path.match(/^\/api\/ai\/projects\/([^/]+)\/strategy$/);
  if (sm && request.method === 'POST') {
    const project = await db.prepare('SELECT * FROM ad_projects WHERE account_id = ? AND id = ?').bind(acc, sm[1]).first();
    if (!project) return err('Not found', 404);
    const charge = await chargeCredits(db, acc, COSTS.strategy, 'strategy', project.id);
    if (!charge.ok) return err(charge.enabled ? 'Not enough credits' : 'AI Ads add-on is not active', 402);
    try {
      const brief = safeBrief(project);
      const strategy = await generateStrategy(env, brief);
      await db.prepare('UPDATE ad_projects SET strategy = ?, status = ?, updated_at = ? WHERE account_id = ? AND id = ?')
        .bind(JSON.stringify(strategy), 'ready', nowISO(), acc, project.id).run();
      return json({ strategy, credits: charge.balance });
    } catch (e) {
      const credits = await refundCredits(db, acc, COSTS.strategy, project.id);
      return json({ error: `Strategy generation failed: ${e.message}`, credits }, 502);
    }
  }

  // ── Find competitor ads (Meta Ad Library + AI analysis) ──
  const fm = path.match(/^\/api\/ai\/projects\/([^/]+)\/find-ads$/);
  if (fm && request.method === 'POST') {
    const project = await db.prepare('SELECT * FROM ad_projects WHERE account_id = ? AND id = ?').bind(acc, fm[1]).first();
    if (!project) return err('Not found', 404);
    const b = await request.json().catch(() => ({}));
    const query = (b.query || '').trim();
    if (!query) return err('Enter a search term', 400);
    const charge = await chargeCredits(db, acc, COSTS.find_ads, 'find_ads', project.id);
    if (!charge.ok) return err(charge.enabled ? 'Not enough credits' : 'AI Ads add-on is not active', 402);
    try {
      const brief = safeBrief(project);
      const wantMeta = b.source !== 'ai';
      const wantAi = b.source !== 'meta';
      const [meta, ai] = await Promise.all([
        wantMeta ? searchAdLibrary(env, { query, country: b.country || 'US' }) : Promise.resolve({ ads: [], note: null }),
        wantAi ? analyzeCompetitors(env, { brief, query }).catch(() => []) : Promise.resolve([]),
      ]);
      const ts = nowISO();
      const rows = [];
      for (const a of meta.ads) rows.push(['meta', a.page_name, a.ad_text, a.cta, a.media_url, null, JSON.stringify(a.raw || {})]);
      for (const a of ai) rows.push(['ai', a.page_name, a.ad_text, a.cta, null, a.angle || null, '{}']);
      if (rows.length) {
        await db.batch(rows.map((r) => db.prepare(
          'INSERT INTO competitor_ads (id, account_id, project_id, source, page_name, ad_text, cta, media_url, angle, raw, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
        ).bind(randomId('cad'), acc, project.id, r[0], r[1], r[2], r[3], r[4], r[5], r[6], ts)));
      }
      return json({ added: rows.length, note: meta.note, credits: charge.balance });
    } catch (e) {
      const credits = await refundCredits(db, acc, COSTS.find_ads, project.id);
      return json({ error: `Ad search failed: ${e.message}`, credits }, 502);
    }
  }

  // ── Generate creatives (copy + image) ──
  const cm = path.match(/^\/api\/ai\/projects\/([^/]+)\/creatives$/);
  if (cm && request.method === 'POST') {
    const project = await db.prepare('SELECT * FROM ad_projects WHERE account_id = ? AND id = ?').bind(acc, cm[1]).first();
    if (!project) return err('Not found', 404);
    const b = await request.json().catch(() => ({}));
    const platform = (b.platform || 'meta').toLowerCase();
    const persona = (b.persona || '').trim();
    const count = Math.min(Math.max(parseInt(b.count || 3, 10), 1), 4);
    const withImages = b.images !== false;

    const cost = COSTS.creative * count;
    const charge = await chargeCredits(db, acc, cost, 'creative', project.id);
    if (!charge.ok) return err(charge.enabled ? 'Not enough credits' : 'AI Ads add-on is not active', 402);
    try {
      const brief = safeBrief(project);
      const variants = await generateCreativeCopy(env, { brief, platform, persona, count });
      const ts = nowISO();
      const saved = [];
      for (const v of variants) {
        const id = randomId('crv');
        let imageKey = null;
        if (withImages && v.image_prompt && env.OPENAI_API_KEY) {
          try {
            const img = await generateImage(env, { prompt: v.image_prompt });
            imageKey = `creatives/${acc}/${id}.png`;
            await env.AD_ASSETS.put(imageKey, img.bytes, { httpMetadata: { contentType: img.contentType } });
          } catch (e) { imageKey = null; /* keep copy even if image fails */ }
        }
        await db.prepare(
          'INSERT INTO ad_creatives (id, account_id, project_id, platform, persona, headline, primary_text, cta, image_key, favorite, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)'
        ).bind(id, acc, project.id, platform, persona || null, v.headline || '', v.primary_text || '', v.cta || '', imageKey, ts).run();
        saved.push({ id, platform, persona, headline: v.headline, primary_text: v.primary_text, cta: v.cta, image_key: imageKey, favorite: 0, created_at: ts });
      }
      await db.prepare('UPDATE ad_projects SET updated_at = ? WHERE account_id = ? AND id = ?').bind(ts, acc, project.id).run();
      return json({ creatives: saved, credits: charge.balance });
    } catch (e) {
      const credits = await refundCredits(db, acc, cost, project.id);
      return json({ error: `Creative generation failed: ${e.message}`, credits }, 502);
    }
  }

  // ── Creative: edit / favorite / delete ──
  const em = path.match(/^\/api\/ai\/creatives\/([^/]+)$/);
  if (em) {
    const cr = await db.prepare('SELECT * FROM ad_creatives WHERE account_id = ? AND id = ?').bind(acc, em[1]).first();
    if (!cr) return err('Not found', 404);
    if (request.method === 'PATCH') {
      const b = await request.json().catch(() => ({}));
      const sets = [], binds = [];
      for (const col of ['headline', 'primary_text', 'cta']) if (b[col] != null) { sets.push(`${col} = ?`); binds.push(String(b[col])); }
      if (b.favorite != null) { sets.push('favorite = ?'); binds.push(b.favorite ? 1 : 0); }
      if (!sets.length) return json({ ok: true });
      binds.push(acc, cr.id);
      await db.prepare(`UPDATE ad_creatives SET ${sets.join(', ')} WHERE account_id = ? AND id = ?`).bind(...binds).run();
      return json({ ok: true });
    }
    if (request.method === 'DELETE') {
      if (cr.image_key) { try { await env.AD_ASSETS.delete(cr.image_key); } catch (e) {} }
      await db.prepare('DELETE FROM ad_creatives WHERE account_id = ? AND id = ?').bind(acc, cr.id).run();
      return json({ ok: true });
    }
  }

  // ── Stream a creative's image from R2 ──
  const im = path.match(/^\/api\/ai\/creatives\/([^/]+)\/image$/);
  if (im && request.method === 'GET') {
    const cr = await db.prepare('SELECT image_key FROM ad_creatives WHERE account_id = ? AND id = ?').bind(acc, im[1]).first();
    if (!cr || !cr.image_key) return err('Not found', 404);
    const obj = await env.AD_ASSETS.get(cr.image_key);
    if (!obj) return err('Not found', 404);
    return new Response(obj.body, {
      headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/png', 'Cache-Control': 'private, max-age=86400' },
    });
  }

  return err('Not found', 404);
}

function projectPublic(p) {
  let brief = {}, strategy = null;
  try { brief = JSON.parse(p.brief || '{}'); } catch (e) {}
  try { strategy = p.strategy ? JSON.parse(p.strategy) : null; } catch (e) {}
  return {
    id: p.id, name: p.name, funnel_id: p.funnel_id, input_url: p.input_url,
    status: p.status, brief, strategy, created_at: p.created_at, updated_at: p.updated_at,
  };
}

function safeBrief(project) {
  let brief = {};
  try { brief = JSON.parse(project.brief || '{}'); } catch (e) {}
  if (!brief.name) brief.name = project.name;
  if (!brief.inputUrl && project.input_url) brief.inputUrl = project.input_url;
  return brief;
}
