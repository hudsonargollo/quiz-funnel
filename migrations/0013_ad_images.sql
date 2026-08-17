-- 0013_ad_images.sql
-- Meta's public Ad Library API (ads_archive) never returns a raw image field —
-- only ad_snapshot_url, a link to an interactive preview PAGE, not a hotlinkable
-- image. `competitor_ads.media_url`/`mined_products.media_url` were being
-- populated with that page URL and never rendered as an <img> (the frontend
-- correctly showed a "View ad" link instead). image_url now holds a real,
-- directly-renderable image extracted server-side from that snapshot page's
-- markup (og:image), same technique already used for ClickBank sales-page
-- unfurling (src/_lib/offers/clickbank.js). Nullable: extraction can fail for
-- video-only ads or if Meta changes its snapshot page markup.
ALTER TABLE competitor_ads ADD COLUMN image_url TEXT;
ALTER TABLE mined_products ADD COLUMN image_url TEXT;

-- Generated ad-creative images (OpenAI) failed silently with no retry path —
-- the prompt used to generate the image was never persisted, only held in
-- memory for the single generation call. Storing it lets a "Retry image"
-- action regenerate with the exact original prompt instead of guessing one
-- from the saved headline/body copy.
ALTER TABLE ad_creatives ADD COLUMN image_prompt TEXT;
