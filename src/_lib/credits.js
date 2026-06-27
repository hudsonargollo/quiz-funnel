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
};

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
export async function grantCredits(db, accountId, n, { enable = true, plan, subscriptionId } = {}) {
  await getAddon(db, accountId);
  const sets = ['credits = credits + ?', 'updated_at = ?'];
  const binds = [n, nowISO()];
  if (enable) sets.splice(1, 0, 'enabled = 1');
  if (plan) { sets.splice(1, 0, 'plan = ?'); binds.splice(1, 0, plan); }
  if (subscriptionId) { sets.splice(1, 0, 'stripe_subscription_id = ?'); binds.splice(1, 0, subscriptionId); }
  binds.push(accountId);
  await db.prepare(`UPDATE ai_addons SET ${sets.join(', ')} WHERE account_id = ?`).bind(...binds).run();
  const a = await getAddon(db, accountId);
  await ledger(db, accountId, n, 'grant', null, a.credits);
  return a.credits;
}
