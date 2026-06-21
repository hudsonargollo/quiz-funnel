/**
 * POST /api/webhook
 * Handles Stripe webhook events.
 * Env vars required: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY
 */

import { setLeadState } from '../_lib/crm.js';

const STRIPE_SIGNATURE_HEADER = 'stripe-signature';

export async function onRequestPost(context) {
  const { request, env } = context;

  const rawBody = await request.text();
  const signature = request.headers.get(STRIPE_SIGNATURE_HEADER);

  // ── Verify Stripe webhook signature ──────────
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  let event;
  try {
    event = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook signature invalid: ${err.message}`, { status: 400 });
  }

  // ── Handle events ─────────────────────────────
  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session, env);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await handlePaymentFailed(pi, env);
        break;
      }

      case 'customer.subscription.deleted': {
        // Future: handle subscription cancellation
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
    }
  } catch (err) {
    console.error(`Error handling event ${event.type}:`, err);
    // Return 200 to prevent Stripe retrying for non-transient errors
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Handler: checkout.session.completed ──────────
async function handleCheckoutCompleted(session, env) {
  const userId = session.metadata?.userId;
  const email = session.customer_email || session.customer_details?.email;
  if (!env.DB) return;

  await setLeadState(env.DB, { userId, email }, 'purchase_completed', {
    stripe_customer_id: session.customer || null,
    stripe_session_id: session.id || null,
    stripe_payment_intent_id: session.payment_intent || null,
  });

  console.log(`Purchase completed: userId=${userId}, email=${email}`);
}

// ── Handler: payment_intent.payment_failed ───────
async function handlePaymentFailed(pi, env) {
  const email = pi.last_payment_error?.payment_method?.billing_details?.email;
  if (!email || !env.DB) return;

  await setLeadState(env.DB, { email }, 'payment_failed');
}

// ── Stripe signature verification ────────────────
// Implemented manually — no Node crypto in edge workers
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader) throw new Error('Missing stripe-signature header');

  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) {
    throw new Error('Invalid signature format');
  }

  // Check timestamp tolerance (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new Error('Timestamp too old');
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(signedPayload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const expectedSig = Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (expectedSig !== signature) {
    throw new Error('Signature mismatch');
  }

  return JSON.parse(payload);
}
