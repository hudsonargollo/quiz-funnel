-- 0007_ai_brandkit_scoring.sql
-- AI Ads add-on, phase 3: an account-wide brand kit (tone, colors, fonts, voice
-- guidelines, logo) that's folded into strategy/copy/image prompts so generated
-- creatives stay on-brand, plus AI-scored feedback per creative. Additive only.

-- ── Brand kit (one row per account) ──
CREATE TABLE IF NOT EXISTS ai_brand_kits (
  account_id    TEXT PRIMARY KEY,
  name          TEXT,               -- brand / company name shown to the model
  tone          TEXT,               -- free-text voice & tone description
  colors        TEXT,               -- JSON array of hex strings, e.g. ["#00AEEF","#0B0F15"]
  fonts         TEXT,               -- free-text font names/style notes
  voice_dos     TEXT,               -- free-text: phrases/angles to lean into
  voice_donts   TEXT,               -- free-text: words/claims/angles to avoid
  logo_key      TEXT,               -- R2 object key for the uploaded logo (nullable)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- ── AI-scored creative feedback ──
ALTER TABLE ad_creatives ADD COLUMN score INTEGER;             -- 0-100, null until scored
ALTER TABLE ad_creatives ADD COLUMN score_feedback TEXT;       -- JSON: { strengths[], improvements[], summary }
