-- 0008_product_mining.sql
-- Milestone 3: standalone product-mining module. Search stays live (Meta Ad Library,
-- stateless, no DB write); only what a user explicitly saves is persisted here — that
-- saved set doubles as both the "favorites" system and the visual swipe file/moodboard.
-- Additive only.

CREATE TABLE IF NOT EXISTS mined_products (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'meta',   -- future sources plug in here
  page_name     TEXT,
  ad_text       TEXT,
  cta           TEXT,
  media_url     TEXT,
  category      TEXT,                            -- free-text tag, user-defined
  funnel_id     TEXT,                             -- set once "turn into funnel" is used
  raw           TEXT,                             -- original Graph API object (JSON)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mined_account ON mined_products(account_id, created_at);
