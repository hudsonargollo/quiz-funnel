/**
 * WhatsApp provider — STUB.
 *
 * Planned: Meta WhatsApp Cloud API (graph.facebook.com/<ver>/<phone_number_id>/messages),
 * reusing the Meta Graph integration already in src/_lib/meta_ads.js. Will need a
 * WhatsApp Business phone number id + system-user token (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID).
 * Template messages are required to open a conversation outside the 24h window.
 *
 * Implemented as a stub so the dispatch layer (messaging/index.js) can route to it
 * today without a code rewrite when we turn it on.
 */

export function isConfigured(env) {
  return !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
}

export async function sendWhatsApp(/* env, { to, template, body } */) {
  throw new Error('WhatsApp channel not configured yet');
}
