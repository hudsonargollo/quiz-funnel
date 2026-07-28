# Changelog

Notable changes to the Tektone Funnels platform. Format is loosely chronological, most recent first.

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
