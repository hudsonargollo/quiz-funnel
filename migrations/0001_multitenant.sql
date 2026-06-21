-- 0001_multitenant.sql
-- Turns the single-funnel CRM into a multi-tenant platform.
-- Additive only: new tables + ADD COLUMN + indexes (no PK/table rebuild).

-- ── Tenants & auth ─────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner',
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── Funnels ────────────────────────────────────
CREATE TABLE IF NOT EXISTS funnels (
  id                        TEXT PRIMARY KEY,
  account_id                TEXT NOT NULL,
  slug                      TEXT NOT NULL,
  name                      TEXT,
  type                      TEXT NOT NULL DEFAULT 'quiz',   -- quiz | optin | vsl
  status                    TEXT NOT NULL DEFAULT 'draft',  -- draft | published
  config                    TEXT NOT NULL,                  -- JSON { screens, config }
  post_purchase_url         TEXT,
  stripe_secret_enc         TEXT,
  stripe_price_id           TEXT,
  stripe_publishable_key    TEXT,
  stripe_webhook_secret_enc TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_funnels_slug ON funnels(slug);
CREATE INDEX IF NOT EXISTS idx_funnels_account ON funnels(account_id);

-- ── Multi-tenant dimension on existing tables ──
ALTER TABLE leads  ADD COLUMN account_id TEXT;
ALTER TABLE leads  ADD COLUMN funnel_id  TEXT;
ALTER TABLE events ADD COLUMN account_id TEXT;
ALTER TABLE events ADD COLUMN funnel_id  TEXT;

-- Per-account lead identity (NULLs are distinct in SQLite, so anonymous rows are fine)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_account_email ON leads(account_id, email);
CREATE INDEX IF NOT EXISTS idx_leads_account_funnel ON leads(account_id, funnel_id);
CREATE INDEX IF NOT EXISTS idx_leads_account_updated ON leads(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_leads_account_state ON leads(account_id, funnel_state);
CREATE INDEX IF NOT EXISTS idx_events_account_funnel ON events(account_id, funnel_id, event);
