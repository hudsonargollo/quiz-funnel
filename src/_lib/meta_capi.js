/**
 * Meta Conversions API (server-side event mirror of the browser Pixel).
 * Fire-and-forget: failures are logged, never block the caller's response.
 * Requires the funnel to have both fb_pixel_id and an encrypted fb_access_token_enc.
 */
import { decryptSecret } from './crypto.js';

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function capiConfigured(f) {
  return !!(f.fb_pixel_id && f.fb_access_token_enc);
}

/**
 * Send one event. `userData` may include email/phone (hashed here) and
 * clientIp/userAgent (passed through as-is, per Meta's spec).
 */
export async function sendCapiEvent(env, f, { eventName, eventSourceUrl, eventId, userData = {}, customData = {} }) {
  if (!capiConfigured(f)) return;
  try {
    const token = await decryptSecret(f.fb_access_token_enc, env.SECRETS_KEY);
    if (!token) return;
    const ud = {};
    if (userData.email) ud.em = [await sha256Hex(userData.email)];
    if (userData.clientIp) ud.client_ip_address = userData.clientIp;
    if (userData.userAgent) ud.client_user_agent = userData.userAgent;

    const ver = env.META_GRAPH_VERSION || 'v21.0';
    const body = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: eventSourceUrl || undefined,
        event_id: eventId || undefined,
        user_data: ud,
        custom_data: Object.keys(customData).length ? customData : undefined,
      }],
    };
    const res = await fetch(`https://graph.facebook.com/${ver}/${f.fb_pixel_id}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('Meta CAPI error:', res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.error('Meta CAPI send failed:', e);
  }
}
