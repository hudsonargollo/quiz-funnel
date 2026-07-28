# Changelog

Notable changes to the Tektone Funnels platform. Format is loosely chronological, most recent first.

## 2026-07-28 — Product Mining module: Milestone 3 complete (5/5)

Built the standalone "product mining" module from scratch — search, filter/categorize, favorites, and 1-click funnel creation. **Milestone 3 — Mineração de Produtos: 1/5 → 5/5 (complete).**

- **v1 ships on Meta Ad Library only.** The user also asked for TikTok, ClickBank, and general dropshipping-trend data — checked each: TikTok has no public ad API for commercial ads (only an EU political/issue-ads transparency library, same legal scope as Meta's); ClickBank's marketplace has no public API (only scrapeable, a ToS gray area not worth building without explicit sign-off); generic "trending product" tools (EcomHunt, Minea, PiPiADS, etc.) are paid SaaS with no third-party API. Researched real alternatives for a later decision: **Foreplay's public API** (~100M Meta+TikTok ad creatives, genuine documented API), **CJ Affiliate's Product Search API** (real catalog/search, self-serve), and **TikTok's Commercial Content API** (official but EU-only today) are the legitimate options worth pursuing next, once credentials are sorted — not built yet.
- **Design simplification**: search stays live/stateless against the Meta Ad Library (`GET /api/mining/search`, thin wrapper over the existing `searchAdLibrary()`) — nothing is persisted until the user explicitly saves an item. That saved collection (`mined_products` table, migration `0008_product_mining.sql`) *is* both the favorites system and the visual swipe file/moodboard — the roadmap listed those as two separate tasks, but they're naturally the same UI.
- **1-click "turn into funnel"** (`POST /api/mining/products/:id/convert`) generates a slug from the saved item's page name (retrying with a short suffix on collision), creates the funnel via the existing `createFunnel()`, and prefills `config.productName` via the existing `updateFunnel()` config-patch path — no new funnel-creation plumbing, just composing what already existed.
- Free platform feature, not gated behind the paid AI Ads credit wallet — a raw Ad Library search has no LLM cost, matching the original roadmap's framing of product mining as core value, not an upsell.

## 2026-07-28 — Quiz-copy generator: Milestone 2 complete (6/6)

Closed the final two Milestone 2 tasks — no more "Alisson's framework" (never documented, and the user explicitly ruled it out). Instead, researched three external repos the user pointed at for inspiration: `CopywriterPro-ai/copywriterproai-backend` turned out to be the only one with real substance — its `sales.contents.js` implements PAS/PASO/AIDA as named, few-shot-templated generator functions. Re-implemented that *pattern* (not the code — different stack) as sequence-level guidance across a quiz funnel's screens rather than a single ad block. **Milestone 2 — Automação com IA: 4/6 → 6/6 (complete).**

- **`generateQuizCopy()`** (`src/_lib/ai.js`): one Claude call rewrites copy for a funnel's screens in place, selectable framework (`pas`/`paso`/`aida`/`generic`), applied across the screen *sequence* (early = Attention/Problem, middle = Interest/Agitate, bridge/video = Desire/Solution, final CTA screens = Action). New `POST /api/ai/funnels/:funnelId/quiz-copy` (`src/api/ai.js`), gated behind the same AI Ads credit wallet (`COSTS.quiz_copy = 10`) rather than a second billing system.
- **Scope boundary, stated explicitly rather than silently skipped**: only screen types whose copy actually lives in the funnel's JSON config are supported (`landing`, `single`/`multi`/`grid`, `slider`, `text`, `bridge`, `video`, `loading`, `profile`). The `offer` and `imc` screens' sales copy (hero, guarantee, benefit bullets) is hardcoded in `public/js/app.js`, not read from JSON at all — generating into them would require extending both the builder schema and the live checkout-page renderer first, which is materially riskier than this task, so they're excluded rather than force-fitted.
- The server never trusts the model's output directly: every returned field is checked against a per-screen-type allow-list, `options[]`/`steps[]` are merged back onto the *original* arrays (preserving `value`/`icon`, only ever changing `label`, and rejecting any length mismatch) before being sent to the client.
- **Nothing is auto-saved.** The Visual Builder gets a "Generate copy (AI)" button; results are written into the builder's in-memory screen state and pushed to the live preview immediately, but persist only through the existing Save button — same safety property as reviewing before publishing any other builder edit.
- Fixed a latent bug found while building this: `briefFromFunnel()` was reading `s.key`/`s.title` off quiz screens, neither of which exist (screens use `s.question`) — so every ad-copy/strategy prompt's `quizThemes` context has been silently empty since that function was written. Now reads `question` + option labels correctly, which should also quietly improve AI Ads copy quality going forward.

## 2026-07-28 — AI Ads add-on: 10x creative batches, Creative Library, ZIP export

Closed out the remaining Milestone 2 gap by extending the shipped AI Ads add-on rather than building the abandoned original quiz-copy scope (see the 2026-07-09 entry below). **Milestone 2 — Automação com IA: 1/6 → 4/6.**

- **Batch generation**: the creative-generation cap was raised from 4 to 10 variants per call (`src/api/ai.js`); the dashboard's Generate control now has a count selector (3/5/10) with the credit cost shown live, plus an explicit confirm step before firing a 10x (50-credit) batch.
- **Creative Library** (`GET /api/ai/funnels/:funnelId/creatives`): a new funnel-scoped view aggregating creatives across every ad project linked to that funnel (`ad_creatives` joined through `ad_projects.funnel_id`). Free-standing projects with no funnel show under a synthetic "No funnel" option — deliberate, not a gap: a project can exist without ever being attached to a funnel.
- **Inline edit**: headline/primary text/CTA are now editable directly on a creative card. The `PATCH /api/ai/creatives/:id` endpoint already supported this from the original build — only the UI was missing.
- **Export** (`GET /api/ai/creatives/export?ids=…`): bundles selected creatives into a ZIP (images + a `copy.csv`) for handoff to video editors/designers, using the new `fflate` dependency. Capped at 24 creatives per export by deliberate choice (in-memory ZIP construction against the Workers isolate memory limit, given ~1-2MB per generated image) — not a silent truncation, the UI rejects further selection past the cap with an explanation.

No DB migration was needed — everything rides on existing columns and the existing edit endpoint.

## 2026-07-09 — Milestones tracker reconciled with shipped work

The internal roadmap tracker (`/milestones`, D1 tables `milestones`/`milestone_tasks`) was seeded on 2026-07-02 with 25 tasks across 4 milestones, all unchecked except 3. A full review of git history and live code against the tracker found substantial shipped work that was never reflected back into it. Reconciled via direct D1 update (no schema/code change) — **3/25 → 10/25 tasks done (12% → 40%)**.

**Milestone 1 — Core Funcional (MVP): 3/7 → 7/7 (complete)**
Flipped: funnel-creation assistant (template picker for Quiz/Optin/VSL), visual page/quiz editor (drag-drop builder), CTA buttons wired to per-funnel Stripe checkout, basic event tracking (full `quiz_started → purchase_completed` state machine). Known gap kept in mind: the CRUD task stays checked even though funnel *duplication* specifically was never built — CRUD itself is complete, duplication just isn't a feature yet.

**Milestone 2 — Automação com IA: 0/6 → 1/6**
Only "LLM API integration" (Claude + OpenAI both live) flipped. Everything else in M2 was written against a different, narrower scope — AI-generated quiz copy using "Alisson's copywriting framework" — that was never built. What shipped instead is a separate, larger **AI Ads add-on**: campaign strategy generation, competitor ad discovery via Meta Ad Library, ad copy + image generation, brand kit, and creative scoring (`src/_lib/ai.js`, `src/_lib/meta_ads.js`, `src/_lib/brandkit.js`, `src/api/ai.js`). It's arguably more valuable than the original M2 scope, but it's a pivot, not a completion of the original tasks — left the rest of M2 unchecked rather than force-fitting or rewriting task text.

**Milestone 3 — Mineração de Produtos: 0/5 → 1/5**
Only Meta Ad Library integration (`searchAdLibrary`, real Graph API call with pagination/retry) flipped. No product-mining module exists — no product search/filter/categorization, no favorites, no product→funnel one-click flow. That's a from-scratch gap, not a partial build.

**Milestone 4 — Tráfego e Métricas Avançadas: 0/7 → 1/7**
Only the unified metrics dashboard (KPIs, conversion funnel, UTM breakdown, daily-leads/drop-off charts in `/admin`) flipped. Facebook OAuth, real ad-account performance pulling via the Marketing API, and campaign-to-funnel mapping remain unbuilt — current Meta access is a static token for public Ad Library search only, not a connected ad account.

Partial/near-miss items were left unchecked on principle (strict binary, no generous rounding) even where directionally close — e.g. competitor ads are collected but inside an ad-campaign project rather than a standalone swipe-file moodboard; multi-tenant account-scoping is consistent throughout the codebase but was never a discrete "review" task to check off.

---

## Earlier (undated in this log)

- Multi-tenant Cloudflare Workers + D1 rewrite (accounts, users, sessions, funnels — all account-scoped)
- Visual funnel builder in `/admin` with live device preview, drag-drop screens, properties panel
- CRM: full funnel-state tracking, abandoned-checkout cron worker, admin lead dashboard
- AI Ads add-on: strategy generation, competitor discovery, ad copy/image generation, credit/billing ledger, brand kit, creative scoring (Phases 0–3)
- Mobile UI polish pass across home, milestones, and admin builder pages; broken/missing images replaced with Lucide icons and initials-based avatars
