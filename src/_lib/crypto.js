/**
 * WebCrypto helpers — password hashing (PBKDF2), secret encryption (AES-GCM),
 * random ids, and constant-time compare. No Node APIs (Workers runtime).
 */

// Cloudflare Workers caps PBKDF2 at 100k iterations (deriveBits throws above it).
const PBKDF2_ITERATIONS = 100000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes) {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomId(prefix = '', bytes = 16) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let hex = '';
  for (const x of b) hex += x.toString(16).padStart(2, '0');
  return prefix ? `${prefix}_${hex}` : hex;
}

export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Password hashing (PBKDF2-HMAC-SHA256) ──────
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(bits)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'pbkdf2') return false;
    const bits = await deriveBits(password, fromB64(saltB64), parseInt(iterStr, 10));
    return constantTimeEqual(toB64(bits), hashB64);
  } catch (e) {
    return false;
  }
}

async function deriveBits(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
}

// ── Secret encryption (AES-GCM) — for tenant Stripe keys ──
async function aesKey(secretKeyB64) {
  // SECRETS_KEY is a base64-encoded 32-byte key (set as a Worker secret).
  return crypto.subtle.importKey('raw', fromB64(secretKeyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext, secretKeyB64) {
  if (plaintext == null || plaintext === '') return null;
  const key = await aesKey(secretKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return `${toB64(iv)}:${toB64(ct)}`;
}

export async function decryptSecret(packed, secretKeyB64) {
  if (!packed) return null;
  try {
    const [ivB64, ctB64] = packed.split(':');
    const key = await aesKey(secretKeyB64);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64));
    return dec.decode(pt);
  } catch (e) {
    return null;
  }
}
