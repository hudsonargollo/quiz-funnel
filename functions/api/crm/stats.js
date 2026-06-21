/**
 * GET /api/crm/stats — aggregate analytics for the dashboard (D1-backed).
 * Auth: ?token=ADMIN_TOKEN or X-Admin-Token header.
 * Optional: ?days=N to limit to leads created in the last N days.
 */

// Quiz question keys in funnel order (for drop-off display).
const QUESTION_ORDER = [
  'objetivo', 'sensacao_corpo', 'zonas_problematicas', 'impacto_vida', 'espelho',
  'bloqueio', 'objetivos_vida', 'altura', 'peso_atual', 'peso_objetivo',
  'nome', 'rotina', 'sono', 'agua', 'tipo_resultado', 'email',
];

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };
  const url = new URL(request.url);

  const token = url.searchParams.get('token') || request.headers.get('X-Admin-Token');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'DB not configured' }), { status: 500, headers });
  }

  const days = parseInt(url.searchParams.get('days') || '0', 10);
  const since = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;
  const dateWhere = since ? 'WHERE created_at >= ?' : '';
  const dateBind = since ? [since] : [];

  // ── Funnel counts by state ─────────────────────
  const stateRows = await env.DB
    .prepare(`SELECT funnel_state AS state, COUNT(*) AS n FROM leads ${dateWhere} GROUP BY funnel_state`)
    .bind(...dateBind)
    .all();
  const byState = {};
  for (const r of stateRows.results || []) byState[r.state] = r.n;

  const total = Object.values(byState).reduce((a, b) => a + b, 0);
  const leadCaptured = countAtLeast(byState, ['lead_captured', 'offer_viewed', 'checkout_initiated', 'checkout_abandoned', 'purchase_completed', 'payment_failed']);
  const offerViewed = countAtLeast(byState, ['offer_viewed', 'checkout_initiated', 'checkout_abandoned', 'purchase_completed', 'payment_failed']);
  const checkout = countAtLeast(byState, ['checkout_initiated', 'checkout_abandoned', 'purchase_completed', 'payment_failed']);
  const purchased = byState['purchase_completed'] || 0;

  const funnel = [
    { key: 'started', count: total },
    { key: 'lead', count: leadCaptured },
    { key: 'offer', count: offerViewed },
    { key: 'checkout', count: checkout },
    { key: 'purchased', count: purchased },
  ].map(s => ({ ...s, pct: total ? Math.round((s.count / total) * 1000) / 10 : 0 }));

  // ── Per-question reach (drop-off) ──────────────
  const qRows = await env.DB
    .prepare(
      `SELECT json_extract(props,'$.key') AS k, COUNT(DISTINCT user_id) AS users
       FROM events WHERE event = 'question_answered' GROUP BY k`
    )
    .all();
  const qMap = {};
  for (const r of qRows.results || []) if (r.k) qMap[r.k] = r.users;
  const questions = QUESTION_ORDER
    .filter(k => qMap[k] != null)
    .map(k => ({ key: k, users: qMap[k] }));

  // ── UTM source breakdown ───────────────────────
  const utmRows = await env.DB
    .prepare(
      `SELECT COALESCE(utm_source,'(direto)') AS source,
              COUNT(*) AS leads,
              SUM(CASE WHEN funnel_state='purchase_completed' THEN 1 ELSE 0 END) AS purchases
       FROM leads ${dateWhere}
       GROUP BY source ORDER BY leads DESC LIMIT 25`
    )
    .bind(...dateBind)
    .all();

  // ── New leads per day (last 14 days) ───────────
  const tsRows = await env.DB
    .prepare(
      `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n
       FROM leads WHERE created_at >= ?
       GROUP BY day ORDER BY day ASC`
    )
    .bind(new Date(Date.now() - 14 * 86400000).toISOString())
    .all();

  return new Response(JSON.stringify({
    total,
    byState,
    funnel,
    conversion: {
      lead_rate: total ? round1((leadCaptured / total) * 100) : 0,
      offer_rate: leadCaptured ? round1((offerViewed / leadCaptured) * 100) : 0,
      checkout_rate: offerViewed ? round1((checkout / offerViewed) * 100) : 0,
      purchase_rate: total ? round1((purchased / total) * 100) : 0,
    },
    questions,
    utm: utmRows.results || [],
    daily: tsRows.results || [],
  }), { status: 200, headers });
}

function countAtLeast(byState, states) {
  return states.reduce((sum, s) => sum + (byState[s] || 0), 0);
}
function round1(n) { return Math.round(n * 10) / 10; }
