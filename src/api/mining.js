/**
 * Product Mining endpoints (/api/mining/*). Mounted from handleAdmin after the session
 * is resolved, so `acc` is already the authenticated account id — same owner-only gate
 * as AI Ads. Search is a live, stateless proxy over the Meta Ad Library (no DB write, no
 * credit charge — it's a free platform feature, not gated behind the AI Ads add-on).
 * Only explicitly-saved items are persisted; that saved set doubles as both the
 * favorites system and the visual swipe file/moodboard.
 */
import { json, err } from '../_lib/http.js';
import { randomId } from '../_lib/crypto.js';
import { createFunnel, updateFunnel, normalizeSlug } from '../_lib/funnels.js';
import { searchAdLibrary } from '../_lib/meta_ads.js';

const nowISO = () => new Date().toISOString();

function productPublic(p) {
  let raw = null;
  try { raw = p.raw ? JSON.parse(p.raw) : null; } catch (e) {}
  return { ...p, raw };
}

export async function handleMining(db, env, request, path, url, acc) {
  // ── Live search (no persistence) ──
  if (path === '/api/mining/search' && request.method === 'GET') {
    const query = (url.searchParams.get('query') || '').trim().slice(0, 200);
    if (!query) return err('Enter a search term', 400);
    const country = (url.searchParams.get('country') || 'US').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return err('Invalid country code', 400);
    const { ads, note } = await searchAdLibrary(env, { query, country, limit: 24 });
    return json({ ads, note });
  }

  // ── Saved products (the favorites / swipe file) ──
  if (path === '/api/mining/products') {
    if (request.method === 'GET') {
      const category = (url.searchParams.get('category') || '').trim();
      const rows = category
        ? await db.prepare('SELECT * FROM mined_products WHERE account_id = ? AND category = ? ORDER BY created_at DESC').bind(acc, category).all()
        : await db.prepare('SELECT * FROM mined_products WHERE account_id = ? ORDER BY created_at DESC').bind(acc).all();
      return json({ results: (rows.results || []).map(productPublic) });
    }
    if (request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const id = randomId('min');
      const ts = nowISO();
      await db.prepare(
        `INSERT INTO mined_products (id, account_id, source, page_name, ad_text, cta, media_url, image_url, category, raw, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, acc, 'meta',
        (b.page_name || '').slice(0, 200), (b.ad_text || '').slice(0, 2000), (b.cta || '').slice(0, 100), (b.media_url || '').slice(0, 1000),
        (b.image_url || '').slice(0, 1000) || null,
        (b.category || '').trim().slice(0, 60) || null,
        b.raw ? JSON.stringify(b.raw).slice(0, 20000) : null,
        ts, ts,
      ).run();
      return json({ id, created_at: ts }, 201);
    }
  }

  const pm = path.match(/^\/api\/mining\/products\/([^/]+)$/);
  if (pm) {
    const prod = await db.prepare('SELECT * FROM mined_products WHERE account_id = ? AND id = ?').bind(acc, pm[1]).first();
    if (!prod) return err('Not found', 404);
    if (request.method === 'PATCH') {
      const b = await request.json().catch(() => ({}));
      const sets = [], binds = [];
      for (const col of ['page_name', 'ad_text', 'cta', 'category']) {
        if (b[col] != null) { sets.push(`${col} = ?`); binds.push(String(b[col]).slice(0, col === 'ad_text' ? 2000 : 200) || null); }
      }
      if (!sets.length) return json({ ok: true });
      sets.push('updated_at = ?'); binds.push(nowISO());
      binds.push(acc, prod.id);
      await db.prepare(`UPDATE mined_products SET ${sets.join(', ')} WHERE account_id = ? AND id = ?`).bind(...binds).run();
      return json({ ok: true });
    }
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM mined_products WHERE account_id = ? AND id = ?').bind(acc, prod.id).run();
      return json({ ok: true });
    }
  }

  // ── 1-click "turn into funnel" ──
  const cvm = path.match(/^\/api\/mining\/products\/([^/]+)\/convert$/);
  if (cvm && request.method === 'POST') {
    const prod = await db.prepare('SELECT * FROM mined_products WHERE account_id = ? AND id = ?').bind(acc, cvm[1]).first();
    if (!prod) return err('Not found', 404);
    const b = await request.json().catch(() => ({}));
    const type = ['quiz', 'optin', 'vsl'].includes(b.type) ? b.type : 'quiz';
    const name = `Produto — ${prod.page_name || 'Mineração'}`.slice(0, 200);

    const base = normalizeSlug(prod.page_name) || 'produto';
    let created = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 34)}-${randomId('', 3)}`;
      const r = await createFunnel(db, acc, { name, type, slug });
      if (!r.error) { created = r; break; }
      if (r.status !== 409) return err(r.error, r.status);
      // 409 = slug taken, retry with a suffix
    }
    if (!created) return err('Could not generate a unique slug — try again', 500);

    if (prod.page_name) {
      const f = await db.prepare('SELECT config FROM funnels WHERE id = ?').bind(created.id).first();
      let cfg = {};
      try { cfg = JSON.parse(f.config || '{}'); } catch (e) {}
      cfg.config = { ...(cfg.config || {}), productName: prod.page_name };
      await updateFunnel(db, acc, created.id, { config: cfg }, env.SECRETS_KEY);
    }

    await db.prepare('UPDATE mined_products SET funnel_id = ?, updated_at = ? WHERE account_id = ? AND id = ?')
      .bind(created.id, nowISO(), acc, prod.id).run();

    return json({ funnelId: created.id, slug: created.slug }, 201);
  }

  return err('Not found', 404);
}
