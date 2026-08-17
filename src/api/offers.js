/**
 * Offer Finder endpoints (/api/offers/*). Mounted from handleAdmin after the
 * session is resolved, same owner-only gate as AI Ads / Product Mining.
 *
 * Neither Hotmart nor ClickBank exposes a public marketplace-search API (see
 * the offer-finder plan), so this is capture-and-organize, not live search:
 * Hotmart pulls from the marketer's own connected account; ClickBank is a
 * paste-a-link preview import. Both land in the same `discovered_offers`
 * table and share the same "convert to funnel" flow as Product Mining.
 */
import { json, err } from '../_lib/http.js';
import { randomId, encryptSecret, decryptSecret } from '../_lib/crypto.js';
import { createFunnel, updateFunnel, normalizeSlug } from '../_lib/funnels.js';
import { fetchHotmartAccessToken, fetchHotmartAffiliateProducts } from '../_lib/offers/hotmart.js';
import { fetchSalesPageMetadata } from '../_lib/offers/clickbank.js';

const nowISO = () => new Date().toISOString();

function offerPublic(o) {
  let raw = null;
  try { raw = o.raw ? JSON.parse(o.raw) : null; } catch (e) {}
  return { ...o, raw };
}

async function upsertOffer(db, acc, network, item) {
  const ts = nowISO();
  if (item.externalId) {
    const existing = await db.prepare(
      'SELECT id FROM discovered_offers WHERE account_id = ? AND network = ? AND external_id = ?'
    ).bind(acc, network, item.externalId).first();
    if (existing) {
      await db.prepare(
        `UPDATE discovered_offers SET name=?, vendor=?, commission_pct=?, price=?, currency=?, gravity=?,
           sales_page_url=?, image_url=?, raw=?, updated_at=? WHERE id=?`
      ).bind(
        item.name || null, item.vendor || null, item.commissionPct ?? null, item.price ?? null, item.currency ?? null,
        item.gravity ?? null, item.salesPageUrl || null, item.imageUrl || null,
        item.raw ? JSON.stringify(item.raw).slice(0, 20000) : null, ts, existing.id,
      ).run();
      return existing.id;
    }
  }
  const id = randomId('off');
  await db.prepare(
    `INSERT INTO discovered_offers
      (id, account_id, network, external_id, name, vendor, commission_pct, price, currency, gravity,
       sales_page_url, affiliate_link, image_url, category, raw, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, acc, network, item.externalId || null, item.name || null, item.vendor || null,
    item.commissionPct ?? null, item.price ?? null, item.currency ?? null, item.gravity ?? null,
    item.salesPageUrl || null, item.affiliateLink || null, item.imageUrl || null, item.category || null,
    item.raw ? JSON.stringify(item.raw).slice(0, 20000) : null, ts, ts,
  ).run();
  return id;
}

export async function handleOffers(db, env, request, path, url, acc) {
  // ── Saved offers list ──
  if (path === '/api/offers' && request.method === 'GET') {
    const network = (url.searchParams.get('network') || '').trim();
    const rows = network
      ? await db.prepare('SELECT * FROM discovered_offers WHERE account_id = ? AND network = ? ORDER BY created_at DESC').bind(acc, network).all()
      : await db.prepare('SELECT * FROM discovered_offers WHERE account_id = ? ORDER BY created_at DESC').bind(acc).all();
    return json({ results: (rows.results || []).map(offerPublic) });
  }

  const del = path.match(/^\/api\/offers\/([^/]+)$/);
  if (del && request.method === 'DELETE') {
    await db.prepare('DELETE FROM discovered_offers WHERE account_id = ? AND id = ?').bind(acc, del[1]).run();
    return json({ ok: true });
  }

  // ── Hotmart: connection status ──
  if (path === '/api/offers/hotmart/status' && request.method === 'GET') {
    const conn = await db.prepare('SELECT status, last_synced_at FROM network_connections WHERE account_id = ? AND network = ?').bind(acc, 'hotmart').first();
    return json({ connected: !!conn, status: conn?.status || null, lastSyncedAt: conn?.last_synced_at || null });
  }

  // ── Hotmart: save the marketer's own app credentials (encrypted) ──
  if (path === '/api/offers/hotmart/connect' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const { clientId, clientSecret, basicToken } = b;
    if (!clientId || !clientSecret || !basicToken) return err('clientId, clientSecret and basicToken are all required', 400);
    // Validate the credentials actually work before saving them.
    try {
      await fetchHotmartAccessToken({ clientId, clientSecret, basicToken });
    } catch (e) {
      return err(String(e.message || e), 400);
    }
    const ts = nowISO();
    const clientIdEnc = await encryptSecret(clientId, env.SECRETS_KEY);
    const clientSecretEnc = await encryptSecret(clientSecret, env.SECRETS_KEY);
    const basicTokenEnc = await encryptSecret(basicToken, env.SECRETS_KEY);
    await db.prepare(
      `INSERT INTO network_connections (account_id, network, client_id_enc, client_secret_enc, basic_token_enc, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(account_id, network) DO UPDATE SET
         client_id_enc=excluded.client_id_enc, client_secret_enc=excluded.client_secret_enc,
         basic_token_enc=excluded.basic_token_enc, status='connected', updated_at=excluded.updated_at`
    ).bind(acc, 'hotmart', clientIdEnc, clientSecretEnc, basicTokenEnc, 'connected', ts, ts).run();
    return json({ ok: true });
  }

  // ── Hotmart: disconnect ──
  if (path === '/api/offers/hotmart/disconnect' && request.method === 'POST') {
    await db.prepare('DELETE FROM network_connections WHERE account_id = ? AND network = ?').bind(acc, 'hotmart').run();
    return json({ ok: true });
  }

  // ── Hotmart: pull products from the connected account into discovered_offers ──
  if (path === '/api/offers/hotmart/sync' && request.method === 'POST') {
    const conn = await db.prepare('SELECT * FROM network_connections WHERE account_id = ? AND network = ?').bind(acc, 'hotmart').first();
    if (!conn) return err('Connect your Hotmart account first', 400);
    const clientId = await decryptSecret(conn.client_id_enc, env.SECRETS_KEY);
    const clientSecret = await decryptSecret(conn.client_secret_enc, env.SECRETS_KEY);
    const basicToken = await decryptSecret(conn.basic_token_enc, env.SECRETS_KEY);
    let items;
    try {
      const accessToken = await fetchHotmartAccessToken({ clientId, clientSecret, basicToken });
      items = await fetchHotmartAffiliateProducts(accessToken);
    } catch (e) {
      return err(String(e.message || e), 502);
    }
    const ids = [];
    for (const item of items) ids.push(await upsertOffer(db, acc, 'hotmart', item));
    await db.prepare('UPDATE network_connections SET last_synced_at = ? WHERE account_id = ? AND network = ?')
      .bind(nowISO(), acc, 'hotmart').run();
    return json({ synced: ids.length });
  }

  // ── ClickBank: paste-a-link preview import ──
  if (path === '/api/offers/clickbank/import' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    if (!b.url) return err('Paste a ClickBank sales-page URL', 400);
    let meta;
    try {
      meta = await fetchSalesPageMetadata(b.url);
    } catch (e) {
      return err(String(e.message || e), 400);
    }
    const id = await upsertOffer(db, acc, 'clickbank', meta);
    return json({ id }, 201);
  }

  // ── 1-click "convert to funnel" — mirrors Product Mining's convert ──
  const cvm = path.match(/^\/api\/offers\/([^/]+)\/convert$/);
  if (cvm && request.method === 'POST') {
    const offer = await db.prepare('SELECT * FROM discovered_offers WHERE account_id = ? AND id = ?').bind(acc, cvm[1]).first();
    if (!offer) return err('Not found', 404);
    const b = await request.json().catch(() => ({}));
    const type = ['quiz', 'optin', 'vsl'].includes(b.type) ? b.type : 'quiz';
    const name = `Offer — ${offer.name || 'Untitled'}`.slice(0, 200);

    const base = normalizeSlug(offer.name) || 'offer';
    let created = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 34)}-${randomId('', 3)}`;
      const r = await createFunnel(db, acc, { name, type, slug });
      if (!r.error) { created = r; break; }
      if (r.status !== 409) return err(r.error, r.status);
    }
    if (!created) return err('Could not generate a unique slug — try again', 500);

    const f = await db.prepare('SELECT config FROM funnels WHERE id = ?').bind(created.id).first();
    let cfg = {};
    try { cfg = JSON.parse(f.config || '{}'); } catch (e) {}
    cfg.config = {
      ...(cfg.config || {}),
      productName: offer.name || undefined,
      productPrice: offer.price || undefined,
      currency: offer.currency || undefined,
      checkoutUrl: offer.affiliate_link || offer.sales_page_url || undefined,
    };
    await updateFunnel(db, acc, created.id, { config: cfg }, env.SECRETS_KEY);

    await db.prepare('UPDATE discovered_offers SET funnel_id = ?, updated_at = ? WHERE account_id = ? AND id = ?')
      .bind(created.id, nowISO(), acc, offer.id).run();

    return json({ funnelId: created.id, slug: created.slug }, 201);
  }

  return err('Not found', 404);
}
