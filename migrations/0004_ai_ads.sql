-- 0004_ai_ads.sql
-- AI Ads add-on: entitlement + credit balance, ad campaign projects, generated
-- creatives, and discovered competitor ads. Additive only (new tables + indexes),
-- all account-scoped to match the multi-tenant model in 0001.

-- ── Add-on entitlement + credit wallet (one row per account) ──
CREATE TABLE IF NOT EXISTS ai_addons (
  account_id            TEXT PRIMARY KEY,
  enabled               INTEGER NOT NULL DEFAULT 0,   -- 0 = locked (upsell), 1 = active
  credits               INTEGER NOT NULL DEFAULT 0,   -- remaining generation credits
  plan                  TEXT,                          -- e.g. 'starter' | 'pro' (informational)
  stripe_subscription_id TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

-- ── Credit ledger (audit trail of grants/charges/refunds) ──
CREATE TABLE IF NOT EXISTS ai_credit_ledger (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  delta       INTEGER NOT NULL,   -- +grant / -charge
  reason      TEXT,               -- 'grant' | 'strategy' | 'find_ads' | 'creative' | 'refund'
  ref         TEXT,               -- related project/creative id
  balance     INTEGER,            -- balance after this entry
  ts          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ai_credit_ledger(account_id, ts);

-- ── Ad campaign "projects" (one workspace per campaign) ──
CREATE TABLE IF NOT EXISTS ad_projects (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  funnel_id   TEXT,               -- optional link to a funnel (reuses its product context)
  name        TEXT,
  input_url   TEXT,               -- pasted URL/brief when not funnel-linked
  brief       TEXT,               -- JSON: extracted/derived product brief
  strategy    TEXT,               -- JSON: generated strategy (readiness, personas, funnel, budget, copy)
  status      TEXT NOT NULL DEFAULT 'draft',  -- draft | ready
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ad_projects_account ON ad_projects(account_id, updated_at);

-- ── Generated ad creatives (copy + AI image, stored in R2) ──
CREATE TABLE IF NOT EXISTS ad_creatives (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  platform      TEXT,             -- meta | google | tiktok | linkedin | youtube | pinterest
  persona       TEXT,             -- which persona this targets (free text)
  headline      TEXT,
  primary_text  TEXT,
  cta           TEXT,
  image_key     TEXT,             -- R2 object key (null if copy-only / image failed)
  favorite      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_project ON ad_creatives(account_id, project_id, created_at);

-- ── Discovered competitor ads (Meta Ad Library + AI analysis) ──
CREATE TABLE IF NOT EXISTS competitor_ads (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  source      TEXT NOT NULL,      -- 'meta' | 'ai'
  page_name   TEXT,               -- advertiser / page
  ad_text     TEXT,
  cta         TEXT,
  media_url   TEXT,               -- creative image/video URL (Meta-hosted) when available
  angle       TEXT,               -- AI-derived angle/insight
  raw         TEXT,               -- JSON: original payload
  fetched_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_competitor_ads_project ON competitor_ads(account_id, project_id, fetched_at);
