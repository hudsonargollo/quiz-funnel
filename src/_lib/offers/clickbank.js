/**
 * ClickBank integration for Offer Finder.
 *
 * ClickBank has no public marketplace-search API and its marketplace ToS treats
 * automated browsing/scraping as a gray area (already flagged once in
 * CHANGELOG.md) — so this does NOT crawl the marketplace. It only fetches the
 * single sales-page URL a marketer explicitly pastes in (their own discovery,
 * not ours) and reads its public Open Graph metadata for a preview, the same
 * as any link-unfurling feature (Slack, Twitter, etc.) would.
 */

class MetaCollector {
  constructor(target) {
    this.target = target;
  }
  element(el) {
    const property = el.getAttribute('property') || el.getAttribute('name');
    const content = el.getAttribute('content');
    if (!property || !content) return;
    if (property === 'og:title') this.target.name = content;
    if (property === 'og:description') this.target.description = content;
    if (property === 'og:image') this.target.imageUrl = content;
    if (property === 'og:price:amount') this.target.price = parseFloat(content) || null;
    if (property === 'og:price:currency') this.target.currency = content;
  }
}

export async function fetchSalesPageMetadata(pageUrl) {
  let parsed;
  try {
    parsed = new URL(pageUrl);
  } catch {
    throw new Error('Enter a valid URL');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Enter a valid http(s) URL');

  const r = await fetch(parsed.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TektoneOfferPreview/1.0)' },
  });
  if (!r.ok) throw new Error(`Could not fetch that page (${r.status})`);

  const meta = { name: null, description: null, imageUrl: null, price: null, currency: null };
  const rewriter = new HTMLRewriter().on('meta', new MetaCollector(meta));
  // Drain the rewritten stream to force HTMLRewriter to actually run.
  await rewriter.transform(r).arrayBuffer();

  return {
    externalId: null,
    name: meta.name || parsed.hostname,
    vendor: parsed.hostname,
    commissionPct: null,
    price: meta.price,
    currency: meta.currency,
    salesPageUrl: parsed.toString(),
    imageUrl: meta.imageUrl,
    raw: meta,
  };
}
