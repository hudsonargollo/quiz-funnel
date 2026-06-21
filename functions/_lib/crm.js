/**
 * Shared CRM data-access layer (Cloudflare D1).
 * Imported by the /api/* Pages Functions. Files under functions/_lib are
 * NOT routed — they're plain modules bundled into the functions that import them.
 */

export const FUNNEL_STATES = [
  'quiz_started',
  'lead_captured',
  'offer_viewed',
  'checkout_initiated',
  'checkout_abandoned',
  'purchase_completed',
  'payment_failed',
];

// Maps a funnel state to the lead column that should be stamped when it's reached.
const STATE_TIMESTAMP = {
  lead_captured: 'lead_captured_at',
  offer_viewed: 'offer_viewed_at',
  checkout_initiated: 'checkout_initiated_at',
  purchase_completed: 'purchased_at',
  payment_failed: 'payment_failed_at',
};

export function nowISO() {
  return new Date().toISOString();
}

export function computeIMC(peso, altura) {
  const p = parseFloat(peso);
  const h = parseFloat(altura) / 100;
  if (!p || !h) return null;
  return Math.round((p / (h * h)) * 10) / 10;
}

/** Resolve the canonical row id: reuse the row already on file for this email. */
async function resolveUserId(db, userId, email) {
  if (email) {
    const row = await db
      .prepare('SELECT user_id FROM leads WHERE email = ? LIMIT 1')
      .bind(email.toLowerCase())
      .first();
    if (row?.user_id) return row.user_id;
  }
  return userId;
}

/**
 * Upsert a lead from a client session payload. Idempotent.
 * `session` is the full object the browser keeps (see public/js/crm.js).
 * `meta` carries request-derived fields (ipCountry, referrer, userAgent).
 */
export async function upsertLead(db, session, meta = {}) {
  const incomingUserId = session.userId;
  const email = session.email ? session.email.trim().toLowerCase() : null;
  if (!incomingUserId && !email) throw new Error('No identifier');

  const userId = await resolveUserId(db, incomingUserId, email);
  const quiz = session.quizData || {};
  const imc = computeIMC(quiz.peso_atual, quiz.altura);
  const ts = nowISO();

  const state = FUNNEL_STATES.includes(session.funnelState)
    ? session.funnelState
    : 'quiz_started';

  // Timestamp value for the stage this update represents (COALESCE keeps the first).
  const stampCol = STATE_TIMESTAMP[state] || null;

  await db
    .prepare(
      `INSERT INTO leads (
         user_id, email, nome, funnel_state, quiz_data, imc, objetivo,
         utm_source, utm_medium, utm_campaign, referrer, user_agent, ip_country,
         created_at, updated_at,
         lead_captured_at, offer_viewed_at, checkout_initiated_at
       ) VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?, ?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
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
         -- never downgrade a completed purchase
         funnel_state = CASE WHEN leads.funnel_state = 'purchase_completed'
                             THEN 'purchase_completed' ELSE excluded.funnel_state END,
         updated_at   = excluded.updated_at,
         lead_captured_at      = COALESCE(leads.lead_captured_at, excluded.lead_captured_at),
         offer_viewed_at       = COALESCE(leads.offer_viewed_at, excluded.offer_viewed_at),
         checkout_initiated_at = COALESCE(leads.checkout_initiated_at, excluded.checkout_initiated_at)`
    )
    .bind(
      userId,
      email,
      session.nome ? session.nome.trim() : null,
      state,
      JSON.stringify(quiz),
      imc,
      quiz.objetivo || null,
      session.utmSource || null,
      session.utmMedium || null,
      session.utmCampaign || null,
      meta.referrer || session.referrer || null,
      meta.userAgent || session.userAgent || null,
      meta.ipCountry || null,
      session.createdAt || ts,
      ts,
      stampCol === 'lead_captured_at' ? ts : null,
      stampCol === 'offer_viewed_at' ? ts : null,
      stampCol === 'checkout_initiated_at' ? ts : null
    )
    .run();

  await insertEvents(db, userId, session.events || []);
  return userId;
}

/** Idempotently insert a batch of client events (deduped by unique index). */
export async function insertEvents(db, userId, events) {
  const recent = events.slice(-50);
  for (const e of recent) {
    if (!e || !e.event || !e.ts) continue;
    await db
      .prepare(
        'INSERT OR IGNORE INTO events (user_id, event, props, ts) VALUES (?,?,?,?)'
      )
      .bind(userId, e.event, e.props ? JSON.stringify(e.props) : null, e.ts)
      .run();
  }
}

/**
 * Force a lead into a given state + patch fields (used by Stripe flows).
 * Resolves the row by userId first, then email. Stamps the stage timestamp.
 */
export async function setLeadState(db, { userId, email }, state, fields = {}) {
  let id = null;
  if (userId) {
    const r = await db.prepare('SELECT user_id FROM leads WHERE user_id = ?').bind(userId).first();
    if (r) id = r.user_id;
  }
  if (!id && email) {
    const r = await db
      .prepare('SELECT user_id FROM leads WHERE email = ? LIMIT 1')
      .bind(email.toLowerCase())
      .first();
    if (r) id = r.user_id;
  }
  const ts = nowISO();
  if (!id) {
    // No prior row (e.g. webhook arrives first) — create a minimal one.
    id = userId || `email:${email.toLowerCase()}`;
    await db
      .prepare(
        'INSERT OR IGNORE INTO leads (user_id, email, funnel_state, created_at, updated_at) VALUES (?,?,?,?,?)'
      )
      .bind(id, email ? email.toLowerCase() : null, state, ts, ts)
      .run();
  }

  const sets = ['funnel_state = ?', 'updated_at = ?'];
  const binds = [state, ts];
  if (email) { sets.push('email = COALESCE(email, ?)'); binds.push(email.toLowerCase()); }
  const stampCol = STATE_TIMESTAMP[state];
  if (stampCol) { sets.push(`${stampCol} = COALESCE(${stampCol}, ?)`); binds.push(ts); }
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    binds.push(v);
  }
  binds.push(id);

  await db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE user_id = ?`).bind(...binds).run();
  await insertEvents(db, id, [{ event: state, ts }]);
  return id;
}

/** Parse a DB row into an API-friendly shape. */
export function rowToLead(row) {
  if (!row) return null;
  let quiz = {};
  try { quiz = row.quiz_data ? JSON.parse(row.quiz_data) : {}; } catch (e) { /* ignore */ }
  return { ...row, quizData: quiz };
}
