/**
 * quiz-funnel-cron — scheduled abandoned-cart detection.
 *
 * Runs every 15 min. Any lead stuck at `checkout_initiated` for longer than
 * ABANDON_AFTER_MIN without completing payment is moved to `checkout_abandoned`
 * and gets a timeline event. (Flag-only for now — see sendFollowUp().)
 *
 * Shares the `DB` (D1) binding with the Pages funnel.
 */

const ABANDON_AFTER_MIN = 45;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(flagAbandoned(env));
  },

  // Allow manual trigger for testing: GET /?key=<ADMIN_TOKEN>
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.ADMIN_TOKEN && url.searchParams.get('key') === env.ADMIN_TOKEN) {
      const n = await flagAbandoned(env);
      return new Response(JSON.stringify({ ok: true, flagged: n }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('quiz-funnel-cron', { status: 200 });
  },
};

async function flagAbandoned(env) {
  if (!env.DB) return 0;
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - ABANDON_AFTER_MIN * 60000).toISOString();

  const stuck = await env.DB
    .prepare(
      `SELECT user_id, account_id, funnel_id, email FROM leads
       WHERE funnel_state = 'checkout_initiated'
         AND checkout_initiated_at IS NOT NULL
         AND checkout_initiated_at < ?`
    )
    .bind(cutoff)
    .all();

  const leads = stuck.results || [];
  if (!leads.length) return 0;

  const stmts = [];
  for (const l of leads) {
    stmts.push(
      env.DB
        .prepare(
          `UPDATE leads
           SET funnel_state = 'checkout_abandoned', updated_at = ?,
               abandoned_notified_at = COALESCE(abandoned_notified_at, ?)
           WHERE user_id = ? AND funnel_state = 'checkout_initiated'`
        )
        .bind(now, now, l.user_id)
    );
    stmts.push(
      env.DB
        .prepare(
          `INSERT OR IGNORE INTO events (user_id, account_id, funnel_id, event, props, ts)
           VALUES (?, ?, ?, 'checkout_abandoned', NULL, ?)`
        )
        .bind(l.user_id, l.account_id, l.funnel_id, now)
    );
  }
  await env.DB.batch(stmts);

  // Hook for later: customer-facing recovery email / webhook goes here.
  // for (const l of leads) await sendFollowUp(env, l);

  console.log(`Flagged ${leads.length} abandoned checkout(s).`);
  return leads.length;
}

// Placeholder — wire a real channel (Resend / webhook / Slack) when ready.
// async function sendFollowUp(env, lead) {}
