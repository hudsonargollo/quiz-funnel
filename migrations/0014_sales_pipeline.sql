-- 0014_sales_pipeline.sql
-- Sales Pipeline: a human-worked overlay on top of the fully-automated
-- leads/events/funnel_state machine (src/_lib/crm.js), which is untouched by
-- this migration. A pipeline lead can be promoted from an existing automated
-- lead (lead_user_id set) or created independently (e.g. from a future AI
-- Video Ad Creator lead source). Shape mirrors tektone-app's CRM pipeline
-- (new/contacted/qualified/won/lost + an audit log + a deal table), with the
-- Tektone-specific bits (incomplete status, BRL default, fixed commissions)
-- deliberately dropped as not general to this platform.

CREATE TABLE IF NOT EXISTS pipeline_leads (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  lead_user_id   TEXT,                       -- soft-link to leads.user_id when promoted; null if created independently
  funnel_id      TEXT,                       -- optional soft-link, same convention as discovered_offers.funnel_id
  status         TEXT NOT NULL DEFAULT 'new', -- new | contacted | qualified | won | lost
  source         TEXT NOT NULL DEFAULT 'manual', -- manual | promoted | video_ad_creator
  name           TEXT,
  email          TEXT,
  phone          TEXT,
  qualification  TEXT,                       -- free-form JSON notes, no rigid score/tier columns
  assigned_email TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_account_status ON pipeline_leads(account_id, status);
CREATE INDEX IF NOT EXISTS idx_pipeline_leads_account_created ON pipeline_leads(account_id, created_at);

-- Append-only audit trail, mirrors tektone-app's lead_events shape.
CREATE TABLE IF NOT EXISTS pipeline_lead_events (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL,
  pipeline_lead_id TEXT NOT NULL,
  type             TEXT NOT NULL,
  payload          TEXT,                     -- JSON
  actor_email      TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_lead_events_lead ON pipeline_lead_events(account_id, pipeline_lead_id);

-- Deal/close tracking. No commissions table — Tektone's fixed 10%-to-one-person
-- rule isn't a general platform concept.
CREATE TABLE IF NOT EXISTS pipeline_sales (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL,
  pipeline_lead_id TEXT NOT NULL,
  closer_email     TEXT,
  amount           REAL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  status           TEXT,
  payment_ref      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_sales_lead ON pipeline_sales(account_id, pipeline_lead_id);
