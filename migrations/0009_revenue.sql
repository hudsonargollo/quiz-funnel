-- 0009_revenue.sql
-- Revenue tracking: capture the actual Stripe checkout amount on purchase,
-- so the dashboard can show revenue (not just purchase counts). Additive only.

ALTER TABLE leads ADD COLUMN amount_total INTEGER;
ALTER TABLE leads ADD COLUMN currency TEXT;
