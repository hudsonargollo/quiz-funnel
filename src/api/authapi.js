/** Auth endpoints: signup / login / logout / me */
import { json, err } from '../_lib/http.js';
import { signup, login, destroySession, getSession, sessionCookie, getCookieToken } from '../_lib/auth.js';

export async function handleAuth(request, env, path) {
  const db = env.DB;

  if (path === '/api/auth/signup' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const r = await signup(db, b.email, b.password, b.name);
    if (r.error) return err(r.error, r.status);
    return json({ ok: true, accountId: r.accountId }, 200, { 'Set-Cookie': sessionCookie(r.session) });
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const r = await login(db, b.email, b.password);
    if (r.error) return err(r.error, r.status);
    return json({ ok: true, accountId: r.accountId }, 200, { 'Set-Cookie': sessionCookie(r.session) });
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    await destroySession(db, getCookieToken(request));
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', { clear: true }) });
  }

  if (path === '/api/auth/me' && request.method === 'GET') {
    const s = await getSession(db, request);
    if (!s) return err('Unauthorized', 401);
    const user = await db.prepare('SELECT u.email, a.name AS account_name FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.id = ?')
      .bind(s.userId).first();
    return json({ accountId: s.accountId, userId: s.userId, email: user?.email, accountName: user?.account_name });
  }

  return err('Not found', 404);
}
