-- 0010_fb_pixel.sql
-- Per-funnel Meta (Facebook) Pixel + Conversions API support.
-- fb_pixel_id is public (it's already visible in every page's client-side script tag).
-- fb_access_token_enc is a CAPI access token, encrypted at rest like the Stripe secrets.

ALTER TABLE funnels ADD COLUMN fb_pixel_id TEXT;
ALTER TABLE funnels ADD COLUMN fb_access_token_enc TEXT;
