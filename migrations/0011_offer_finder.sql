-- 0011_offer_finder.sql
-- Offer Finder: lets affiliate-marketer accounts capture products from Hotmart
-- (their own connected affiliate account) and ClickBank (paste-a-link import —
-- neither network exposes a public marketplace-search API, see CHANGELOG/plan)
-- and turn a saved offer into a funnel with one click, mirroring mined_products.

CREATE TABLE IF NOT EXISTS discovered_offers (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  network        TEXT NOT NULL,              -- 'hotmart' | 'clickbank'
  external_id    TEXT,                       -- Hotmart product id; null for clickbank imports
  name           TEXT,
  vendor         TEXT,
  commission_pct REAL,
  price          REAL,
  currency       TEXT,
  gravity        REAL,                       -- ClickBank-only metric; null for Hotmart
  sales_page_url TEXT,
  affiliate_link TEXT,
  image_url      TEXT,
  category       TEXT,
  raw            TEXT,                       -- original API/import payload (JSON)
  funnel_id      TEXT,                       -- set once "convert to funnel" is used
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offers_account ON discovered_offers(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_offers_network ON discovered_offers(account_id, network);

-- Per-account network credentials (Hotmart's API uses per-account app credentials
-- the marketer generates themselves in Hotmart's Tools > Manage Credentials — not
-- a redirect-based OAuth flow). Encrypted with SECRETS_KEY, same pattern as
-- funnels.stripe_secret_enc / funnels.fb_access_token_enc.
CREATE TABLE IF NOT EXISTS network_connections (
  account_id        TEXT NOT NULL,
  network           TEXT NOT NULL,           -- 'hotmart'
  client_id_enc     TEXT,
  client_secret_enc TEXT,
  basic_token_enc   TEXT,
  status            TEXT NOT NULL DEFAULT 'connected',
  last_synced_at    TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (account_id, network)
);
