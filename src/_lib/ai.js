/**
 * AI Ads engine — Anthropic (strategy + copy) and OpenAI gpt-image-1 (creatives).
 *
 * Runs entirely from the Worker via fetch (no SDK). The strategy engine mirrors the
 * referenced repo's "5 parallel agents" design by firing one Claude request per
 * dimension with Promise.all. Models: Opus 4.8 for synthesis, Sonnet 4.6 for copy.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations';

export const MODELS = {
  strategy: 'claude-opus-4-8',
  copy: 'claude-sonnet-4-6',
};

export const PLATFORMS = ['meta', 'google', 'tiktok', 'linkedin', 'youtube', 'pinterest'];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * fetch() with retry on network errors and 429/5xx, exponential backoff + jitter, and a
 * per-attempt timeout (a hung upstream would otherwise tie up the Worker invocation until
 * the platform's own subrequest limit kills it). Shared by callClaude, generateImage, and
 * the Meta Ad Library client.
 */
export async function fetchWithRetry(url, opts, { retries = 2, baseDelayMs = 400, timeoutMs = 20000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') e = new Error(`Request timed out after ${timeoutMs}ms`);
      lastErr = e;
      if (attempt === retries) throw e;
      await sleep(baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`HTTP ${res.status}`);
      if (attempt === retries) return res;
      await sleep(baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs);
      continue;
    }
    return res;
  }
  throw lastErr;
}

/**
 * Call Claude's Messages API. When `schema` is given, constrains the response to that
 * JSON Schema (structured outputs) and returns the parsed object; otherwise returns text.
 */
export async function callClaude(env, { model = MODELS.copy, system, user, schema, maxTokens = 4096 }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  };
  if (system) body.system = system;
  if (schema) body.output_config = { format: { type: 'json_schema', schema } };

  const res = await fetchWithRetry(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Claude ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('Request was declined by safety system');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!schema) return text;
  try { return JSON.parse(text); } catch (e) { throw new Error('Model did not return valid JSON'); }
}

/**
 * Generate an ad image via OpenAI gpt-image-1. Returns raw bytes + content type so the
 * caller can persist to R2. Ad creatives need legible in-image text — gpt-image-1 is best
 * at that; swap this one function to use fal.ai/Replicate if cost matters more.
 */
export async function generateImage(env, { prompt, size = '1024x1024' }) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetchWithRetry(OPENAI_IMAGE_URL, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size, n: 1 }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Image API ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no image');
  return { bytes: b64ToBytes(b64), contentType: 'image/png' };
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Funnel context ────────────────────────────────
/**
 * Build a product brief from a funnel's stored config (product name, price, offer copy,
 * quiz questions) so generated ads reflect the funnel rather than a generic URL.
 */
export function briefFromFunnel(funnel) {
  let parsed = {};
  try { parsed = JSON.parse(funnel.config || '{}'); } catch (e) {}
  const cfg = parsed.config || {};
  const screens = parsed.screens || [];
  const offer = screens.find((s) => s.type === 'offer') || {};
  const questions = screens
    .filter((s) => ['single', 'multi', 'grid', 'slider'].includes(s.type))
    .map((s) => (s.options?.length ? `${s.question} (${s.options.map((o) => o.label).filter(Boolean).join(' / ')})` : s.question))
    .filter(Boolean)
    .slice(0, 12);
  return {
    name: funnel.name || cfg.productName || funnel.slug,
    productName: cfg.productName || funnel.name || '',
    price: cfg.productPrice || null,
    currency: cfg.currency || '',
    offerHeadline: offer.title || offer.headline || '',
    offerBody: offer.body || offer.subtitle || '',
    quizThemes: questions,
    funnelType: funnel.type,
  };
}

function briefText(brief) {
  return [
    `Product: ${brief.productName || brief.name}`,
    brief.price ? `Price: ${brief.currency || ''}${brief.price}` : '',
    brief.offerHeadline ? `Offer headline: ${brief.offerHeadline}` : '',
    brief.offerBody ? `Offer detail: ${brief.offerBody}` : '',
    brief.inputUrl ? `Reference URL: ${brief.inputUrl}` : '',
    brief.notes ? `Notes: ${brief.notes}` : '',
    brief.quizThemes?.length ? `Quiz themes: ${brief.quizThemes.join('; ')}` : '',
    brief.brandText || '',
  ].filter(Boolean).join('\n');
}

// ── Structured-output schemas (kept simple per structured-output limits) ──
const obj = (props, required) => ({ type: 'object', additionalProperties: false, properties: props, required: required || Object.keys(props) });
const str = { type: 'string' };
const strArr = { type: 'array', items: { type: 'string' } };

