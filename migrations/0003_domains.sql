-- 0003_domains.sql — custom domains (Cloudflare for SaaS custom hostnames)
CREATE TABLE IF NOT EXISTS domains (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  funnel_id      TEXT NOT NULL,
  hostname       TEXT NOT NULL,
  cf_hostname_id TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending | active | error
  ssl_status     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_hostname ON domains(hostname);
CREATE INDEX IF NOT EXISTS idx_domains_account ON domains(account_id);
CREATE INDEX IF NOT EXISTS idx_domains_funnel ON domains(funnel_id);
