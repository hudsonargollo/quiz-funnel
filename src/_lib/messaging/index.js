/**
 * Messaging dispatch — channel-agnostic outbound layer.
 *
 * One entry point per concern:
 *   • channelStatus(env)              → which channels are configured (admin UI)
 *   • sendMessage(env, db, msg)       → low-level: route + log one message
 *   • deliverLeadMagnet(env, db, o)   → high-level: idempotent deliverable email
 *
 * Email is live (Resend); WhatsApp + Instagram are stubs that throw until
 * configured. Every send writes a row to `messages` (queued → sent|failed) so
 * the dashboard and future provider webhooks have a single source of truth.
 */
import { randomId } from '../crypto.js';
import * as emailProvider from './email.js';
import * as waProvider from './whatsapp.js';
import * as igProvider from './instagram.js';
import { renderDeliverable } from './templates.js';

const nowISO = () => new Date().toISOString();

const PROVIDERS = {
  email:     { name: 'resend',         configured: emailProvider.isConfigured },
  whatsapp:  { name: 'meta_whatsapp',  configured: waProvider.isConfigured },
  instagram: { name: 'meta_instagram', configured: igProvider.isConfigured },
};

/** Which channels can send right now — surfaced to the dashboard. */
export function channelStatus(env) {
  return {
    email:     emailProvider.isConfigured(env),
    whatsapp:  waProvider.isConfigured(env),
    instagram: igProvider.isConfigured(env),
  };
}

/** Route a built payload to the right provider. Throws on failure. */
async function dispatch(env, channel, payload) {
  if (channel === 'email')     return emailProvider.sendEmail(env, payload);
  if (channel === 'whatsapp')  return waProvider.sendWhatsApp(env, payload);
  if (channel === 'instagram') return igProvider.sendInstagram(env, payload);
  throw new Error(`Unknown channel: ${channel}`);
}

async function markSent(db, id, providerId) {
  await db.prepare('UPDATE messages SET status = ?, provider_id = ?, updated_at = ? WHERE id = ?')
    .bind('sent', providerId || null, nowISO(), id).run();
}
async function markFailed(db, id, error) {
  await db.prepare('UPDATE messages SET status = ?, error = ?, updated_at = ? WHERE id = ?')
    .bind('failed', String(error).slice(0, 500), nowISO(), id).run();
}

/**
 * Low-level send + log. Creates a fresh `messages` row every call (no dedup) —
 * use this for test sends and follow-ups. Returns { ok, id, providerId, error }.
 */
export async function sendMessage(env, db, msg) {
  const { accountId, funnelId = null, userId = null, channel = 'email', template = 'adhoc', to, meta = null } = msg;
  const id = randomId('msg');
  const ts = nowISO();
  const provider = PROVIDERS[channel]?.name || channel;
  await db.prepare(
    `INSERT INTO messages (id, account_id, funnel_id, user_id, channel, provider, template, to_addr, subject, status, meta, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, accountId, funnelId, userId, channel, provider, template, to || null, msg.subject || null, 'queued', meta ? JSON.stringify(meta) : null, ts, ts).run();

  try {
    const r = await dispatch(env, channel, payloadFor(env, channel, msg));
    await markSent(db, id, r?.id);
    return { ok: true, id, providerId: r?.id };
  } catch (e) {
    await markFailed(db, id, e.message);
    return { ok: false, id, error: e.message };
  }
}

/** Build the provider-specific payload from a generic message. */
function payloadFor(env, channel, msg) {
  if (channel === 'email') {
    return { to: msg.to, from: msg.from, subject: msg.subject, html: msg.html, text: msg.text, replyTo: msg.replyTo, attachments: msg.attachments };
  }
  return { to: msg.to, body: msg.text || msg.html, template: msg.template };
}

/** Sender display-name + verified address, e.g. "Acme <noreply@mail.clubemkt.digital>". */
function fromWithName(env, name) {
  const base = emailProvider.defaultFrom(env);
  if (!name) return base;
  const m = base.match(/<([^>]+)>/);
  const addr = m ? m[1] : base;
  return `${name} <${addr}>`;
}

/**
 * Idempotently deliver a funnel's lead magnet to one lead. Safe to call on every
 * opt-in upsert: a UNIQUE index on (account, funnel, user, channel) for
 * template='deliverable' makes the second call a no-op.
 *
 * @returns {Promise<{ok:boolean, skipped?:string, id?:string, error?:string}>}
 */
export async function deliverLeadMagnet(env, db, { funnel, userId, email, firstName }) {
  let config = {};
  try { config = JSON.parse(funnel.config || '{}'); } catch (e) {}
  const d = (config.config || config).delivery || {};
  if (!d.enabled) return { ok: false, skipped: 'disabled' };

  const channel = d.channel || 'email';
  if (channel === 'email' && !email) return { ok: false, skipped: 'no-email' };

  // Idempotency gate: claim the (account,funnel,lead,channel) deliverable slot.
  const id = randomId('msg');
  const ts = nowISO();
  const provider = PROVIDERS[channel]?.name || channel;
  const deliverableUrl = d.deliverableUrl || (config.config || config).leadMagnetUrl || '';
  const claim = await db.prepare(
    `INSERT OR IGNORE INTO messages (id, account_id, funnel_id, user_id, channel, provider, template, to_addr, subject, status, meta, created_at, updated_at)
     VALUES (?,?,?,?,?,?, 'deliverable', ?,?, 'queued', ?,?,?)`
  ).bind(id, funnel.account_id, funnel.id, userId || null, channel, provider, email || null, d.subject || null,
         JSON.stringify({ deliverableUrl }), ts, ts).run();

  if (!claim.meta || claim.meta.changes === 0) return { ok: false, skipped: 'already-sent' };

  try {
    if (channel !== 'email') throw new Error(`${channel} channel not configured yet`);
    const cfg = config.config || config;
    const brandName = d.fromName || funnel.name || cfg.productName || 'FunnelsTone';
    const { subject, html, text } = renderDeliverable({
      brandName,
      firstName,
      subject: d.subject,
      intro: d.intro,
      deliverableUrl,
      buttonLabel: d.buttonLabel,
    });
    const finalSubject = subject || `Seu material de ${brandName}`;
    const r = await emailProvider.sendEmail(env, {
      to: email,
      from: fromWithName(env, d.fromName),
      subject: finalSubject,
      html,
      text,
      replyTo: d.replyTo || undefined,
    });
    await db.prepare('UPDATE messages SET subject = ?, status = ?, provider_id = ?, updated_at = ? WHERE id = ?')
      .bind(finalSubject, 'sent', r?.id || null, nowISO(), id).run();
    return { ok: true, id, providerId: r?.id };
  } catch (e) {
    await markFailed(db, id, e.message);
    return { ok: false, id, error: e.message };
  }
}
