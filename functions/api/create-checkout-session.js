/**
 * POST /api/create-checkout-session
 * Creates a Stripe Checkout Session and returns the URL.
 * Env vars required: STRIPE_SECRET_KEY, STRIPE_PRICE_ID
 */
import { setLeadState } from '../_lib/crm.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { email, userId, metadata = {} } = body;

    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const origin = new URL(request.url).origin;

    // Build Stripe Checkout Session via API
    const params = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price]': env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      success_url: `${origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?cancelled=true`,
      'payment_method_types[0]': 'card',
      'billing_address_collection': 'auto',
      'allow_promotion_codes': 'true',
    });

    // Pre-fill email if available
    if (email) {
      params.set('customer_email', email);
    }

    // Store metadata for webhook correlation
    params.set('metadata[userId]', userId || '');
    params.set('metadata[nome]', metadata.nome || '');
    params.set('metadata[objetivo]', metadata.objetivo || '');
    params.set('metadata[imc]', String(metadata.imc || ''));

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok || !session.url) {
      console.error('Stripe error:', JSON.stringify(session));
      return new Response(
        JSON.stringify({ error: session.error?.message || 'Stripe error' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Record checkout_initiated in D1 (non-fatal on failure)
    if (env.DB && (userId || email)) {
      try {
        await setLeadState(env.DB, { userId, email }, 'checkout_initiated', {
          stripe_session_id: session.id,
        });
      } catch (e) {
        console.error('D1 checkout_initiated write failed:', e);
      }
    }

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    console.error('create-checkout-session error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
