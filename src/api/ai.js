/**
 * AI Ads add-on endpoints (/api/ai/*). Mounted from handleAdmin after the session is
 * resolved, so `acc` is already the authenticated account id. Every action that costs
 * money checks the add-on entitlement + charges credits (refunding on failure).
 */
import { json, err } from '../_lib/http.js';
import { randomId } from '../_lib/crypto.js';
import { getFunnelById } from '../_lib/funnels.js';
import { getAddon, isEnabled, chargeCredits, refundCredits, grantCredits, packCatalog, AI_PACKS, COSTS } from '../_lib/credits.js';
import { briefFromFunnel, generateStrategy, generateCreativeCopy, generateImage, analyzeCompetitors, scoreCreative, generateQuizCopy, PLATFORMS } from '../_lib/ai.js';
import { searchAdLibrary, isConfigured as metaConfigured } from '../_lib/meta_ads.js';
import { createCheckoutSession } from '../_lib/stripe.js';
import { getBrandKit, upsertBrandKit, setBrandLogo, brandKitText } from '../_lib/brandkit.js';
import { zipSync } from 'fflate';

// Admin UI's PT/EN toggle sends its current language on every AI generation call
// (see admin/index.html's aiApi()) — normalize to just the two we support.
const normLang = (v) => (v === 'pt' ? 'pt' : 'en');

const EXPORT_MAX_IDS = 24;

// Screen types the quiz-copy generator is allowed to touch, and which of their JSON
// fields are real copy (mirrors the builder's SCHEMA in public/admin/index.html).
// `offer`/`imc`/`success` are deliberately excluded — their copy is hardcoded in
// public/js/app.js, not read from screen JSON, so there is nowhere safe to write into.
const QUIZ_SCREEN_FIELDS = {
  landing: ['headline', 'headlineAccent', 'sub', 'alertTitle', 'alertBody', 'cta'],
  single: ['question', 'sub', 'options'],
  multi: ['question', 'sub', 'options'],
  grid: ['question', 'options'],
  slider: ['question', 'sub', 'infoTitle', 'infoBody'],
  text: ['question', 'sub', 'cta'],
  bridge: ['headline', 'body', 'bodyExtra', 'cta'],
  video: ['headline', 'sub', 'body', 'cta'],
  loading: ['headline', 'steps'],
  profile: ['headline', 'cta'],
};
const QUIZ_FRAMEWORKS = ['pas', 'paso', 'aida', 'generic'];

const nowISO = () => new Date().toISOString();

/** True when platform AI-Ads billing (the platform's own Stripe account) is configured. */
function billingConfigured(env) { return !!env.AI_STRIPE_SECRET_KEY; }
function billingCurrency(env) { return (env.AI_BILLING_CURRENCY || 'eur').toLowerCase(); }

