-- 0012_password_resets.sql
-- One-time tokens for the "forgot password" email flow (sent via Resend).
-- Token is the primary key — same pattern as `sessions`, where the opaque
-- random id itself is the secret, not a value we look up by then compare.

CREATE TABLE IF NOT EXISTS password_resets (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