const READINESS_SCHEMA = obj({
  score: { type: 'integer' }, grade: str, summary: str,
  strengths: strArr, gaps: strArr,
});
const PERSONAS_SCHEMA = obj({
  personas: { type: 'array', items: obj({
    name: str, demographics: str, painPoints: strArr, desires: strArr, targeting: str,
  }) },
});
const FUNNEL_SCHEMA = obj({
  tofu: obj({ goal: str, angles: strArr, formats: strArr }),
  mofu: obj({ goal: str, angles: strArr, formats: strArr }),
  bofu: obj({ goal: str, angles: strArr, formats: strArr }),
});
const BUDGET_SCHEMA = obj({
  total_note: str,
  allocations: { type: 'array', items: obj({ platform: str, percent: { type: 'integer' }, rationale: str }) },
});
const COPY_SCHEMA = obj({
  platforms: { type: 'array', items: obj({
    platform: str,
    headlines: strArr, primary_texts: strArr, ctas: strArr,
  }) },
});

const SYSTEM = 'You are a senior performance-marketing strategist. Be specific, concrete, and actionable. Output only the requested JSON.';

/**
 * Run the parallel strategy engine. Five dimensions fire concurrently (like the repo's
 * 5 agents); returns a single strategy object persisted as ad_projects.strategy.
 */
export async function generateStrategy(env, brief) {
  const ctx = briefText(brief);
  const ask = (label, instruction, schema, model = MODELS.copy) => callClaude(env, {
    model, system: SYSTEM, schema, maxTokens: 3000,
    user: `${instruction}\n\n--- BUSINESS BRIEF ---\n${ctx}`,
  }).then((r) => [label, r]).catch((e) => [label, { error: String(e.message) }]);

  const results = await Promise.all([
    ask('readiness', 'Score this business\'s advertising readiness 0-100 with a letter grade (A+ to F). Give a one-paragraph summary, key strengths, and gaps.', READINESS_SCHEMA, MODELS.strategy),
    ask('personas', 'Define 3 detailed audience personas with demographics, pain points, desires, and ad targeting parameters.', PERSONAS_SCHEMA),
    ask('funnel', 'Design a TOFU/MOFU/BOFU campaign funnel. For each stage give the goal, 3-5 creative angles, and recommended ad formats.', FUNNEL_SCHEMA),
    ask('budget', 'Recommend a budget allocation across Meta, Google, TikTok, LinkedIn, YouTube, Pinterest as percentages summing to 100, each with a short rationale.', BUDGET_SCHEMA),
    ask('copy', `Write platform-specific ad copy for ${PLATFORMS.join(', ')}. For each platform give 3 headlines, 3 primary texts, and 3 CTAs.`, COPY_SCHEMA),
  ]);
  const out = {};
  for (const [k, v] of results) out[k] = v;
  out.generated_at = new Date().toISOString();
  return out;
}

// ── Creatives (copy + image) ──────────────────────
const CREATIVE_COPY_SCHEMA = obj({
  variants: { type: 'array', items: obj({
    headline: str, primary_text: str, cta: str, image_prompt: str,
  }) },
});

/** Generate N ad-copy variants (each with an image prompt) for a platform + persona. */
export async function generateCreativeCopy(env, { brief, platform, persona, count = 3 }) {
  const ctx = briefText(brief);
  const out = await callClaude(env, {
    model: MODELS.copy, system: SYSTEM, schema: CREATIVE_COPY_SCHEMA, maxTokens: 2500,
    user: `Create ${count} distinct ${platform} ad variants${persona ? ` targeting this persona: ${persona}` : ''}. `
      + `Each variant: a scroll-stopping headline, primary text, a CTA, and an "image_prompt" — a vivid prompt for an image generator describing the ad creative (scene, style, mood, any short on-image text). `
      + `\n\n--- BUSINESS BRIEF ---\n${ctx}`,
  });
  return out.variants || [];
}

// ── Competitor-ad AI analysis ─────────────────────
const COMPETITOR_SCHEMA = obj({
  ads: { type: 'array', items: obj({
    page_name: str, ad_text: str, cta: str, angle: str,
  }) },
});

/** LLM-reasoned competitor ad concepts/angles (used alongside real Meta Ad Library results). */
export async function analyzeCompetitors(env, { brief, query }) {
  const ctx = briefText(brief);
  const out = await callClaude(env, {
    model: MODELS.copy, system: SYSTEM, schema: COMPETITOR_SCHEMA, maxTokens: 2500,
    user: `For the search "${query}", infer 5 likely competitor ad approaches in this market. `
      + `For each: a plausible advertiser/page name, representative ad text, a CTA, and the strategic angle it exploits. `
      + `\n\n--- BUSINESS BRIEF ---\n${ctx}`,
  });
  return out.ads || [];
}

