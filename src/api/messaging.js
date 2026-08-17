/**
 * Messaging admin endpoints (/api/messaging/*). Mounted from handleAdmin after the
 * session resolves, so `acc` is the authenticated account id. Used by the dashboard
 * to show channel status, send a test deliverable, and review the send log.
 */
import { json, err } from '../_lib/http.js';
import { getFunnelById } from '../_lib/funnels.js';
import { channelStatus, sendMessage } from '../_lib/messaging/index.js';
import { renderDeliverable } from '../_lib/messaging/templates.js';
import { defaultFrom } from '../_lib/messaging/email.js';

export async function handleMessaging(db, env, request, path, url, acc) {
  // ── Which channels are configured (drives the dashboard UI) ──
  if (path === '/api/messaging/status' && request.method === 'GET') {
    return json({ channels: channelStatus(env), from: defaultFrom(env) });
  }

  // ── Send a test deliverable to an arbitrary address (no idempotency) ──
  if (path === '/api/messaging/test' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const email = (b.email || '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter a valid email', 400);
    const f = await getFunnelById(db, acc, b.funnelId);
    if (!f) return err('Funnel not found', 404);

    let parsed = {}; try { parsed = JSON.parse(f.config || '{}'); } catch (e) {}
    const cfg = parsed.config || parsed;
    const d = cfg.delivery || {};
    const brandName = d.fromName || f.name || cfg.productName || 'FunnelsTone';
    const { subject, html, text } = renderDeliverable({
      brandName,
      firstName: (b.firstName || '').trim(),
      subject: d.subject,
      intro: d.intro,
      deliverableUrl: d.deliverableUrl || cfg.leadMagnetUrl || '',
      buttonLabel: d.buttonLabel,
    });
    const r = await sendMessage(env, db, {
      accountId: acc, funnelId: f.id, channel: 'email', template: 'test', to: email,
      subject: subject || `[teste] Seu material de ${brandName}`, html, text,
      from: d.fromName ? `${d.fromName} <${(defaultFrom(env).match(/<([^>]+)>/) || [, defaultFrom(env)])[1]}>` : undefined,
    });
    if (!r.ok) return err(r.error || 'Send failed', 502);
    return json({ ok: true, id: r.id, providerId: r.providerId });
  }

  // ── Recent send log (optionally scoped to a funnel) ──
  if (path === '/api/messaging/log' && request.method === 'GET') {
    const funnelId = url.searchParams.get('funnelId');
    const rows = funnelId
      ? await db.prepare('SELECT id, funnel_id, channel, template, to_addr, subject, status, error, created_at FROM messages WHERE account_id = ? AND funnel_id = ? ORDER BY created_at DESC LIMIT 50').bind(acc, funnelId).all()
      : await db.prepare('SELECT id, funnel_id, channel, template, to_addr, subject, status, error, created_at FROM messages WHERE account_id = ? ORDER BY created_at DESC LIMIT 50').bind(acc).all();
    return json({ results: rows.results || [] });
  }

  return err('Not found', 404);
}
