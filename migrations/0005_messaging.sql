-- 0005_messaging.sql
-- Outbound messaging log for funnel deliverables and (future) follow-up
-- sequences. Channel-agnostic by design: `channel` is 'email' today, with
-- 'whatsapp' / 'instagram' slotting in via the same table + dispatch layer.
-- Additive only; account-scoped to match the multi-tenant model in 0001.

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  funnel_id    TEXT,
  user_id      TEXT,                 -- the lead this was sent to (leads.user_id)
  channel      TEXT NOT NULL DEFAULT 'email',   -- email | whatsapp | instagram
  provider     TEXT,                 -- resend | meta_whatsapp | meta_instagram
  template     TEXT NOT NULL,        -- 'deliverable' | 'followup' | 'test' | ...
  to_addr      TEXT,                 -- email address / phone / IG-scoped id
  subject      TEXT,
  status       TEXT NOT NULL DEFAULT 'queued',  -- queued|sent|delivered|bounced|complaint|failed
  provider_id  TEXT,                 -- provider's message id (for webhook reconciliation)
  error        TEXT,                 -- last error message when status=failed
  meta         TEXT,                 -- JSON: arbitrary context (deliverable url, etc.)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_provider ON messages(provider_id);

-- Idempotency: at most one deliverable per (account, funnel, lead, channel).
-- The send path uses INSERT OR IGNORE against this index — a second opt-in
-- upsert for the same lead is a no-op rather than a duplicate send.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_deliverable
  ON messages(account_id, funnel_id, user_id, channel)
  WHERE template = 'deliverable';
