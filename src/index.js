/**
 * Platform Worker — single entry point.
 *
 * Routing model (path-based on the platform host):
 *   offers.clubemkt.digital/            → dashboard (public/admin/index.html)
 *   offers.clubemkt.digital/<slug>      → funnel by slug (config injected server-side)
 *   offers.clubemkt.digital/api/*       → API
 *   offers.clubemkt.digital/css|js|…    → static assets
 * Customers' own hostnames (Phase 2 custom domains) still map a whole host → one
 * funnel via the `domains` table. Serves static assets from the [assets] binding;
 * injects funnel config into the funnel shell HTML at request time.
 */
import { handleAuth } from './api/authapi.js';
import { handlePublic } from './api/public.js';
import { handleAdmin } from './api/admin.js';
import { getFunnelBySlug, getSlugByHostname, publicFunnel } from './_lib/funnels.js';

// First path segments that are real assets/endpoints, never funnel slugs.
const RESERVED = new Set([
  'api', 'admin', 'admin-app', 'app', 'home', 'css', 'js', 'images', 'audio', 'assets', 'privacidade',
  'favicon.ico', 'robots.txt', 'sitemap.xml', 'index.html', '.well-known', 'milestones',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ── API ──
      if (path.startsWith('/api/')) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
        if (path.startsWith('/api/auth/')) return handleAuth(request, env, path);
        if (path.startsWith('/api/public/')) return handlePublic(request, env, path, url, ctx);
        return handleAdmin(request, env, path, url); // /api/funnels, /api/crm/*
      }

      const host = (url.searchParams.get('host') || url.hostname).toLowerCase();
      // Platform hosts use path-based routing (landing at /, dashboard at /admin,
      // funnels at /<slug>). PLATFORM_DOMAIN is primary; PLATFORM_DOMAINS adds
      // extra equivalent hosts (comma-separated), e.g. funnels.tektone.com.br.
      const platformHosts = new Set(
        [env.PLATFORM_DOMAIN, ...((env.PLATFORM_DOMAINS || '').split(','))]
          .map((s) => (s || '').trim().toLowerCase())
          .filter(Boolean)
      );
      const isPlatform = platformHosts.has(host);

      // ── Custom domains (Phase 2): a whole hostname maps to one funnel ──
      if (!isPlatform) {
        const domSlug = await getSlugByHostname(env.DB, host);
        if (domSlug) return serveFunnel(env, url, domSlug, request);
        // dev/preview convenience on workers.dev & unknown hosts: ?f=<slug>
        const qf = url.searchParams.get('f');
        if (qf) return serveFunnel(env, url, qf, request);
        if (path === '/' || path === '') return serveAsset(env, '/admin/index.html', request);
        return env.ASSETS.fetch(request);
      }

      // ── Platform host: path-based routing ──
      // Root → marketing landing; the app/dashboard lives at /admin (and /app).
      // Legacy `/?f=<slug>` links still resolve to that funnel (back-compat).
      if (path === '/' || path === '') {
        const qf = url.searchParams.get('f');
        if (qf) return serveFunnel(env, url, qf, request);
        return serveAsset(env, '/home/index.html', request);
      }
      const seg = path.split('/')[1];
      if (seg === 'admin') return serveAsset(env, '/admin/index.html', request);
      // New React/Vite builder (public/admin-app/, see admin-src/) — coexists
      // with the legacy dashboard at /admin during migration. Cutover moves
      // this to '/admin/index.html' once the new app reaches parity.
      if (seg === 'app') return serveAsset(env, '/admin-app/index.html', request);
      // Internal milestones tracker/report pages (/milestones or /milestones/<slug>) — SPA shell.
      if (seg === 'milestones') return serveAsset(env, '/milestones/index.html', request);
      // Reserved names and any path with a file extension → static asset.
      if (RESERVED.has(seg) || seg.includes('.')) return env.ASSETS.fetch(request);
      // Otherwise the first segment is a funnel slug (?f= still honored for preview).
      return serveFunnel(env, url, url.searchParams.get('f') || seg, request);
    } catch (e) {
      console.error('Worker error:', e);
      return new Response('Internal error', { status: 500 });
    }
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

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
  if (!f) {
    // In preview the builder pushes config via postMessage, so serve the bare shell.
    if (preview) return serveAsset(env, '/index.html', request);
    return new Response('Funnel not found', { status: 404 });
  }
  const pf = publicFunnel(f);
  // A funnel can point at its own HTML shell + JS bundle (e.g. a fully
  // translated clone) via config.shellPath, instead of the shared default.
  const shellPath = typeof pf.config.shellPath === 'string' && pf.config.shellPath ? pf.config.shellPath : '/index.html';
  if (f.status !== 'published' && !preview) {
    // An unpublished slug is a genuine 404 outside preview mode.
    return new Response('Funnel not found', { status: 404 });
  }
  const res = await serveAsset(env, shellPath, request);
  let html = await res.text();
  const pixelId = /^\d+$/.test(pf.fbPixelId || '') ? pf.fbPixelId : null;
  const pixel = pixelId && !preview ? `<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>` : '';
  const boot = `${pixel}<script>
window.SCREENS=${JSON.stringify(pf.screens)};
window.QUIZ_CONFIG=${JSON.stringify(pf.config)};
window.FUNNEL=${JSON.stringify({ id: pf.funnelId, accountId: pf.accountId, type: pf.type, slug: pf.slug, stripePublishableKey: pf.stripePublishableKey, postPurchaseUrl: pf.postPurchaseUrl, fbPixelId: pixelId, preview })};
</script>`;
  html = html.replace('<!--FUNNEL_BOOT-->', boot);
  // Per-funnel browser tab title (the shell ships a generic placeholder).
  const title = escapeHtml(f.name || pf.slug || 'Funnel');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
