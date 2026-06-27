/**
 * Instagram provider — STUB.
 *
 * Planned: Meta Instagram Messaging API via the Messenger Platform
 * (graph.facebook.com/<ver>/<ig_id>/messages), reusing the Meta Graph integration
 * in src/_lib/meta_ads.js. Needs an IG professional account linked to a Facebook
 * Page + a page token with instagram_manage_messages (INSTAGRAM_TOKEN, INSTAGRAM_IG_ID).
 * Messages can only be sent to users who messaged first, within the messaging window.
 *
 * Stubbed so the dispatch layer can route to it without a rewrite when enabled.
 */

export function isConfigured(env) {
  return !!(env.INSTAGRAM_TOKEN && env.INSTAGRAM_IG_ID);
}

export async function sendInstagram(/* env, { to, body } */) {
  throw new Error('Instagram channel not configured yet');
}
