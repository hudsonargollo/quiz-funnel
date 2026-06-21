# Quiz Funnel + CRM System
**Stack:** Cloudflare Pages · Pages Functions · Cloudflare KV · Stripe**

---

## Project Structure

```
quiz-funnel/
├── public/                     # Static assets (Cloudflare Pages root)
│   ├── index.html              # SPA entry point
│   ├── privacidade/index.html  # Privacy policy
│   ├── css/
│   │   └── main.css            # Full design system + quiz UI
│   ├── js/
│   │   ├── quiz-data.js        # All 23 screens, questions, bridges
│   │   ├── crm.js              # Client-side CRM module + KV sync
│   │   └── app.js              # SPA engine, screen renderer, state machine
│   └── images/                 # ← DROP YOUR IMAGES HERE (see below)
│
├── functions/                  # Cloudflare Pages Functions (edge workers)
│   └── api/
│       ├── create-checkout-session.js   # Stripe checkout
│       ├── webhook.js                   # Stripe webhooks
│       └── crm/
│           ├── upsert.js        # Frontend → KV sync
│           └── leads.js         # Admin CRM API
│
├── wrangler.toml               # Cloudflare config
└── package.json
```

---

## 1. Initial Setup

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- Cloudflare account
- Stripe account

### Install
```bash
cd quiz-funnel
npm install
wrangler login
```

---

## 2. Cloudflare KV Setup

```bash
# Create production namespace
wrangler kv:namespace create "QUIZ_CRM"
# → Copy the "id" value

# Create preview namespace (for local dev)
wrangler kv:namespace create "QUIZ_CRM" --preview
# → Copy the "preview_id" value
```

Edit `wrangler.toml` and replace the placeholder IDs:
```toml
[[kv_namespaces]]
binding = "QUIZ_CRM"
id = "PASTE_YOUR_KV_ID_HERE"
preview_id = "PASTE_YOUR_PREVIEW_ID_HERE"
```

---

## 3. Stripe Setup

### Create a product + price
1. Stripe Dashboard → Products → Add product
2. Name: `Truque da Gelatina`
3. Price: `€9.90` one-time
4. Copy the **Price ID** (`price_XXXX`)

### Set secrets (never put these in wrangler.toml)
```bash
wrangler secret put STRIPE_SECRET_KEY
# Paste your Stripe secret key (sk_live_... or sk_test_...)

wrangler secret put STRIPE_PRICE_ID
# Paste your price ID (price_XXXX)

wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste the webhook signing secret (whsec_...) — see step below

wrangler secret put ADMIN_TOKEN
# Create a secure random token for the CRM admin API
```

### Register the Stripe webhook
1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://YOUR-PAGES-DOMAIN.pages.dev/api/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
4. Copy the **Signing Secret** (`whsec_...`) → `wrangler secret put STRIPE_WEBHOOK_SECRET`

---

## 4. Image Assets

Place images in `public/images/`. The quiz references these paths:

| File | Used in |
|------|---------|
| `before-after-hero.jpg` | Landing page hero |
| `opt-perder.jpg` | Q1 option 1 |
| `opt-parar.jpg` | Q1 option 2 |
| `opt-firme.jpg` | Q1 option 3 |
| `body-1.jpg` → `body-4.jpg` | Q2 options |
| `zona-barriga.jpg` → `zona-corpo.jpg` | Q3 (zones) |
| `rotina-1.jpg` → `rotina-3.jpg` | Q12 (daily routine) |
| `protocolo-diagram.jpg` | Bridge 1 |
| `before-after-fernanda.jpg` | Bridge 2 (social proof) |
| `before-after-rosana.jpg` | Bridge 3 (social proof) |
| `result-definido.jpg` | Q15 grid option 1 |
| `result-leve.jpg` | Q15 grid option 2 |
| `before-offer.jpg` | Offer page hero |
| `after-offer.jpg` | Offer page hero |
| `avatar-default.png` | Profile screen avatar |

All images gracefully degrade — placeholders show if images are missing.

---

## 5. Local Development

```bash
npm run dev
# → http://localhost:8788
```

Test the full flow including KV and functions. Stripe webhooks require
[Stripe CLI](https://stripe.com/docs/stripe-cli) for local testing:

```bash
stripe listen --forward-to localhost:8788/api/webhook
```

---

## 6. Deploy

```bash
npm run deploy
# First deploy creates the Pages project automatically
```

Configure your custom domain in Cloudflare Pages → Settings → Custom domains.

---

## 7. CRM Admin API

### List all leads
```
GET /api/crm/leads?token=YOUR_ADMIN_TOKEN
```

### Filter by funnel state
```
GET /api/crm/leads?token=...&state=checkout_initiated
GET /api/crm/leads?token=...&state=lead_captured
GET /api/crm/leads?token=...&state=purchase_completed
```

### Look up single user
```
GET /api/crm/leads?token=...&email=user@example.com
```

### Funnel states (in order)
| State | Meaning |
|-------|---------|
| `quiz_started` | Opened the funnel |
| `lead_captured` | Submitted email |
| `offer_viewed` | Reached the sales page |
| `checkout_initiated` | Clicked buy / opened Stripe |
| `purchase_completed` | Payment confirmed via webhook |
| `payment_failed` | Card declined |

---

## 8. Follow-up / Abandoned Checkout Recovery

Leads who reach `checkout_initiated` are indexed under `abandoned:<email>` in KV
with a 48-hour TTL.

To integrate follow-up messaging (email/SMS), connect a **Cloudflare Cron Trigger**
or use a third-party service (Resend, Postmark, Twilio) to poll:

```
GET /api/crm/leads?token=...&state=checkout_initiated
```

The messaging tone should be **direct and aggressive** per the PRD — cut through
hesitation, reference their specific quiz answers (available in `quizData`),
and create clear urgency around the €9.90 price.

Sample follow-up sequence timing:
- **30 min** after abandonment: "Ainda está a tempo — o seu protocolo continua reservado"
- **3 hours**: "O que é que a travou?"
- **24 hours**: Final offer with scarcity angle

---

## 9. Customizing Quiz Content

All questions, bridges, and copy live in `public/js/quiz-data.js`.
Edit the `window.SCREENS` array to:
- Add/remove questions
- Change option labels or values
- Update bridge copy and social proof
- Adjust slider ranges (height/weight)

No build step required — changes deploy instantly via `npm run deploy`.

---

## 10. Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `STRIPE_SECRET_KEY` | Secret | Stripe API key |
| `STRIPE_PRICE_ID` | Secret | Stripe Price ID for the product |
| `STRIPE_WEBHOOK_SECRET` | Secret | Stripe webhook signing secret |
| `ADMIN_TOKEN` | Secret | Token for CRM admin API |
| `QUIZ_CRM` | KV binding | Cloudflare KV namespace |
| `ENVIRONMENT` | Var | `production` or `development` |
