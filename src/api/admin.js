/** Admin endpoints — require a tenant session; every query scoped by account_id. */
import { json, err } from '../_lib/http.js';
import { getSession } from '../_lib/auth.js';
import { rowToLead } from '../_lib/crm.js';
import { listFunnels, createFunnel, updateFunnel, deleteFunnel, getFunnelById } from '../_lib/funnels.js';
import { randomId } from '../_lib/crypto.js';
import { isConfigured, cnameTarget, createCustomHostname, getCustomHostname, deleteCustomHostname } from '../_lib/cfsaas.js';
import { handleAi } from './ai.js';
import { handleMessaging } from './messaging.js';

export async function handleAdmin(request, env, path, url) {
  const db = env.DB;
  const s = await getSession(db, request);
  if (!s) return err('Unauthorized', 401);
  const acc = s.accountId;

  // ── AI Ads add-on (/api/ai/*) — reuses this session + account scope ──
  if (path.startsWith('/api/ai/')) return handleAi(db, env, request, path, url, acc);

  // ── Messaging (/api/messaging/*) — deliverable status, test send, log ──
  if (path.startsWith('/api/messaging/')) return handleMessaging(db, env, request, path, url, acc);

  // ── Funnels CRUD ──
  if (path === '/api/funnels') {
    if (request.method === 'GET') return json({ results: await listFunnels(db, acc) });
    if (request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const r = await createFunnel(db, acc, b);
      return r.error ? err(r.error, r.status) : json(r, 201);
    }
  }
  const fm = path.match(/^\/api\/funnels\/([^/]+)$/);
  if (fm) {
    const id = fm[1];
    if (request.method === 'GET') {
      const f = await getFunnelById(db, acc, id);
      if (!f) return err('Not found', 404);
      // never leak secrets; expose only presence + non-secret fields
      let cfg = {}; try { cfg = JSON.parse(f.config); } catch (e) {}
      return json({
        id: f.id, slug: f.slug, name: f.name, type: f.type, status: f.status,
        config: cfg, post_purchase_url: f.post_purchase_url,
        stripe_price_id: f.stripe_price_id, stripe_publishable_key: f.stripe_publishable_key,
        has_stripe_secret: !!f.stripe_secret_enc, has_stripe_webhook: !!f.stripe_webhook_secret_enc,
        created_at: f.created_at, updated_at: f.updated_at,
      });
    }
    if (request.method === 'PATCH' || request.method === 'PUT') {
      const b = await request.json().catch(() => ({}));
      const r = await updateFunnel(db, acc, id, b, env.SECRETS_KEY);
      return r.error ? err(r.error, r.status) : json(r);
    }
    if (request.method === 'DELETE') return json(await deleteFunnel(db, acc, id));
  }

  // ── Custom domains ──
  if (path === '/api/domains') {
    if (request.method === 'GET') {
      const fid = url.searchParams.get('funnelId');
      const sql = fid
        ? 'SELECT id, funnel_id, hostname, status, ssl_status, created_at FROM domains WHERE account_id = ? AND funnel_id = ? ORDER BY created_at DESC'
        : 'SELECT id, funnel_id, hostname, status, ssl_status, created_at FROM domains WHERE account_id = ? ORDER BY created_at DESC';
      const binds = fid ? [acc, fid] : [acc];
      const r = await db.prepare(sql).bind(...binds).all();
      return json({ results: r.results || [], cnameTarget: cnameTarget(env), configured: isConfigured(env) });
    }
    if (request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const hostname = String(b.hostname || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(hostname)) return err('Enter a valid domain', 400);
      const f = await getFunnelById(db, acc, b.funnelId);
      if (!f) return err('Funnel not found', 404);
      const taken = await db.prepare('SELECT id FROM domains WHERE hostname = ?').bind(hostname).first();
      if (taken) return err('That domain is already connected', 409);

      const id = randomId('dom');
      const ts = new Date().toISOString();
      let cfId = null, status = 'pending', sslStatus = null;
      if (isConfigured(env)) {
        const r = await createCustomHostname(env, hostname);
        if (!r.ok) return err(r.error || 'Could not provision domain', 502);
        cfId = r.id; status = r.status || 'pending'; sslStatus = r.sslStatus || null;
      }
      await db.prepare(
        'INSERT INTO domains (id, account_id, funnel_id, hostname, cf_hostname_id, status, ssl_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(id, acc, f.id, hostname, cfId, status, sslStatus, ts, ts).run();
      return json({ id, hostname, status, cnameTarget: cnameTarget(env), configured: isConfigured(env) }, 201);
    }
  }
  const dm = path.match(/^\/api\/domains\/([^/]+)$/);
  if (dm) {
    const id = dm[1];
    const row = await db.prepare('SELECT * FROM domains WHERE account_id = ? AND id = ?').bind(acc, id).first();
    if (!row) return err('Not found', 404);
    if (request.method === 'GET') { // refresh status from Cloudflare
      if (row.cf_hostname_id && isConfigured(env)) {
        const r = await getCustomHostname(env, row.cf_hostname_id);
        if (r.ok) {
          await db.prepare('UPDATE domains SET status = ?, ssl_status = ?, updated_at = ? WHERE id = ?')
            .bind(r.status === 'active' ? 'active' : 'pending', r.sslStatus || null, new Date().toISOString(), id).run();
          return json({ status: r.status, ssl_status: r.sslStatus });
        }
      }
      return json({ status: row.status, ssl_status: row.ssl_status });
    }
    if (request.method === 'DELETE') {
      if (row.cf_hostname_id && isConfigured(env)) await deleteCustomHostname(env, row.cf_hostname_id);
      await db.prepare('DELETE FROM domains WHERE account_id = ? AND id = ?').bind(acc, id).run();
      return json({ ok: true });
    }
  }

  // ── CRM: leads (list / detail / CSV) ──
  if (path === '/api/crm/leads' && request.method === 'GET') {
    return leadsHandler(db, acc, url);
  }

  // ── CRM: stats ──
  if (path === '/api/crm/stats' && request.method === 'GET') {
    return statsHandler(db, acc, url);
  }

  return err('Not found', 404);
}

// ─────────────────────────────────────────────
async function leadsHandler(db, acc, url) {
  const funnelId = url.searchParams.get('funnelId') || null;

  // Single lead + timeline
  const email = url.searchParams.get('email');
  const userId = url.searchParams.get('userId');
  if (email || userId) {
    const row = email
      ? await db.prepare('SELECT * FROM leads WHERE account_id = ? AND email = ? LIMIT 1').bind(acc, email.toLowerCase()).first()
      : await db.prepare('SELECT * FROM leads WHERE account_id = ? AND user_id = ?').bind(acc, userId).first();
    if (!row) return err('Not found', 404);
    const evs = await db.prepare('SELECT event, props, ts FROM events WHERE account_id = ? AND user_id = ? ORDER BY ts ASC LIMIT 200')
      .bind(acc, row.user_id).all();
    const lead = rowToLead(row);
    lead.events = (evs.results || []).map(e => ({ event: e.event, ts: e.ts, props: safeParse(e.props) }));
    return json(lead);
  }

  const where = ['account_id = ?']; const binds = [acc];
  if (funnelId) { where.push('funnel_id = ?'); binds.push(funnelId); }
  const state = url.searchParams.get('state'); if (state) { where.push('funnel_state = ?'); binds.push(state); }
  const q = url.searchParams.get('q');
  if (q) { where.push('(lower(email) LIKE ? OR lower(nome) LIKE ?)'); const l = `%${q.toLowerCase()}%`; binds.push(l, l); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  if (url.searchParams.get('format') === 'csv') {
    const cols = ['user_id','email','nome','funnel_state','imc','objetivo','utm_source','utm_medium','utm_campaign','ip_country','created_at','updated_at','lead_captured_at','checkout_initiated_at','purchased_at'];
    const rows = await db.prepare(`SELECT ${cols.join(',')} FROM leads ${whereSql} ORDER BY updated_at DESC LIMIT 5000`).bind(...binds).all();
    const csv = [cols.join(',')].concat((rows.results || []).map(r => cols.map(c => csvCell(r[c])).join(','))).join('\n');
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${Date.now()}.csv"` } });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
  const totalRow = await db.prepare(`SELECT COUNT(*) AS n FROM leads ${whereSql}`).bind(...binds).first();
  const rows = await db.prepare(
    `SELECT user_id, email, nome, funnel_state, funnel_id, imc, objetivo, utm_source, created_at, updated_at, lead_captured_at, purchased_at
     FROM leads ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();
  return json({ results: rows.results || [], total: totalRow?.n || 0, limit, offset });
}

// ─────────────────────────────────────────────
async function statsHandler(db, acc, url) {
  const funnelId = url.searchParams.get('funnelId') || null;
  const days = parseInt(url.searchParams.get('days') || '0', 10);
  const since = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;

  const base = ['account_id = ?']; const baseBinds = [acc];
  if (funnelId) { base.push('funnel_id = ?'); baseBinds.push(funnelId); }
  const scope = `WHERE ${base.join(' AND ')}`;
  const scopeDate = since ? `${scope} AND created_at >= ?` : scope;
  const dateBinds = since ? [...baseBinds, since] : baseBinds;

  const stateRows = await db.prepare(`SELECT funnel_state AS state, COUNT(*) AS n FROM leads ${scopeDate} GROUP BY funnel_state`).bind(...dateBinds).all();
  const byState = {}; for (const r of stateRows.results || []) byState[r.state] = r.n;
  const total = Object.values(byState).reduce((a, b) => a + b, 0);
  const atLeast = (...ss) => ss.reduce((s, k) => s + (byState[k] || 0), 0);
  const leadCaptured = atLeast('lead_captured','offer_viewed','checkout_initiated','checkout_abandoned','purchase_completed','payment_failed');
  const offerViewed = atLeast('offer_viewed','checkout_initiated','checkout_abandoned','purchase_completed','payment_failed');
  const checkout = atLeast('checkout_initiated','checkout_abandoned','purchase_completed','payment_failed');
  const purchased = byState['purchase_completed'] || 0;
  const r1 = n => Math.round(n * 10) / 10;
  const funnel = [
    { key: 'started', count: total }, { key: 'lead', count: leadCaptured },
    { key: 'offer', count: offerViewed }, { key: 'checkout', count: checkout }, { key: 'purchased', count: purchased },
  ].map(s => ({ ...s, pct: total ? r1((s.count / total) * 100) : 0 }));

  // per-question drop-off
  const qWhere = funnelId ? `WHERE account_id = ? AND funnel_id = ? AND event = 'question_answered'` : `WHERE account_id = ? AND event = 'question_answered'`;
  const qBinds = funnelId ? [acc, funnelId] : [acc];
  const qRows = await db.prepare(`SELECT json_extract(props,'$.key') AS k, COUNT(DISTINCT user_id) AS users FROM events ${qWhere} GROUP BY k`).bind(...qBinds).all();
  const qMap = {}; for (const r of qRows.results || []) if (r.k) qMap[r.k] = r.users;
  const order = await questionOrder(db, acc, funnelId, qMap);
  const questions = order.map(k => ({ key: k, users: qMap[k] })).filter(x => x.users != null);

  const utmRows = await db.prepare(
    `SELECT COALESCE(utm_source,'(direct)') AS source, COUNT(*) AS leads,
            SUM(CASE WHEN funnel_state='purchase_completed' THEN 1 ELSE 0 END) AS purchases
     FROM leads ${scopeDate} GROUP BY source ORDER BY leads DESC LIMIT 25`
  ).bind(...dateBinds).all();

  const dailyBinds = [...baseBinds, new Date(Date.now() - 14 * 86400000).toISOString()];
  const tsRows = await db.prepare(
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM leads ${scope} AND created_at >= ? GROUP BY day ORDER BY day ASC`
  ).bind(...dailyBinds).all();

  return json({
    total, byState, funnel,
    conversion: {
      lead_rate: total ? r1((leadCaptured / total) * 100) : 0,
      offer_rate: leadCaptured ? r1((offerViewed / leadCaptured) * 100) : 0,
      checkout_rate: offerViewed ? r1((checkout / offerViewed) * 100) : 0,
      purchase_rate: total ? r1((purchased / total) * 100) : 0,
    },
    questions, utm: utmRows.results || [], daily: tsRows.results || [],
    scopedToFunnel: !!funnelId,
  });
}

async function questionOrder(db, acc, funnelId, qMap) {
  if (funnelId) {
    const f = await db.prepare('SELECT config FROM funnels WHERE account_id = ? AND id = ?').bind(acc, funnelId).first();
    if (f) {
      try {
        const screens = (JSON.parse(f.config).screens || []);
        const keys = screens.filter(s => s.key).map(s => s.key);
        if (keys.length) return keys;
      } catch (e) { /* fall through */ }
    }
  }
  return Object.keys(qMap).sort((a, b) => (qMap[b] || 0) - (qMap[a] || 0));
}

function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function csvCell(v) { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
