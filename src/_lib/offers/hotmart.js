/**
 * Hotmart integration for Offer Finder.
 *
 * Hotmart's API has no public marketplace-search endpoint — it only exposes
 * products/sales the AUTHENTICATED account already owns or is affiliated with
 * (see the offer-finder plan). Auth is per-account app credentials the
 * marketer generates themselves in Hotmart under Tools > Manage Credentials
 * (Client ID / Client Secret / Basic Token) — not a redirect-based OAuth flow —
 * which are then exchanged for a short-lived access token via client_credentials.
 */

const TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const SALES_USERS_URL = 'https://developers.hotmart.com/payments/api/v1/sales/users';

export async function fetchHotmartAccessToken({ clientId, clientSecret, basicToken }) {
  const url = `${TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicToken}` },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Hotmart auth failed (${r.status}): ${body.slice(0, 200) || 'check your credentials'}`);
  }
  const data = await r.json();
  if (!data.access_token) throw new Error('Hotmart auth did not return an access token');
  return data.access_token;
}

// Products the marketer is affiliated with, derived from their own sales/commission
// history — Hotmart has no separate "my affiliate products" listing endpoint, so this
// surfaces distinct products seen in recent sales as a practical proxy.
export async function fetchHotmartAffiliateProducts(accessToken, { maxResults = 50 } = {}) {
  const r = await fetch(`${SALES_USERS_URL}?max_results=${maxResults}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Hotmart products fetch failed (${r.status}): ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  const items = data.items || [];

  const byProduct = new Map();
  for (const item of items) {
    const p = item.product || {};
    if (!p.id || byProduct.has(p.id)) continue;
    const commission = item.commission || {};
    const purchase = item.purchase || {};
    byProduct.set(p.id, {
      externalId: String(p.id),
      name: p.name || 'Untitled product',
      vendor: (item.producer || {}).name || null,
      commissionPct: typeof commission.percentage === 'number' ? commission.percentage : null,
      price: (purchase.price || {}).value ?? null,
      currency: (purchase.price || {}).currency_code ?? null,
      salesPageUrl: null,
      raw: item,
    });
  }
  return [...byProduct.values()];
}
