/**
 * GET /api/crm/leads — admin lead list / lookup (D1-backed).
 * Auth: ?token=ADMIN_TOKEN or X-Admin-Token header.
 *
 * Query params:
 *   email   — return one lead (full record + event timeline)
 *   userId  — return one lead by id (full record + event timeline)
 *   state   — filter list by funnel_state
 *   q       — search email/nome (substring)
 *   limit   — default 50, max 200
 *   offset  — pagination offset
 */
import { rowToLead } from '../../_lib/crm.js';

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

  // ── Single lead (with event timeline) ──────────
  const email = url.searchParams.get('email');
  const userId = url.searchParams.get('userId');
  if (email || userId) {
    const row = email
      ? await env.DB.prepare('SELECT * FROM leads WHERE email = ? LIMIT 1').bind(email.toLowerCase()).first()
      : await env.DB.prepare('SELECT * FROM leads WHERE user_id = ?').bind(userId).first();
    if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });

    const evs = await env.DB
      .prepare('SELECT event, props, ts FROM events WHERE user_id = ? ORDER BY ts ASC LIMIT 200')
      .bind(row.user_id)
      .all();
    const lead = rowToLead(row);
    lead.events = (evs.results || []).map(e => ({
      event: e.event,
      ts: e.ts,
      props: e.props ? safeParse(e.props) : null,
    }));
    return new Response(JSON.stringify(lead), { status: 200, headers });
  }

  // ── List ───────────────────────────────────────
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
  const state = url.searchParams.get('state') || null;
  const q = url.searchParams.get('q');
  const like = q ? `%${q.toLowerCase()}%` : null;

  const where = [];
  const binds = [];
  if (state) { where.push('funnel_state = ?'); binds.push(state); }
  if (like) { where.push('(lower(email) LIKE ? OR lower(nome) LIKE ?)'); binds.push(like, like); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // ── CSV export (same filters, up to 5000 rows) ─
  if (url.searchParams.get('format') === 'csv') {
    const rows = await env.DB
      .prepare(
        `SELECT user_id, email, nome, funnel_state, imc, objetivo, utm_source,
                utm_medium, utm_campaign, ip_country, created_at, updated_at,
                lead_captured_at, checkout_initiated_at, purchased_at
         FROM leads ${whereSql} ORDER BY updated_at DESC LIMIT 5000`
      )
      .bind(...binds)
      .all();
    const cols = ['user_id','email','nome','funnel_state','imc','objetivo','utm_source','utm_medium','utm_campaign','ip_country','created_at','updated_at','lead_captured_at','checkout_initiated_at','purchased_at'];
    const csv = [cols.join(',')]
      .concat((rows.results || []).map(r => cols.map(c => csvCell(r[c])).join(',')))
      .join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-${Date.now()}.csv"`,
      },
    });
  }

  const totalRow = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM leads ${whereSql}`)
    .bind(...binds)
    .first();

  const rows = await env.DB
    .prepare(
      `SELECT user_id, email, nome, funnel_state, imc, objetivo, utm_source,
              created_at, updated_at, lead_captured_at, purchased_at
       FROM leads ${whereSql}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...binds, limit, offset)
    .all();

  return new Response(JSON.stringify({
    results: rows.results || [],
    total: totalRow?.n || 0,
    limit,
    offset,
  }), { status: 200, headers });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
