/**
 * POST /api/crm/upsert
 * Receives the browser session and upserts the lead into D1.
 * Called (debounced) on key funnel events.
 */
import { upsertLead } from '../../_lib/crm.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json' };

  // Same-origin only — this endpoint accepts unauthenticated writes from the
  // funnel, so reject cross-site callers to limit drive-by abuse.
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403, headers });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'DB not bound' }), { status: 500, headers });
  }

  try {
    const body = await request.json();

    // Lightweight guards
    if (!body || (!body.userId && !body.email)) {
      return new Response(JSON.stringify({ ok: false, error: 'No identifier' }), { status: 400, headers });
    }
    if (JSON.stringify(body.quizData || {}).length > 8000) {
      return new Response(JSON.stringify({ ok: false, error: 'Payload too large' }), { status: 413, headers });
    }

    const meta = {
      ipCountry: request.headers.get('CF-IPCountry') || null,
      userAgent: request.headers.get('User-Agent') || null,
      referrer: body.referrer || null,
    };

    const userId = await upsertLead(env.DB, body, meta);
    return new Response(JSON.stringify({ ok: true, userId }), { status: 200, headers });
  } catch (err) {
    console.error('CRM upsert error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Server error' }), { status: 500, headers });
  }
}
