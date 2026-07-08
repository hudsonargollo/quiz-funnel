/**
 * AI Ads add-on: account-wide brand kit (tone, colors, fonts, voice guidelines, logo).
 * One row per account, created lazily on first access — same pattern as ai_addons in
 * credits.js. Folded into strategy/copy/image prompts (see briefText in ai.js) so
 * generated creatives stay on-brand instead of generic.
 */
function nowISO() { return new Date().toISOString(); }

const DEFAULTS = { name: null, tone: null, colors: [], fonts: null, voice_dos: null, voice_donts: null, logo_key: null };

function parseKit(row) {
  if (!row) return { ...DEFAULTS };
  let colors = [];
  try { colors = JSON.parse(row.colors || '[]'); } catch (e) {}
  return {
    name: row.name || null, tone: row.tone || null, colors,
    fonts: row.fonts || null, voice_dos: row.voice_dos || null, voice_donts: row.voice_donts || null,
    logo_key: row.logo_key || null, updated_at: row.updated_at || null,
  };
}

/** Fetch the account's brand kit, returning defaults (not persisted) if none set yet. */
export async function getBrandKit(db, accountId) {
  const row = await db.prepare('SELECT * FROM ai_brand_kits WHERE account_id = ?').bind(accountId).first();
  return parseKit(row);
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;

/** Upsert the account's brand kit. `patch` fields are all optional; omitted fields keep their stored value. */
export async function upsertBrandKit(db, accountId, patch) {
  const name = patch.name != null ? String(patch.name).trim().slice(0, 100) : undefined;
  const tone = patch.tone != null ? String(patch.tone).trim().slice(0, 1000) : undefined;
  const fonts = patch.fonts != null ? String(patch.fonts).trim().slice(0, 300) : undefined;
  const voice_dos = patch.voice_dos != null ? String(patch.voice_dos).trim().slice(0, 1000) : undefined;
  const voice_donts = patch.voice_donts != null ? String(patch.voice_donts).trim().slice(0, 1000) : undefined;
  const colors = Array.isArray(patch.colors)
    ? patch.colors.filter((c) => typeof c === 'string' && HEX.test(c)).slice(0, 8)
    : undefined;

  const ts = nowISO();
  await db.prepare(
    `INSERT INTO ai_brand_kits (account_id, name, tone, colors, fonts, voice_dos, voice_donts, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(account_id) DO UPDATE SET
       name = COALESCE(?, name), tone = COALESCE(?, tone), colors = COALESCE(?, colors),
       fonts = COALESCE(?, fonts), voice_dos = COALESCE(?, voice_dos), voice_donts = COALESCE(?, voice_donts),
       updated_at = ?`
  ).bind(
    accountId, name ?? null, tone ?? null, colors ? JSON.stringify(colors) : null, fonts ?? null, voice_dos ?? null, voice_donts ?? null, ts, ts,
    name ?? null, tone ?? null, colors ? JSON.stringify(colors) : null, fonts ?? null, voice_dos ?? null, voice_donts ?? null, ts,
  ).run();
  return getBrandKit(db, accountId);
}

/** Store the R2 key for the uploaded logo (or null to clear it). */
export async function setBrandLogo(db, accountId, logoKey) {
  const ts = nowISO();
  await db.prepare(
    `INSERT INTO ai_brand_kits (account_id, logo_key, created_at, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(account_id) DO UPDATE SET logo_key = ?, updated_at = ?`
  ).bind(accountId, logoKey, ts, ts, logoKey, ts).run();
}

/** Brand guidelines as prompt text, or '' if nothing is set (keeps briefText output clean). */
export function brandKitText(kit) {
  if (!kit) return '';
  const lines = [];
  if (kit.name) lines.push(`Brand name: ${kit.name}`);
  if (kit.tone) lines.push(`Brand tone/voice: ${kit.tone}`);
  if (kit.colors && kit.colors.length) lines.push(`Brand colors: ${kit.colors.join(', ')}`);
  if (kit.fonts) lines.push(`Brand fonts/style: ${kit.fonts}`);
  if (kit.voice_dos) lines.push(`Lean into: ${kit.voice_dos}`);
  if (kit.voice_donts) lines.push(`Avoid: ${kit.voice_donts}`);
  return lines.length ? `--- BRAND GUIDELINES ---\n${lines.join('\n')}` : '';
}