export async function handleAi(db, env, request, path, url, acc) {
  // ── Entitlement + credit balance ──
  if (path === '/api/ai/addon' && request.method === 'GET') {
    const a = await getAddon(db, acc);
    return json({
      enabled: !!a.enabled, credits: a.credits, plan: a.plan || null,
      costs: COSTS,
      billing: billingConfigured(env),       // real Stripe checkout available
      selfGrant: env.AI_ALLOW_SELF_GRANT === '1',  // dev unlock available
      providers: { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, meta: metaConfigured(env) },
    });
  }

  // ── Credit packs (catalog for the buy UI) ──
  if (path === '/api/ai/packs' && request.method === 'GET') {
    return json({ packs: packCatalog(billingCurrency(env)), billing: billingConfigured(env) });
  }

  // ── Buy a credit pack: create a platform Stripe Checkout session ──
  if (path === '/api/ai/checkout' && request.method === 'POST') {
    if (!billingConfigured(env)) return err('Billing is not configured', 503);
    const b = await request.json().catch(() => ({}));
    const pack = AI_PACKS[b.pack];
    if (!pack) return err('Unknown pack', 400);
    const currency = billingCurrency(env);
    // Return to the dashboard's AI Ads view; ?ai=success triggers a balance refresh + toast.
    const base = `${url.origin}/admin/`;
    const params = {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][unit_amount]': String(pack.amount),
      'line_items[0][price_data][product_data][name]': `AI Ads — ${pack.label} (${pack.credits} credits)`,
      success_url: `${base}?ai=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}?ai=cancelled`,
      'payment_method_types[0]': 'card',
      'billing_address_collection': 'auto',
      'allow_promotion_codes': 'true',
      'metadata[kind]': 'ai_ads',
      'metadata[accountId]': acc,
      'metadata[pack]': b.pack,
      'metadata[credits]': String(pack.credits),
    };
    const { ok, json: sess } = await createCheckoutSession(env.AI_STRIPE_SECRET_KEY, params);
    if (!ok || !sess.url) return err(sess.error?.message || 'Stripe error', 400);
    return json({ url: sess.url, sessionId: sess.id });
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
      let funnelId = null, name = (b.name || '').trim().slice(0, 200), brief = {};
      if (b.funnelId) {
        const f = await getFunnelById(db, acc, b.funnelId);
        if (!f) return err('Funnel not found', 404);
        funnelId = f.id; brief = briefFromFunnel(f); if (!name) name = `Ads — ${f.name || f.slug}`;
      } else {
        brief = { name: name || 'New campaign', inputUrl: (b.url || '').trim().slice(0, 500), notes: (b.notes || '').trim().slice(0, 2000) };
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
        'SELECT id, platform, persona, headline, primary_text, cta, image_key, favorite, score, score_feedback, created_at FROM ad_creatives WHERE account_id = ? AND project_id = ? ORDER BY created_at DESC'
      ).bind(acc, project.id).all();
      const comp = await db.prepare(
        'SELECT id, source, page_name, ad_text, cta, media_url, angle, fetched_at FROM competitor_ads WHERE account_id = ? AND project_id = ? ORDER BY fetched_at DESC LIMIT 60'
      ).bind(acc, project.id).all();
      return json({
        ...projectPublic(project),
        creatives: (creatives.results || []).map(creativePublic),
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

  // ── Creative Library: all creatives for one funnel, across every ad project
  // linked to it (funnelId 'none' = free-standing projects with no funnel_id) ──
  const flm = path.match(/^\/api\/ai\/funnels\/([^/]+)\/creatives$/);
  if (flm && request.method === 'GET') {
    const funnelId = flm[1];
    if (funnelId !== 'none') {
      const f = await getFunnelById(db, acc, funnelId);
      if (!f) return err('Funnel not found', 404);
    }
    const rows = await db.prepare(
      `SELECT c.*, p.name AS project_name FROM ad_creatives c
       JOIN ad_projects p ON p.id = c.project_id
       WHERE p.account_id = ? AND (p.funnel_id = ? OR (? = 'none' AND p.funnel_id IS NULL))
       ORDER BY c.created_at DESC`
    ).bind(acc, funnelId, funnelId).all();
    return json({ results: (rows.results || []).map(creativePublic) });
  }

  // ── Quiz-copy generation: rewrite headlines/bullets/quiz-flow copy for a funnel's
  // in-scope screens in one pass (PAS/PASO/AIDA/generic). Never writes to the funnel —
  // the client applies the result into the builder's in-memory state for review. ──
  const qcm = path.match(/^\/api\/ai\/funnels\/([^/]+)\/quiz-copy$/);
  if (qcm && request.method === 'POST') {
    const funnel = await getFunnelById(db, acc, qcm[1]);
    if (!funnel) return err('Funnel not found', 404);
    const b = await request.json().catch(() => ({}));
    const framework = QUIZ_FRAMEWORKS.includes(b.framework) ? b.framework : 'generic';
    const lang = normLang(b.lang);

    let parsed = {};
    try { parsed = JSON.parse(funnel.config || '{}'); } catch (e) {}
    const allScreens = parsed.screens || [];
    const inScope = allScreens.filter((s) => QUIZ_SCREEN_FIELDS[s.type]);
    if (!inScope.length) return err('This funnel has no screens this generator supports yet', 400);

    const charge = await chargeCredits(db, acc, COSTS.quiz_copy, 'quiz_copy', funnel.id);
    if (!charge.ok) return err(charge.enabled ? 'Not enough credits' : 'AI Ads add-on is not active', 402);
    try {
      const brief = briefFromFunnel(funnel);
      brief.brandText = brandKitText(await getBrandKit(db, acc));
      const input = inScope.map((s) => {
        const fields = { id: s.id, type: s.type };
        for (const k of QUIZ_SCREEN_FIELDS[s.type]) {
          if (s[k] == null) continue;
          fields[k] = k === 'options' ? (s.options || []).map((o) => ({ label: o.label })) : s[k];
        }
        return fields;
      });
      const generated = await generateQuizCopy(env, { brief, framework, screens: input, lang });

      // Merge the model's output back onto each ORIGINAL screen (never trust it to only
      // return valid keys) so options[] keeps its value/icon, only label changes.
      const byId = new Map(allScreens.map((s) => [s.id, s]));
      const screens = [];
      for (const g of generated) {
        const orig = byId.get(g.id);
        const allow = orig && QUIZ_SCREEN_FIELDS[orig.type];
        if (!allow) continue;
        const fields = {};
        for (const k of allow) {
          if (g[k] == null) continue;
          if (k === 'options') {
            if (!Array.isArray(g.options) || !Array.isArray(orig.options)) continue;
            fields.options = orig.options.map((o, i) => (typeof g.options[i]?.label === 'string' && g.options[i].label ? { ...o, label: g.options[i].label } : o));
          } else if (k === 'steps') {
            if (!Array.isArray(g.steps) || !Array.isArray(orig.steps) || g.steps.length !== orig.steps.length) continue;
            if (!g.steps.every((x) => typeof x === 'string' && x)) continue;
            fields.steps = g.steps;
          } else if (typeof g[k] === 'string') {
            fields[k] = g[k];
          }
        }
        if (Object.keys(fields).length) screens.push({ id: g.id, fields });
      }
      return json({ screens, credits: charge.balance });
    } catch (e) {
      const credits = await refundCredits(db, acc, COSTS.quiz_copy, funnel.id);
      return json({ error: `Copy generation failed: ${e.message}`, credits }, 502);
    }
  }

  // ── Generate strategy ──
  const sm = path.match(/^\/api\/ai\/projects\/([^/]+)\/strategy$/);
  if (sm && request.method === 'POST') {
    const project = await db.prepare('SELECT * FROM ad_projects WHERE account_id = ? AND id = ?').bind(acc, sm[1]).first();
    if (!project) return err('Not found', 404);
    const b = await request.json().catch(() => ({}));
    const lang = normLang(b.lang);
    const charge = await chargeCredits(db, acc, COSTS.strategy, 'strategy', project.id);
    if (!charge.ok) return err(charge.enabled ? 'Not enough credits' : 'AI Ads add-on is not active', 402);
    try {
      const brief = await safeBrief(db, acc, project);
      const strategy = await generateStrategy(env, brief, lang);
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
    const query = (b.query || '').trim().slice(0, 200);
    if (!query) return err('Enter a search term', 400);
    const country = (b.country || 'US').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return err('Invalid country code', 400);
    const lang = normLang(b.lang);
    const charge = await chargeCredits(db, acc, COSTS.find_ads, 'find_ads', project.id);
    if (!charge.ok) return err(charge.enabled ? 'Not enough credits' : 'AI Ads add-on is not active', 402);
    try {
      const brief = await safeBrief(db, acc, project);
      const wantMeta = b.source !== 'ai';
      const wantAi = b.source !== 'meta';
      const [meta, ai] = await Promise.all([
        wantMeta ? searchAdLibrary(env, { query, country }) : Promise.resolve({ ads: [], note: null }),
        wantAi ? analyzeCompetitors(env, { brief, query, lang }).catch(() => []) : Promise.resolve([]),
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
    if (!PLATFORMS.includes(platform)) return err('Unknown platform', 400);
    const persona = (b.persona || '').trim().slice(0, 300);
    const count = Math.min(Math.max(parseInt(b.count || 3, 10), 1), 10);
    const withImages = b.images !== false;
    const lang = normLang(b.lang);

    const cost = COSTS.creative * count;
    const charge = await chargeCredits(db, acc, cost, 'creative', project.id);
    if (!charge.ok) return err(charge.enabled ? 'Not enough credits' : 'AI Ads add-on is not active', 402);
    try {
      const brief = await safeBrief(db, acc, project);
      const variants = await generateCreativeCopy(env, { brief, platform, persona, count, lang });
      const ts = nowISO();
      const saved = [];
      let imageError = null;  // first non-fatal image failure (copy still saved)
      for (const v of variants) {
        const id = randomId('crv');
        let imageKey = null;
        if (withImages && v.image_prompt && env.OPENAI_API_KEY) {
          try {
            const img = await generateImage(env, { prompt: v.image_prompt });
            imageKey = `creatives/${acc}/${id}.png`;
            await env.AD_ASSETS.put(imageKey, img.bytes, { httpMetadata: { contentType: img.contentType } });
          } catch (e) {
            imageKey = null; /* keep copy even if image fails */
            if (!imageError) imageError = e.message;
            console.error('creative image generation failed:', e.message);
          }
        } else if (withImages && !env.OPENAI_API_KEY && !imageError) {
          imageError = 'OPENAI_API_KEY not configured';
        }
        await db.prepare(
          'INSERT INTO ad_creatives (id, account_id, project_id, platform, persona, headline, primary_text, cta, image_key, favorite, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,?)'
        ).bind(id, acc, project.id, platform, persona || null, v.headline || '', v.primary_text || '', v.cta || '', imageKey, ts).run();
        saved.push({ id, platform, persona, headline: v.headline, primary_text: v.primary_text, cta: v.cta, image_key: imageKey, favorite: 0, created_at: ts });
      }
      await db.prepare('UPDATE ad_projects SET updated_at = ? WHERE account_id = ? AND id = ?').bind(ts, acc, project.id).run();
      return json({ creatives: saved, credits: charge.balance, imageError });
    } catch (e) {
      const credits = await refundCredits(db, acc, cost, project.id);
      return json({ error: `Creative generation failed: ${e.message}`, credits }, 502);
    }
  }

  // ── Export selected creatives as a ZIP (images + a copy.csv) for editors/designers.
  // Matched before the generic /creatives/:id route below so the literal segment
  // "export" is never treated as a creative id. ──
  if (path === '/api/ai/creatives/export' && request.method === 'GET') {
    const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return err('No creatives selected', 400);
    if (ids.length > EXPORT_MAX_IDS) return err(`Select at most ${EXPORT_MAX_IDS} creatives per export`, 400);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.prepare(
      `SELECT c.*, p.name AS project_name FROM ad_creatives c JOIN ad_projects p ON p.id = c.project_id
       WHERE c.account_id = ? AND c.id IN (${placeholders})`
    ).bind(acc, ...ids).all();
    const creatives = rows.results || [];
    if (!creatives.length) return err('No creatives found', 404);

    const files = {};
    let n = 0;
    for (const c of creatives) {
      n++;
      if (c.image_key) {
        try {
          const obj = await env.AD_ASSETS.get(c.image_key);
          if (obj) {
            const bytes = new Uint8Array(await obj.arrayBuffer());
            const slug = slugify(c.headline || c.id);
            files[`${String(n).padStart(2, '0')}-${c.platform || 'ad'}-${slug}.png`] = bytes;
          }
        } catch (e) { console.error('export: failed to read image', c.id, e.message); }
      }
    }
    files['copy.csv'] = new TextEncoder().encode(creativesCsv(creatives));

    const zipped = zipSync(files, { level: 6 });
    const date = nowISO().slice(0, 10);
    return new Response(zipped, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="creatives-export-${date}.zip"`,
      },
    });
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

  // ── AI-score a creative (re-runnable; independent of generation) ──
  const scm = path.match(/^\/api\/ai\/creatives\/([^/]+)\/score$/);
  if (scm && request.method === 'POST') {
    const cr = await db.prepare('SELECT * FROM ad_creatives WHERE account_id = ? AND id = ?').bind(acc, scm[1]).first();
    if (!cr) return err('Not found', 404);
    const project = await db.prepare('SELECT * FROM ad_projects WHERE account_id = ? AND id = ?').bind(acc, cr.project_id).first();
    if (!project) return err('Not found', 404);
    const b = await request.json().catch(() => ({}));
    const lang = normLang(b.lang);
    const charge = await chargeCredits(db, acc, COSTS.score, 'score', cr.id);
    if (!charge.ok) return err(charge.enabled ? 'Not enough credits' : 'AI Ads add-on is not active', 402);
    try {
      const brief = await safeBrief(db, acc, project);
      const result = await scoreCreative(env, { brief, creative: cr, lang });
      await db.prepare('UPDATE ad_creatives SET score = ?, score_feedback = ? WHERE account_id = ? AND id = ?')
        .bind(result.score, JSON.stringify({ summary: result.summary, strengths: result.strengths, improvements: result.improvements }), acc, cr.id).run();
      return json({ score: result.score, score_feedback: { summary: result.summary, strengths: result.strengths, improvements: result.improvements }, credits: charge.balance });
    } catch (e) {
      const credits = await refundCredits(db, acc, COSTS.score, cr.id);
      return json({ error: `Scoring failed: ${e.message}`, credits }, 502);
    }
  }

  // ── Brand kit (account-wide; folded into every generation prompt) ──
  if (path === '/api/ai/brand' && request.method === 'GET') {
    return json({ brand: await getBrandKit(db, acc) });
  }
  if (path === '/api/ai/brand' && request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const brand = await upsertBrandKit(db, acc, b);
    return json({ brand });
  }
  if (path === '/api/ai/brand/logo' && request.method === 'POST') {
    const ct = request.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return err('Expected an image body', 400);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 2 * 1024 * 1024) return err('Logo must be under 2MB', 400);
    const logoKey = `brand/${acc}/logo`;
    await env.AD_ASSETS.put(logoKey, bytes, { httpMetadata: { contentType: ct } });
    await setBrandLogo(db, acc, logoKey);
    return json({ ok: true });
  }
  if (path === '/api/ai/brand/logo' && request.method === 'GET') {
    const kit = await getBrandKit(db, acc);
    if (!kit.logo_key) return err('Not found', 404);
    const obj = await env.AD_ASSETS.get(kit.logo_key);
    if (!obj) return err('Not found', 404);
    return new Response(obj.body, {
      headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/png', 'Cache-Control': 'private, max-age=86400' },
    });
  }

  return err('Not found', 404);
}

/** Filesystem-safe slug for a ZIP entry name, e.g. "Meu Headline!" -> "meu-headline". */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'creative';
}

/** RFC 4180-style CSV field quoting — headline/primary_text are free-form LLM/user text. */
function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function creativesCsv(creatives) {
  const header = ['id', 'project_name', 'platform', 'persona', 'headline', 'primary_text', 'cta', 'score'];
  const lines = [header.join(',')];
  for (const c of creatives) {
    lines.push([c.id, c.project_name, c.platform, c.persona, c.headline, c.primary_text, c.cta, c.score]
      .map(csvField).join(','));
  }
  return lines.join('\r\n');
}

function creativePublic(c) {
  let score_feedback = null;
  try { score_feedback = c.score_feedback ? JSON.parse(c.score_feedback) : null; } catch (e) {}
  return { ...c, score_feedback };
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

/** Project brief plus the account's brand guidelines folded in as `brandText`, so every
 * generation call (strategy/copy/competitor-analysis/scoring) stays on-brand. */
async function safeBrief(db, acc, project) {
  let brief = {};
  try { brief = JSON.parse(project.brief || '{}'); } catch (e) {}
  if (!brief.name) brief.name = project.name;
  if (!brief.inputUrl && project.input_url) brief.inputUrl = project.input_url;
  brief.brandText = brandKitText(await getBrandKit(db, acc));
  return brief;
}
