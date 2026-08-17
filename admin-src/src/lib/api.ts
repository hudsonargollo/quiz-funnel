// Ported 1:1 from public/admin/index.html's api() helper — same cookie-based
// session, same error contract ({error: string} JSON body → thrown Error).
export class UnauthorizedError extends Error {
  constructor() {
    super('unauth');
  }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch('/api/' + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (r.status === 401) throw new UnauthorizedError();
  const ct = r.headers.get('Content-Type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && (data as any).error) || String(r.status));
  return data as T;
}

// AI endpoints all take a `lang` field so generated copy matches the admin's
// language (see src/_lib/ai.js's langLine()). The new builder has no language
// toggle yet (i18n tabs haven't been ported off the legacy admin), so this
// defaults to 'en' — revisit once i18n moves over.
export async function aiApi<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const init = { ...opts } as RequestInit;
  if (typeof init.body === 'string') {
    try {
      const b = JSON.parse(init.body);
      b.lang = b.lang || 'en';
      init.body = JSON.stringify(b);
    } catch {
      /* not JSON — leave as-is */
    }
  } else if (init.method === 'POST' && !init.body) {
    init.body = JSON.stringify({ lang: 'en' });
  }
  return api<T>('ai/' + path, init);
}
