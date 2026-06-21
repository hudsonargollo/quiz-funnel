/**
 * Cloudflare for SaaS — Custom Hostnames API.
 * Activates when SAAS_ZONE_ID + CF_API_TOKEN (and SAAS_CNAME_TARGET) are set.
 * Until then the platform stores domains in D1 but can't auto-provision SSL.
 */

export function isConfigured(env) {
  return !!(env.CF_API_TOKEN && env.SAAS_ZONE_ID);
}
export function cnameTarget(env) {
  return env.SAAS_CNAME_TARGET || '';
}

function api(env, path, init = {}) {
  return fetch(`https://api.cloudflare.com/client/v4/zones/${env.SAAS_ZONE_ID}${path}`, {
    ...init,
    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  }).then(r => r.json());
}

/** Create a custom hostname; SSL via HTTP DCV. Returns {ok, id, status, sslStatus, error}. */
export async function createCustomHostname(env, hostname) {
  const res = await api(env, '/custom_hostnames', {
    method: 'POST',
    body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } }),
  });
  if (!res.success) return { ok: false, error: res.errors?.[0]?.message || 'Cloudflare error' };
  return { ok: true, id: res.result.id, status: res.result.status, sslStatus: res.result.ssl?.status };
}

export async function getCustomHostname(env, id) {
  const res = await api(env, `/custom_hostnames/${id}`);
  if (!res.success) return { ok: false, error: res.errors?.[0]?.message || 'Cloudflare error' };
  return { ok: true, status: res.result.status, sslStatus: res.result.ssl?.status };
}

export async function deleteCustomHostname(env, id) {
  const res = await api(env, `/custom_hostnames/${id}`, { method: 'DELETE' });
  return { ok: !!res.success };
}
