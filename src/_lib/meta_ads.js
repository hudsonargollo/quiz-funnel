/**
 * Meta Ad Library client (Graph API `ads_archive`).
 *
 * Requires META_ADS_TOKEN (a Meta app access/system-user token with Ad Library access).
 * Known limitation: outside the EU the API only returns political/issue ads
 * (ad_type=POLITICAL_AND_ISSUE_ADS); EU-targeted searches (ad_type=ALL) return all
 * categories. We surface that to the caller via the `note` field rather than failing.
 */
import { fetchWithRetry } from './ai.js';

const EU = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT',
  'LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
]);

const FIELDS = [
  'id', 'page_name', 'ad_creative_bodies', 'ad_creative_link_titles',
  'ad_creative_link_captions', 'ad_snapshot_url', 'publisher_platforms',
].join(',');

export function isConfigured(env) {
  return !!env.META_ADS_TOKEN;
}

/**
 * Search the Ad Library. Returns { ads: [...], note } where each ad is normalized to the
 * shape used by competitor_ads. `country` is an ISO-2 code (required by Meta).
 * `pages` follows `paging.next` up to that many pages (default 1, capped at 3) to work
 * around the single-page 50-result ceiling on one request.
 */
export async function searchAdLibrary(env, { query, country = 'US', limit = 12, pages = 1 }) {
  if (!env.META_ADS_TOKEN) return { ads: [], note: 'Meta Ad Library not configured (META_ADS_TOKEN missing).' };
  const cc = (country || 'US').toUpperCase();
  const adType = EU.has(cc) ? 'ALL' : 'POLITICAL_AND_ISSUE_ADS';
  const ver = env.META_GRAPH_VERSION || 'v21.0';
  const params = new URLSearchParams({
    search_terms: query || '',
    ad_reached_countries: `["${cc}"]`,
    ad_active_status: 'ALL',
    ad_type: adType,
    fields: FIELDS,
    limit: String(Math.min(limit, 50)),
    access_token: env.META_ADS_TOKEN,
  });
  let url = `https://graph.facebook.com/${ver}/ads_archive?${params.toString()}`;
  const maxPages = Math.min(Math.max(pages, 1), 3);

  const raw = [];
  for (let page = 0; page < maxPages && url; page++) {
    let res;
    try { res = await fetchWithRetry(url); } catch (e) { return { ads: normalize(raw), note: `Meta request failed: ${e.message}` }; }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      let msg = `Meta Ad Library error ${res.status}`;
      try { msg = JSON.parse(t)?.error?.message || msg; } catch (e) {}
      return { ads: normalize(raw), note: msg };
    }
    const data = await res.json();
    raw.push(...(data.data || []));
    if (raw.length >= limit) break;
    url = data.paging?.next || null;
  }
  const note = EU.has(cc)
    ? null
    : `${cc} is outside the EU — Meta's API only returns political/issue ads here. For full commercial coverage, search an EU country.`;
  const ads = normalize(raw.slice(0, limit));
  await attachSnapshotImages(ads);
  return { ads, note };
}

function normalize(list) {
  return list.map((a) => ({
    page_name: a.page_name || '',
    ad_text: (a.ad_creative_bodies || [])[0] || (a.ad_creative_link_titles || [])[0] || '',
    cta: (a.ad_creative_link_captions || [])[0] || '',
    media_url: a.ad_snapshot_url || '',
    image_url: null,
    raw: a,
  }));
}

class OgImageCollector {
  constructor(target) { this.target = target; }
  element(el) {
    const property = el.getAttribute('property') || el.getAttribute('name');
    if (property === 'og:image' && !this.target.imageUrl) {
      this.target.imageUrl = el.getAttribute('content') || null;
    }
  }
}

/**
 * The Ad Library API never returns a hotlinkable image — only `ad_snapshot_url`,
 * a link to Meta's own interactive preview page for that ad. This fetches each
 * snapshot page server-side and pulls its `og:image` (the same unfurl technique
 * `src/_lib/offers/clickbank.js` uses for sales pages) so callers get a real,
 * renderable thumbnail. Best-effort: one ad's fetch failing (timeout, blocked,
 * video-only ad with no static og:image) never fails the whole search — it just
 * leaves that ad's `image_url` null, same as today's behavior.
 */
async function attachSnapshotImages(ads) {
  await Promise.all(ads.map(async (a) => {
    if (!a.media_url) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const r = await fetch(a.media_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TektoneAdPreview/1.0)' },
        signal: controller.signal,
      });
      if (!r.ok) return;
      const meta = { imageUrl: null };
      await new HTMLRewriter().on('meta', new OgImageCollector(meta)).transform(r).arrayBuffer();
      a.image_url = meta.imageUrl;
    } catch (e) {
      // network error, timeout, or blocked fetch — leave image_url null
    } finally {
      clearTimeout(timeout);
    }
  }));
}
