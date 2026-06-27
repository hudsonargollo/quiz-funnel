/**
 * Email provider — Resend (https://resend.com).
 *
 * Workers can't open SMTP, so we POST to Resend's HTTP API. Requires the
 * RESEND_API_KEY secret and a verified sender domain (mail.clubemkt.digital).
 * The default From address is configurable via MAIL_FROM_DEFAULT.
 *
 * Returns { id } (Resend's message id) on success; throws on any failure so
 * the dispatch layer can log status='failed' + the error.
 */

const RESEND_URL = 'https://api.resend.com/emails';

export function isConfigured(env) {
  return !!env.RESEND_API_KEY;
}

/** Platform default sender, e.g. "Tektone Funnels <noreply@mail.clubemkt.digital>". */
export function defaultFrom(env) {
  return env.MAIL_FROM_DEFAULT || 'Tektone Funnels <noreply@mail.clubemkt.digital>';
}

/**
 * Send one email via Resend.
 * @param {object} env
 * @param {object} msg - { to, from?, subject, html, text?, replyTo?, attachments? }
 *   attachments: [{ filename, content }] where content is a base64 string.
 * @returns {Promise<{id:string}>}
 */
export async function sendEmail(env, { to, from, subject, html, text, replyTo, attachments } = {}) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  if (!to) throw new Error('Missing recipient');

  const body = {
    from: from || defaultFrom(env),
    to: Array.isArray(to) ? to : [to],
    subject: subject || '',
    html: html || undefined,
    text: text || undefined,
  };
  if (replyTo) body.reply_to = replyTo;
  if (attachments && attachments.length) body.attachments = attachments;

  let res;
  try {
    res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Resend request failed: ${e.message}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.name || `Resend error ${res.status}`);
  }
  return { id: data.id };
}
