/** Public funnel endpoints (no auth; scoped to the funnel resolved from Host). */
import { json, err } from '../_lib/http.js';
import { upsertLead, setLeadState, computeIMC } from '../_lib/crm.js';
import { getFunnelBySlug, getFunnelById, getSlugByHostname, publicFunnel } from '../_lib/funnels.js';
import { decryptSecret } from '../_lib/crypto.js';
import { createCheckoutSession, verifyStripeSignature } from '../_lib/stripe.js';
import { deliverLeadMagnet } from '../_lib/messaging/index.js';

// First path segment of a funnel-page URL (e.g. "/drapatricia/..." → "drapatricia").
function slugFromPath(pathname) {
  const seg = (pathname || '').split('/')[1] || '';
  return seg.includes('.') ? '' : seg;
}

// True when this funnel's config opts into automatic deliverable sending.
function deliveryEnabled(f) {
  try {
    const c = JSON.parse(f.config || '{}');
    return !!((c.config || c).delivery || {}).enabled;
  } catch (e) { return false; }
}

/**
 * Resolve the funnel a public API call belongs to. With path-based routing the
 * slug isn't in the API path, so we use, in order: explicit body identifiers
 * (the funnel shell injects window.FUNNEL.slug), a custom-domain host mapping,
 * then the Referer page path / ?f= fallback.
 */
async function funnelForRequest(db, url, env, body, request) {
  if (body?.funnelId) {
    const f = await db.prepare('SELECT * FROM funnels WHERE id = ?').bind(body.funnelId).first();
    if (f) return f;
  }
  if (body?.funnelSlug) {
    const f = await getFunnelBySlug(db, body.funnelSlug);
    if (f) return f;
  }
  const host = (url.searchParams.get('host') || url.hostname).toLowerCase();
  const platform = (env.PLATFORM_DOMAIN || '').toLowerCase();
  if (!(platform && host === platform)) {
    const domSlug = await getSlugByHostname(db, host);
    if (domSlug) return getFunnelBySlug(db, domSlug);
  }
  let slug = url.searchParams.get('f') || '';
  if (!slug && request) {
    try { slug = slugFromPath(new URL(request.headers.get('Referer')).pathname); } catch (e) { /* no/invalid referer */ }
  }
  return slug ? getFunnelBySlug(db, slug) : null;
}

// Where Stripe should send the buyer back to — the funnel page they came from.
function funnelReturnBase(url, f, request) {
  try {
    const r = new URL(request.headers.get('Referer'));
    return r.origin + r.pathname.replace(/\/$/, '');
  } catch (e) {
    return `${url.origin}/${f.slug}`;
  }
}

export async function handlePublic(request, env, path, url, ctx) {
  const db = env.DB;

  // ── Funnel config for rendering ──
  if (path === '/api/public/funnel' && request.method === 'GET') {
    const f = await funnelForRequest(db, url, env, null, request);
    if (!f) return err('Funnel not found', 404);
    return json(publicFunnel(f));
  }

  // ── Lead upsert ──
  if (path === '/api/public/upsert' && request.method === 'POST') {
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return err('Forbidden', 403);
    const body = await request.json().catch(() => null);
    if (!body || (!body.userId && !body.email)) return err('No identifier', 400);
    if (JSON.stringify(body.quizData || {}).length > 8000) return err('Payload too large', 413);
    const f = await funnelForRequest(db, url, env, body, request);
    if (!f) return err('Funnel not found', 404);
    const meta = {
      ipCountry: request.headers.get('CF-IPCountry') || null,
      userAgent: request.headers.get('User-Agent') || null,
      referrer: body.referrer || null,
    };
    const userId = await upsertLead(db, { accountId: f.account_id, funnelId: f.id }, body, meta);

    // Deliver the lead magnet on opt-in (fire-and-forget; idempotent per lead).
    // Runs only when the funnel has delivery.enabled and we captured an email.
    const email = (body.email || '').trim();
    if (email && deliveryEnabled(f)) {
      const firstName = ((body.metadata?.nome || body.nome || '').trim().split(/\s+/)[0]) || '';
      const job = deliverLeadMagnet(env, db, { funnel: f, userId, email, firstName })
        .catch((e) => console.error('deliverLeadMagnet failed:', e));
      if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
    }
    return json({ ok: true, userId });
  }

  // ── Create Stripe checkout (per-funnel keys) ──
  if (path === '/api/public/checkout' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const f = await funnelForRequest(db, url, env, body, request);
    if (!f) return err('Funnel not found', 404);
    const secretKey = await decryptSecret(f.stripe_secret_enc, env.SECRETS_KEY);
    if (!secretKey || !f.stripe_price_id) return err('Payments not configured for this funnel', 400);

    const returnBase = funnelReturnBase(url, f, request);
    const params = {
      mode: 'payment',
      'line_items[0][price]': f.stripe_price_id,
      'line_items[0][quantity]': '1',
      success_url: `${returnBase}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}?cancelled=true`,
      'payment_method_types[0]': 'card',
      'billing_address_collection': 'auto',
      'allow_promotion_codes': 'true',
      'metadata[accountId]': f.account_id,
      'metadata[funnelId]': f.id,
      'metadata[userId]': body.userId || '',
      'metadata[nome]': body.metadata?.nome || '',
      'metadata[objetivo]': body.metadata?.objetivo || '',
      'metadata[imc]': String(body.metadata?.imc || ''),
    };
    if (body.email) params['customer_email'] = body.email;

    const { ok, json: sess } = await createCheckoutSession(secretKey, params);
    if (!ok || !sess.url) return err(sess.error?.message || 'Stripe error', 400);

    try {
      await setLeadState(db, { accountId: f.account_id, funnelId: f.id, userId: body.userId, email: body.email },
        'checkout_initiated', { stripe_session_id: sess.id });
    } catch (e) { console.error('checkout_initiated write failed:', e); }

    return json({ url: sess.url, sessionId: sess.id });
  }

  // ── Stripe webhook (per-funnel path → per-funnel secret) ──
  const wh = path.match(/^\/api\/public\/webhook\/([^/]+)$/);
  if (wh && request.method === 'POST') {
    const funnelId = wh[1];
    const f = await db.prepare('SELECT * FROM funnels WHERE id = ?').bind(funnelId).first();
    if (!f) return new Response('Unknown funnel', { status: 404 });
    const whSecret = await decryptSecret(f.stripe_webhook_secret_enc, env.SECRETS_KEY);
    if (!whSecret) return new Response('Webhook not configured', { status: 500 });

    const raw = await request.text();
    let event;
    try {
      event = await verifyStripeSignature(raw, request.headers.get('stripe-signature'), whSecret);
    } catch (e) {
      return new Response(`Webhook signature invalid: ${e.message}`, { status: 400 });
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const s = event.data.object;
        await setLeadState(db, {
          accountId: f.account_id, funnelId: f.id,
          userId: s.metadata?.userId, email: s.customer_email || s.customer_details?.email,
        }, 'purchase_completed', {
          stripe_customer_id: s.customer || null,
          stripe_session_id: s.id || null,
          stripe_payment_intent_id: s.payment_intent || null,
        });
      } else if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object;
        const email = pi.last_payment_error?.payment_method?.billing_details?.email;
        if (email) await setLeadState(db, { accountId: f.account_id, funnelId: f.id, email }, 'payment_failed');
      }
    } catch (e) {
      console.error('webhook handler error:', e);
    }
    return json({ received: true });
  }

  return err('Not found', 404);
}
