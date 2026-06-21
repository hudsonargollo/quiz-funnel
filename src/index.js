/**
 * Platform Worker — single entry point.
 * Routes by path (/api/*) and by Host (dashboard vs funnel subdomain).
 * Serves static assets from the [assets] binding; injects funnel config into
 * the funnel shell HTML at request time.
 */
import { handleAuth } from './api/authapi.js';
import { handlePublic } from './api/public.js';
import { handleAdmin } from './api/admin.js';
import { resolveSurface, getFunnelBySlug, getSlugByHostname, publicFunnel } from './_lib/funnels.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ── API ──
      if (path.startsWith('/api/')) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
        if (path.startsWith('/api/auth/')) return handleAuth(request, env, path);
        if (path.startsWith('/api/public/')) return handlePublic(request, env, path, url);
        return handleAdmin(request, env, path, url); // /api/funnels, /api/crm/*
      }

      // ── Root: dashboard vs funnel page ──
      if (path === '/' || path === '') {
        // 1) custom domain → funnel (host override via ?host= for testing)
        const host = url.searchParams.get('host') || url.hostname;
        const domSlug = await getSlugByHostname(env.DB, host);
        if (domSlug) return serveFunnel(env, url, domSlug, request);
        // 2) platform subdomain / ?f= fallback, else dashboard
        const { surface, slug } = resolveSurface(url, env.PLATFORM_DOMAIN);
        if (surface === 'funnel') return serveFunnel(env, url, slug, request);
        return serveAsset(env, '/admin/index.html', request);
      }

      // ── Everything else: static assets ──
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('Worker error:', e);
      return new Response('Internal error', { status: 500 });
    }
  },
};

async function serveAsset(env, assetPath, request) {
  const u = new URL(request.url);
  u.pathname = assetPath;
  return env.ASSETS.fetch(new Request(u.toString(), { headers: request.headers }));
}

// Serve the funnel shell with config injected (no extra round-trip on the client).
// `?preview=1` renders draft funnels too (used by the visual builder iframe).
async function serveFunnel(env, url, slug, request) {
  const preview = url.searchParams.has('preview');
  const f = await getFunnelBySlug(env.DB, slug);
  if (!f || (!preview && f.status !== 'published')) {
    // Unknown/unpublished funnel → shell without config (preview pushes config via postMessage)
    return serveAsset(env, '/index.html', request);
  }
  const res = await serveAsset(env, '/index.html', request);
  let html = await res.text();
  const pf = publicFunnel(f);
  const boot = `<script>
window.SCREENS=${JSON.stringify(pf.screens)};
window.QUIZ_CONFIG=${JSON.stringify(pf.config)};
window.FUNNEL=${JSON.stringify({ id: pf.funnelId, accountId: pf.accountId, type: pf.type, slug: pf.slug, stripePublishableKey: pf.stripePublishableKey, postPurchaseUrl: pf.postPurchaseUrl, preview })};
</script>`;
  html = html.replace('<!--FUNNEL_BOOT-->', boot);
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
