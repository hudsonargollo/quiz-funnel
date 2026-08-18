/**
 * Sales Pipeline data layer (D1) — a human-worked overlay on top of the
 * fully-automated leads/events/funnel_state machine (see crm.js), which this
 * never touches or reads from directly except to seed name/email/phone when
 * promoting an existing lead. Every read/write is scoped by account_id.
 */
import { randomId } from './crypto.js';

export const PIPELINE_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];

export function nowISO() { return new Date().toISOString(); }

export async function logPipelineEvent(db, accountId, pipelineLeadId, type, payload, actorEmail) {
  await db.prepare(
    'INSERT INTO pipeline_lead_events (id, account_id, pipeline_lead_id, type, payload, actor_email, created_at) VALUES (?,?,?,?,?,?,?)'
  ).bind(
    randomId('plev'), accountId, pipelineLeadId, type,
    payload != null ? JSON.stringify(payload) : null, actorEmail || null, nowISO()
  ).run();
}

export async function createPipelineLead(db, accountId, input, actorEmail) {
  const ts = nowISO();
  let seeded = {};
  if (input.leadUserId) {
    const lead = await db.prepare('SELECT * FROM leads WHERE account_id = ? AND user_id = ?')
      .bind(accountId, input.leadUserId).first();
    if (!lead) return { error: 'Lead not found', status: 404 };
    seeded = { name: lead.nome, email: lead.email, funnelId: lead.funnel_id };
  }

  const id = randomId('plead');
  await db.prepare(
    `INSERT INTO pipeline_leads
      (id, account_id, lead_user_id, funnel_id, status, source, name, email, phone, qualification, assigned_email, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, accountId, input.leadUserId || null, input.funnelId || seeded.funnelId || null,
    'new', input.leadUserId ? 'promoted' : (input.source || 'manual'),
    input.name || seeded.name || null, input.email || seeded.email || null, input.phone || null,
    input.qualification ? JSON.stringify(input.qualification) : null, input.assignedEmail || null,
    ts, ts
  ).run();

  await logPipelineEvent(db, accountId, id, 'created', { source: input.leadUserId ? 'promoted' : (input.source || 'manual') }, actorEmail);
  return getPipelineLead(db, accountId, id);
}

export async function listPipelineLeads(db, accountId, { status } = {}) {
  const rows = status
    ? await db.prepare('SELECT * FROM pipeline_leads WHERE account_id = ? AND status = ? ORDER BY updated_at DESC').bind(accountId, status).all()
    : await db.prepare('SELECT * FROM pipeline_leads WHERE account_id = ? ORDER BY updated_at DESC').bind(accountId).all();
  return (rows.results || []).map(pipelineLeadPublic);
}

export async function getPipelineLead(db, accountId, id) {
  const row = await db.prepare('SELECT * FROM pipeline_leads WHERE account_id = ? AND id = ?').bind(accountId, id).first();
  if (!row) return null;
  const events = await db.prepare('SELECT id, type, payload, actor_email, created_at FROM pipeline_lead_events WHERE account_id = ? AND pipeline_lead_id = ? ORDER BY created_at ASC')
    .bind(accountId, id).all();
  const sales = await db.prepare('SELECT * FROM pipeline_sales WHERE account_id = ? AND pipeline_lead_id = ? ORDER BY created_at ASC')
    .bind(accountId, id).all();
  return {
    ...pipelineLeadPublic(row),
    events: (events.results || []).map(e => ({ ...e, payload: safeParse(e.payload) })),
    sales: sales.results || [],
  };
}

export async function updatePipelineLead(db, accountId, id, patch, actorEmail) {
  const existing = await db.prepare('SELECT id FROM pipeline_leads WHERE account_id = ? AND id = ?').bind(accountId, id).first();
  if (!existing) return { error: 'Not found', status: 404 };

  const fields = { name: 'name', email: 'email', phone: 'phone', assignedEmail: 'assigned_email', funnelId: 'funnel_id' };
  const sets = []; const binds = [];
  for (const [key, col] of Object.entries(fields)) {
    if (patch[key] !== undefined) { sets.push(`${col} = ?`); binds.push(patch[key]); }
  }
  if (patch.qualification !== undefined) { sets.push('qualification = ?'); binds.push(patch.qualification ? JSON.stringify(patch.qualification) : null); }
  if (!sets.length) return getPipelineLead(db, accountId, id);

  sets.push('updated_at = ?'); binds.push(nowISO());
  binds.push(accountId, id);
  await db.prepare(`UPDATE pipeline_leads SET ${sets.join(', ')} WHERE account_id = ? AND id = ?`).bind(...binds).run();
  return getPipelineLead(db, accountId, id);
}

export async function setPipelineLeadStatus(db, env, accountId, id, status, actorEmail) {
  if (!PIPELINE_STATUSES.includes(status)) return { error: 'Invalid status', status: 400 };
  const existing = await db.prepare('SELECT status FROM pipeline_leads WHERE account_id = ? AND id = ?').bind(accountId, id).first();
  if (!existing) return { error: 'Not found', status: 404 };

  const ts = nowISO();
  await db.prepare('UPDATE pipeline_leads SET status = ?, updated_at = ? WHERE account_id = ? AND id = ?')
    .bind(status, ts, accountId, id).run();
  await logPipelineEvent(db, accountId, id, 'status_changed', { from: existing.status, to: status }, actorEmail);

  if (status === 'won') await onPipelineLeadWon(db, env, { accountId, pipelineLeadId: id });

  return getPipelineLead(db, accountId, id);
}

export async function recordPipelineSale(db, accountId, pipelineLeadId, input, actorEmail) {
  const existing = await db.prepare('SELECT id FROM pipeline_leads WHERE account_id = ? AND id = ?').bind(accountId, pipelineLeadId).first();
  if (!existing) return { error: 'Not found', status: 404 };

  const id = randomId('psale');
  const ts = nowISO();
  await db.prepare(
    `INSERT INTO pipeline_sales (id, account_id, pipeline_lead_id, closer_email, amount, currency, status, payment_ref, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, accountId, pipelineLeadId, input.closerEmail || actorEmail || null,
    input.amount ?? null, input.currency || 'USD', input.status || 'recorded', input.paymentRef || null, ts, ts
  ).run();
  await logPipelineEvent(db, accountId, pipelineLeadId, 'sale_recorded', { amount: input.amount ?? null, currency: input.currency || 'USD' }, actorEmail);
  return { id };
}

export async function pipelineStats(db, accountId) {
  const rows = await db.prepare('SELECT status, COUNT(*) AS n FROM pipeline_leads WHERE account_id = ? GROUP BY status').bind(accountId).all();
  const byStatus = {}; for (const s of PIPELINE_STATUSES) byStatus[s] = 0;
  for (const r of rows.results || []) byStatus[r.status] = r.n;
  return { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus };
}

/**
 * Extension point fired when a pipeline lead is marked won. Deliberately a
 * no-op today — NOT Tektone's own delivery/commission automation, just a
 * clean, obviously-named place to wire a future webhook or integration.
 */
export async function onPipelineLeadWon(db, env, { accountId, pipelineLeadId }) {
  // no-op
}

function pipelineLeadPublic(row) {
  return { ...row, qualification: safeParse(row.qualification) };
}

function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