// ── Quiz-copy generation (headlines/bullets/quiz-flow, for the Visual Builder) ──
// Framework structures inspired by the PAS/PASO/AIDA generator pattern in
// CopywriterProAI's sales.contents.js (few-shot labeled templates) — reimplemented
// here as sequence-level guidance rather than lifted code, since screens (not single
// ad blocks) are what gets restructured.
const QUIZ_FRAMEWORK_NOTES = {
  pas: 'Structure the flow using PAS (Problem-Agitate-Solution): the earliest screens name the reader\'s problem in their own words, the middle screens agitate it — make the cost of inaction vivid and specific — and the screens nearer the end position what\'s coming as the solution.',
  paso: 'Structure the flow using PASO (Problem-Agitate-Solution-Outcome): early screens name the problem, middle screens agitate it, later screens introduce the solution, and the final screens paint the concrete outcome/transformation the reader gets.',
  aida: 'Structure the flow using AIDA (Attention-Interest-Desire-Action): the first screens grab attention with a bold, specific hook, the next build interest with relevant detail, the middle screens build desire by making the benefit vivid and personal, and the final screens drive action with clear urgency.',
  generic: 'Use strong direct-response copywriting throughout: a compelling hook, concrete specific language over vague claims, and a confident, low-friction call to action. No named framework required.',
};

const QUIZ_SCREEN_SCHEMA = obj({
  id: str, headline: str, headlineAccent: str, sub: str, alertTitle: str, alertBody: str, cta: str,
  question: str, options: { type: 'array', items: obj({ label: str }, ['label']) },
  infoTitle: str, infoBody: str, body: str, bodyExtra: str, steps: strArr,
}, ['id']);
const QUIZ_COPY_SCHEMA = obj({ screens: { type: 'array', items: QUIZ_SCREEN_SCHEMA } });

const QUIZ_COPY_SYSTEM = 'You are a senior direct-response copywriter rewriting an existing quiz funnel\'s copy. '
  + 'Be specific and concrete, never generic filler. Output only the requested JSON.';

/**
 * Rewrite copy for a filtered, in-scope list of quiz-funnel screens in one pass, applying
 * the chosen framework's structure across the SEQUENCE of screens (not per-screen in
 * isolation). Each input screen is `{ id, type, ...only its existing copy fields }`; the
 * model must preserve `id` and the item count of any `options`/`steps` array, and must
 * only return fields that were present on that screen.
 */
export async function generateQuizCopy(env, { brief, framework, screens }) {
  const ctx = briefText(brief);
  const note = QUIZ_FRAMEWORK_NOTES[framework] || QUIZ_FRAMEWORK_NOTES.generic;
  const out = await callClaude(env, {
    model: MODELS.copy, system: QUIZ_COPY_SYSTEM, schema: QUIZ_COPY_SCHEMA, maxTokens: 4096,
    user: `${note}\n\nRewrite the copy for this quiz funnel's screens, in the same order, applying that structure `
      + `across the sequence. Preserve each screen's "id" exactly. Only include fields that were present on the `
      + `input screen with that id — never invent new fields. If a screen has an "options" or "steps" array, your `
      + `output must have exactly the same number of items, in the same order — just better copy.`
      + `\n\n--- BUSINESS BRIEF ---\n${ctx}\n\n--- SCREENS (JSON) ---\n${JSON.stringify(screens)}`,
  });
  return out.screens || [];
}

// ── Creative scoring ───────────────────────────────
const SCORE_SCHEMA = obj({
  score: { type: 'integer' }, summary: str, strengths: strArr, improvements: strArr,
});

const SCORE_SYSTEM = 'You are a blunt, expert performance-marketing creative director reviewing ad copy '
  + 'before it goes to paid media. Judge hook strength, clarity, specificity, and how well it matches the '
  + 'brief and brand guidelines. Do not be generous — most first-draft ad copy scores 40-70.';

/**
 * Score one generated creative 0-100 against the brief/brand, with a short summary and
 * concrete strengths/improvements. Independent of generation so it can be re-run on demand.
 */
export async function scoreCreative(env, { brief, creative }) {
  const ctx = briefText(brief);
  const ad = [
    `Platform: ${creative.platform || ''}`,
    creative.persona ? `Persona: ${creative.persona}` : '',
    `Headline: ${creative.headline || ''}`,
    `Primary text: ${creative.primary_text || ''}`,
    `CTA: ${creative.cta || ''}`,
  ].filter(Boolean).join('\n');
  const out = await callClaude(env, {
    model: MODELS.copy, system: SCORE_SYSTEM, schema: SCORE_SCHEMA, maxTokens: 1200,
    user: `Score this ad creative 0-100. Give a one-sentence summary, 2-3 strengths, and 2-3 concrete improvements.`
      + `\n\n--- BUSINESS BRIEF ---\n${ctx}\n\n--- AD CREATIVE ---\n${ad}`,
  });
  return { score: Math.max(0, Math.min(100, out.score | 0)), summary: out.summary || '', strengths: out.strengths || [], improvements: out.improvements || [] };
}
