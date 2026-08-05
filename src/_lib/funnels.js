/**
 * Funnel resolution (by host/slug) + per-account CRUD.
 */
import { randomId, encryptSecret } from './crypto.js';
import { templateFor } from '../templates.js';

function nowISO() { return new Date().toISOString(); }

// Slugs that would collide with platform paths (see RESERVED in src/index.js).
const RESERVED_SLUGS = new Set([
  'api', 'admin', 'css', 'js', 'assets', 'privacidade', 'app',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'index.html',
]);

export async function getFunnelBySlug(db, slug) {
  if (!slug) return null;
  return db.prepare('SELECT * FROM funnels WHERE slug = ?').bind(slug).first();
}

/** Resolve a custom domain (hostname) to its funnel's slug, or null. */
export async function getSlugByHostname(db, hostname) {
  if (!hostname) return null;
  const row = await db
    .prepare('SELECT f.slug FROM domains d JOIN funnels f ON f.id = d.funnel_id WHERE d.hostname = ? LIMIT 1')
    .bind(hostname.toLowerCase())
    .first();
  return row?.slug || null;
}

export async function getFunnelById(db, accountId, id) {
  return db.prepare('SELECT * FROM funnels WHERE account_id = ? AND id = ?').bind(accountId, id).first();
}

export async function listFunnels(db, accountId) {
  const r = await db.prepare(
    `SELECT f.id, f.slug, f.name, f.type, f.status, f.created_at, f.updated_at,
            (f.stripe_secret_enc IS NOT NULL) AS has_stripe,
            (SELECT COUNT(*) FROM leads l WHERE l.funnel_id = f.id) AS lead_count,
            (SELECT COUNT(*) FROM leads l WHERE l.funnel_id = f.id AND l.funnel_state = 'purchase_completed') AS purchase_count
     FROM funnels f WHERE f.account_id = ? ORDER BY f.updated_at DESC`
  ).bind(accountId).all();
  return r.results || [];
}

export async function createFunnel(db, accountId, { name, type, slug }) {
  type = ['quiz', 'optin', 'vsl'].includes(type) ? type : 'quiz';
  slug = normalizeSlug(slug);
  if (!slug) return { error: 'A valid slug is required', status: 400 };
  if (RESERVED_SLUGS.has(slug)) return { error: 'That slug is reserved', status: 409 };
  const taken = await db.prepare('SELECT id FROM funnels WHERE slug = ?').bind(slug).first();
  if (taken) return { error: 'That slug is already taken', status: 409 };

  const tmpl = templateFor(type);
  const id = randomId('fnl');
  const ts = nowISO();
  const config = JSON.stringify({ config: tmpl.config, screens: tmpl.screens });
  await db.prepare(
    `INSERT INTO funnels (id, account_id, slug, name, type, status, config, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(id, accountId, slug, name || tmpl.name, type, 'draft', config, ts, ts).run();
  return { id, slug, type };
}

export async function updateFunnel(db, accountId, id, patch, secretsKey) {
  const f = await getFunnelById(db, accountId, id);
  if (!f) return { error: 'Not found', status: 404 };

  const sets = [], binds = [];
  const set = (col, val) => { sets.push(`${col} = ?`); binds.push(val); };

  if (patch.name != null) set('name', patch.name);
  if (patch.status && ['draft', 'published'].includes(patch.status)) set('status', patch.status);
  if (patch.post_purchase_url != null) set('post_purchase_url', patch.post_purchase_url);
  if (patch.config != null) {
    const cfg = typeof patch.config === 'string' ? patch.config : JSON.stringify(patch.config);
    try { JSON.parse(cfg); } catch (e) { return { error: 'config must be valid JSON', status: 400 }; }
    set('config', cfg);
  }
  if (patch.slug != null) {
    const slug = normalizeSlug(patch.slug);
    if (!slug) return { error: 'Invalid slug', status: 400 };
    if (RESERVED_SLUGS.has(slug)) return { error: 'That slug is reserved', status: 409 };
    const taken = await db.prepare('SELECT id FROM funnels WHERE slug = ? AND id != ?').bind(slug, id).first();
    if (taken) return { error: 'Slug already taken', status: 409 };
    set('slug', slug);
  }
  // Stripe settings (secrets encrypted at rest)
  if (patch.stripe_price_id != null) set('stripe_price_id', patch.stripe_price_id);
  if (patch.stripe_publishable_key != null) set('stripe_publishable_key', patch.stripe_publishable_key);
  if (patch.stripe_secret_key) set('stripe_secret_enc', await encryptSecret(patch.stripe_secret_key, secretsKey));
  if (patch.stripe_webhook_secret) set('stripe_webhook_secret_enc', await encryptSecret(patch.stripe_webhook_secret, secretsKey));
  // Meta Pixel / Conversions API (token encrypted at rest, same as Stripe secrets)
  if (patch.fb_pixel_id != null) set('fb_pixel_id', patch.fb_pixel_id || null);
  if (patch.fb_access_token) set('fb_access_token_enc', await encryptSecret(patch.fb_access_token, secretsKey));

  if (!sets.length) return { ok: true };
  set('updated_at', nowISO());
  binds.push(accountId, id);
  await db.prepare(`UPDATE funnels SET ${sets.join(', ')} WHERE account_id = ? AND id = ?`).bind(...binds).run();
  return { ok: true };
}

export async function deleteFunnel(db, accountId, id) {
  await db.prepare('DELETE FROM funnels WHERE account_id = ? AND id = ?').bind(accountId, id).run();
  return { ok: true };
}

export function normalizeSlug(s) {
  return (s || '').toString().toLowerCase().trim()
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// Public-safe funnel payload (no secrets) for rendering.
export function publicFunnel(f) {
  let parsed = { config: {}, screens: [] };
  try { parsed = JSON.parse(f.config); } catch (e) { /* ignore */ }
  return {
    funnelId: f.id, accountId: f.account_id, type: f.type, slug: f.slug,
    status: f.status, name: f.name,
    config: parsed.config || {}, screens: parsed.screens || [],
    stripePublishableKey: f.stripe_publishable_key || null,
    postPurchaseUrl: f.post_purchase_url || null,
    fbPixelId: f.fb_pixel_id || null,
  };
}
