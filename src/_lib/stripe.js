/**
 * Stripe helpers (per-tenant). Each funnel uses its own secret/webhook secret.
 */

export async function createCheckoutSession(secretKey, params) {
  const body = new URLSearchParams(params);
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const json = await res.json();
  return { ok: res.ok, json };
}

// Manual Stripe signature verification (no Node crypto in Workers).
export async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader) throw new Error('Missing stripe-signature header');
  const parts = sigHeader.split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error('Invalid signature format');
  if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)) > 300) {
    throw new Error('Timestamp too old');
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (expected !== signature) throw new Error('Signature mismatch');
  return JSON.parse(payload);
}
