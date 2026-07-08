/**
 * AI Ads add-on: entitlement + credit wallet.
 *
 * One `ai_addons` row per account holds the unlock flag and remaining credits.
 * Each generation action charges credits up front and refunds on failure, with
 * every movement recorded in `ai_credit_ledger`. All functions are account-scoped.
 */
import { randomId } from './crypto.js';

// Credit cost per action. Tune freely — surfaced to the UI via GET /api/ai/addon.
export const COSTS = {
  strategy: 10,   // full parallel strategy run
  find_ads: 1,    // one ad-discovery search
  creative: 5,    // one copy + AI image variant
  score: 1,       // AI score + feedback for one creative
};

// Purchasable credit packs (platform billing). Prices are charged on the PLATFORM's
// own Stripe account (AI_STRIPE_SECRET_KEY), not the tenant's per-funnel keys. Amounts
// are minor units (cents) in AI_BILLING_CURRENCY. The first purchase also unlocks the
// add-on. Defined server-side so the client can never set its own price/credit ratio.
export const AI_PACKS = {
  starter: { credits: 500, amount: 4900, label: 'Starter' },
  growth: { credits: 1500, amount: 12900, label: 'Growth' },
  scale: { credits: 5000, amount: 39900, label: 'Scale' },
};

/** Pack descriptor for the UI (adds the per-credit price for display). */
export function packCatalog(currency = 'eur') {
  return Object.entries(AI_PACKS).map(([id, p]) => ({
    id, label: p.label, credits: p.credits, amount: p.amount, currency,
  }));
}

function nowISO() { return new Date().toISOString(); }

/** Fetch the account's add-on row, creating a locked/zero row on first access. */
export async function getAddon(db, accountId) {
  let row = await db.prepare('SELECT * FROM ai_addons WHERE account_id = ?').bind(accountId).first();
  if (!row) {
    const ts = nowISO();
    await db.prepare(
      'INSERT OR IGNORE INTO ai_addons (account_id, enabled, credits, created_at, updated_at) VALUES (?,?,?,?,?)'
    ).bind(accountId, 0, 0, ts, ts).run();
    row = await db.prepare('SELECT * FROM ai_addons WHERE account_id = ?').bind(accountId).first();
  }
  return row;
}

/** True when the account has unlocked the add-on. */
export async function isEnabled(db, accountId) {
  const a = await getAddon(db, accountId);
  return !!(a && a.enabled);
}

async function ledger(db, accountId, delta, reason, ref, balance) {
  await db.prepare(
    'INSERT INTO ai_credit_ledger (id, account_id, delta, reason, ref, balance, ts) VALUES (?,?,?,?,?,?,?)'
  ).bind(randomId('led'), accountId, delta, reason, ref || null, balance, nowISO()).run();
}

/**
 * Atomically charge `n` credits. Returns { ok, balance } — ok:false when the
 * account is locked or has insufficient credits (no charge applied).
 */
export async function chargeCredits(db, accountId, n, reason, ref) {
  await getAddon(db, accountId);
  // Conditional decrement: only succeeds if enabled and balance covers the charge.
  const res = await db.prepare(
    'UPDATE ai_addons SET credits = credits - ?, updated_at = ? WHERE account_id = ? AND enabled = 1 AND credits >= ?'
  ).bind(n, nowISO(), accountId, n).run();
  if (!res.meta || res.meta.changes === 0) {
    const a = await getAddon(db, accountId);
    return { ok: false, balance: a.credits, enabled: !!a.enabled };
  }
  const a = await getAddon(db, accountId);
  await ledger(db, accountId, -n, reason, ref, a.credits);
  return { ok: true, balance: a.credits };
}

/** Return previously-charged credits (e.g. when a generation fails). */
export async function refundCredits(db, accountId, n, ref) {
  await db.prepare('UPDATE ai_addons SET credits = credits + ?, updated_at = ? WHERE account_id = ?')
    .bind(n, nowISO(), accountId).run();
  const a = await getAddon(db, accountId);
  await ledger(db, accountId, n, 'refund', ref, a.credits);
  return a.credits;
}

/** Grant credits and (optionally) unlock the add-on — used by purchase/admin grant. */
export async function grantCredits(db, accountId, n, { enable = true, plan, subscriptionId, ref, reason = 'grant' } = {}) {
  await getAddon(db, accountId);
  const sets = ['credits = credits + ?', 'updated_at = ?'];
  const binds = [n, nowISO()];
  if (enable) sets.splice(1, 0, 'enabled = 1');
  if (plan) { sets.splice(1, 0, 'plan = ?'); binds.splice(1, 0, plan); }
  if (subscriptionId) { sets.splice(1, 0, 'stripe_subscription_id = ?'); binds.splice(1, 0, subscriptionId); }
  binds.push(accountId);
  await db.prepare(`UPDATE ai_addons SET ${sets.join(', ')} WHERE account_id = ?`).bind(...binds).run();
  const a = await getAddon(db, accountId);
  await ledger(db, accountId, n, reason, ref || null, a.credits);
  return a.credits;
}

/**
 * Has a grant for this external reference (e.g. a Stripe session id) already been
 * recorded? Used to make the billing webhook idempotent across Stripe retries.
 */
export async function grantExists(db, ref) {
  if (!ref) return false;
  const row = await db.prepare(
    "SELECT 1 FROM ai_credit_ledger WHERE ref = ? AND delta > 0 LIMIT 1"
  ).bind(ref).first();
  return !!row;
}
