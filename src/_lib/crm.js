/**
 * Account-aware CRM data layer (D1). Every read/write is scoped by account_id
 * (and usually funnel_id). Ported from the single-tenant functions/_lib/crm.js.
 */

export const FUNNEL_STATES = [
  'quiz_started', 'lead_captured', 'offer_viewed',
  'checkout_initiated', 'checkout_abandoned', 'purchase_completed', 'payment_failed',
];

const STATE_TIMESTAMP = {
  lead_captured: 'lead_captured_at',
  offer_viewed: 'offer_viewed_at',
  checkout_initiated: 'checkout_initiated_at',
  purchase_completed: 'purchased_at',
  payment_failed: 'payment_failed_at',
};

export function nowISO() { return new Date().toISOString(); }

export function computeIMC(peso, altura) {
  const p = parseFloat(peso);
  const h = parseFloat(altura) / 100;
  if (!p || !h) return null;
  return Math.round((p / (h * h)) * 10) / 10;
}

/** Reuse the row already on file for this email WITHIN THE ACCOUNT. */
async function resolveUserId(db, accountId, userId, email) {
  if (email) {
    const row = await db
      .prepare('SELECT user_id FROM leads WHERE account_id = ? AND email = ? LIMIT 1')
      .bind(accountId, email.toLowerCase())
      .first();
    if (row?.user_id) return row.user_id;
  }
  return userId;
}

/**
 * Upsert a lead from a browser session payload, scoped to {accountId, funnelId}.
 * The client funnel/account are NEVER trusted — the caller passes the values
 * resolved server-side from the Host → funnel lookup.
 */
export async function upsertLead(db, { accountId, funnelId }, session, meta = {}) {
  const incomingUserId = session.userId;
  const email = session.email ? session.email.trim().toLowerCase() : null;
  if (!incomingUserId && !email) throw new Error('No identifier');

  const userId = await resolveUserId(db, accountId, incomingUserId, email);
  const quiz = session.quizData || {};
  const imc = computeIMC(quiz.peso_atual, quiz.altura);
  const ts = nowISO();
  const state = FUNNEL_STATES.includes(session.funnelState) ? session.funnelState : 'quiz_started';
  const stampCol = STATE_TIMESTAMP[state] || null;

  await db.prepare(
    `INSERT INTO leads (
       user_id, account_id, funnel_id, email, nome, funnel_state, quiz_data, imc, objetivo,
       utm_source, utm_medium, utm_campaign, referrer, user_agent, ip_country,
       created_at, updated_at, lead_captured_at, offer_viewed_at, checkout_initiated_at
     ) VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       account_id   = excluded.account_id,
       funnel_id    = excluded.funnel_id,
       email        = COALESCE(excluded.email, leads.email),
       nome         = COALESCE(excluded.nome, leads.nome),
       quiz_data    = excluded.quiz_data,
       imc          = COALESCE(excluded.imc, leads.imc),
       objetivo     = COALESCE(excluded.objetivo, leads.objetivo),
       utm_source   = COALESCE(leads.utm_source, excluded.utm_source),
       utm_medium   = COALESCE(leads.utm_medium, excluded.utm_medium),
       utm_campaign = COALESCE(leads.utm_campaign, excluded.utm_campaign),
       referrer     = COALESCE(leads.referrer, excluded.referrer),
       user_agent   = COALESCE(excluded.user_agent, leads.user_agent),
       ip_country   = COALESCE(excluded.ip_country, leads.ip_country),
       funnel_state = CASE WHEN leads.funnel_state = 'purchase_completed'
                           THEN 'purchase_completed' ELSE excluded.funnel_state END,
       updated_at   = excluded.updated_at,
       lead_captured_at      = COALESCE(leads.lead_captured_at, excluded.lead_captured_at),
       offer_viewed_at       = COALESCE(leads.offer_viewed_at, excluded.offer_viewed_at),
       checkout_initiated_at = COALESCE(leads.checkout_initiated_at, excluded.checkout_initiated_at)`
  ).bind(
    userId, accountId, funnelId, email,
    session.nome ? session.nome.trim() : null,
    state, JSON.stringify(quiz), imc, quiz.objetivo || null,
    session.utmSource || null, session.utmMedium || null, session.utmCampaign || null,
    meta.referrer || session.referrer || null, meta.userAgent || session.userAgent || null, meta.ipCountry || null,
    session.createdAt || ts, ts,
    stampCol === 'lead_captured_at' ? ts : null,
    stampCol === 'offer_viewed_at' ? ts : null,
    stampCol === 'checkout_initiated_at' ? ts : null
  ).run();

  await insertEvents(db, accountId, funnelId, userId, session.events || []);
  return userId;
}

export async function insertEvents(db, accountId, funnelId, userId, events) {
  for (const e of (events || []).slice(-50)) {
    if (!e || !e.event || !e.ts) continue;
    await db.prepare(
      'INSERT OR IGNORE INTO events (user_id, account_id, funnel_id, event, props, ts) VALUES (?,?,?,?,?,?)'
    ).bind(userId, accountId, funnelId, e.event, e.props ? JSON.stringify(e.props) : null, e.ts).run();
  }
}

/** Force a lead into a state (Stripe flows). Resolves the row within the account. */
export async function setLeadState(db, { accountId, funnelId, userId, email }, state, fields = {}) {
  let id = null;
  if (userId) {
    const r = await db.prepare('SELECT user_id FROM leads WHERE account_id = ? AND user_id = ?')
      .bind(accountId, userId).first();
    if (r) id = r.user_id;
  }
  if (!id && email) {
    const r = await db.prepare('SELECT user_id FROM leads WHERE account_id = ? AND email = ? LIMIT 1')
      .bind(accountId, email.toLowerCase()).first();
    if (r) id = r.user_id;
  }
  const ts = nowISO();
  if (!id) {
    id = userId || `email:${(email || '').toLowerCase()}`;
    await db.prepare(
      'INSERT OR IGNORE INTO leads (user_id, account_id, funnel_id, email, funnel_state, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(id, accountId, funnelId, email ? email.toLowerCase() : null, state, ts, ts).run();
  }

  const sets = ['funnel_state = ?', 'updated_at = ?'];
  const binds = [state, ts];
  if (email) { sets.push('email = COALESCE(email, ?)'); binds.push(email.toLowerCase()); }
  const stampCol = STATE_TIMESTAMP[state];
  if (stampCol) { sets.push(`${stampCol} = COALESCE(${stampCol}, ?)`); binds.push(ts); }
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = ?`); binds.push(v); }
  binds.push(accountId, id);

  await db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE account_id = ? AND user_id = ?`).bind(...binds).run();
  await insertEvents(db, accountId, funnelId, id, [{ event: state, ts }]);
  return id;
}

export function rowToLead(row) {
  if (!row) return null;
  let quiz = {};
  try { quiz = row.quiz_data ? JSON.parse(row.quiz_data) : {}; } catch (e) { /* ignore */ }
  return { ...row, quizData: quiz };
}
