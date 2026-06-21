/**
 * Tenant auth: signup/login, server-side sessions, cookie helpers.
 * Sessions live in D1 (revocable); the cookie holds only an opaque token.
 */
import { hashPassword, verifyPassword, randomId } from './crypto.js';

const SESSION_TTL_DAYS = 30;
const COOKIE = 'qf_sid';

function nowISO() { return new Date().toISOString(); }
function plusDaysISO(d) { return new Date(Date.now() + d * 86400000).toISOString(); }

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(id, { clear = false } = {}) {
  const base = `${COOKIE}=${clear ? '' : id}; HttpOnly; Secure; SameSite=Lax; Path=/`;
  return clear ? `${base}; Max-Age=0` : `${base}; Max-Age=${SESSION_TTL_DAYS * 86400}`;
}

// ── Signup: create account + owner user ─────────
export async function signup(db, email, password, name) {
  email = (email || '').trim().toLowerCase();
  if (!email || !password || password.length < 8) {
    return { error: 'Email and a password of 8+ characters are required', status: 400 };
  }
  const existing = await db.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first();
  if (existing) return { error: 'An account with that email already exists', status: 409 };

  const accountId = randomId('acc');
  const userId = randomId('usr');
  const ts = nowISO();
  const pwHash = await hashPassword(password);

  await db.batch([
    db.prepare('INSERT INTO accounts (id, name, created_at, updated_at) VALUES (?,?,?,?)')
      .bind(accountId, name || email, ts, ts),
    db.prepare('INSERT INTO users (id, account_id, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)')
      .bind(userId, accountId, email, pwHash, 'owner', ts),
  ]);

  const session = await createSession(db, userId, accountId);
  return { accountId, userId, session };
}

// ── Login ───────────────────────────────────────
export async function login(db, email, password) {
  email = (email || '').trim().toLowerCase();
  const user = await db.prepare('SELECT id, account_id, password_hash FROM users WHERE lower(email) = ?').bind(email).first();
  if (!user) return { error: 'Invalid email or password', status: 401 };
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { error: 'Invalid email or password', status: 401 };
  const session = await createSession(db, user.id, user.account_id);
  return { accountId: user.account_id, userId: user.id, session };
}

export async function createSession(db, userId, accountId) {
  const id = randomId('', 32);
  await db.prepare('INSERT INTO sessions (id, user_id, account_id, expires_at, created_at) VALUES (?,?,?,?,?)')
    .bind(id, userId, accountId, plusDaysISO(SESSION_TTL_DAYS), nowISO()).run();
  return id;
}

export async function destroySession(db, id) {
  if (id) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
}

// ── Resolve the current tenant from the cookie ──
// Returns { userId, accountId } or null.
export async function getSession(db, request) {
  const sid = parseCookies(request)[COOKIE];
  if (!sid) return null;
  const row = await db.prepare('SELECT user_id, account_id, expires_at FROM sessions WHERE id = ?').bind(sid).first();
  if (!row) return null;
  if (row.expires_at < nowISO()) { await destroySession(db, sid); return null; }
  return { userId: row.user_id, accountId: row.account_id, sid };
}

export function getCookieToken(request) {
  return parseCookies(request)[COOKIE] || null;
}
