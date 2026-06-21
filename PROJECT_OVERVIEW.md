# Quiz Funnel + CRM System — Project Overview

## Executive Summary

**Quiz Funnel** is a high-converting sales funnel built on **Cloudflare Pages** that combines an interactive 23-question quiz with integrated Stripe checkout and CRM lead tracking. The system is designed to guide users through a personalized journey, capture qualified leads, process payments, and provide admin tools for monitoring funnel performance across all stages.

**Primary Product:** Truque da Gelatina (€9.90 one-time payment)  
**Tech Stack:** Cloudflare Pages · Pages Functions · Cloudflare KV · Stripe API

---

## What This Project Does

### 1. **Interactive Quiz Funnel**
- Multi-screen SPA with 23+ quiz screens and decision branches
- Dynamic content based on user answers (body type, fitness level, routines, etc.)
- Bridge pages with social proof and conversion-focused copy
- Mobile-responsive design with full CSS design system

### 2. **Lead Capture & CRM**
- Client-side CRM module that syncs user data to Cloudflare KV
- Six-stage funnel tracking:
  - `quiz_started` → `lead_captured` → `offer_viewed` → `checkout_initiated` → `purchase_completed` / `payment_failed`
- Admin API for querying leads by state, email, or funnel stage
- 48-hour abandoned checkout tracking for recovery campaigns

### 3. **Stripe Payment Integration**
- Seamless checkout session creation
- Webhook handling for payment confirmation and failure states
- Secure secret management (no credentials in code)

### 4. **Analytics & Admin Dashboard**
- Real-time lead status across funnel stages
- Filter by conversion state or email lookup
- Foundation for follow-up messaging (email/SMS integration ready)

---

## Architecture Overview

```
User Journey:
Landing → Quiz (23 screens) → Bridges (social proof) → Offer → Checkout → Success/Fail

Data Flow:
Quiz answers (client-side) → Sync to KV via /api/crm/upsert
                         → Stripe checkout session
                         → Webhook confirms payment → Update KV + state

Admin View:
/api/crm/leads?token=ADMIN_TOKEN → Query all funnel stages
```

### Key Components

| Component | Role |
|-----------|------|
| `public/js/quiz-data.js` | All 23 quiz screens, questions, bridges, copy |
| `public/js/app.js` | SPA engine, screen renderer, state machine |
| `public/js/crm.js` | Client-side CRM module + KV sync logic |
| `functions/api/create-checkout-session.js` | Stripe checkout initiation |
| `functions/api/webhook.js` | Stripe payment confirmation webhooks |
| `functions/api/crm/upsert.js` | Frontend → KV sync endpoint |
| `functions/api/crm/leads.js` | Admin API for lead queries |
| `public/css/main.css` | Full design system + quiz UI |

---

## Funnel Stages & User Flow

### 1. **Quiz Started**
- User lands on homepage, sees before/after hero image
- Clicks "Start Quiz"
- State: `quiz_started` recorded in KV

### 2. **Lead Captured**
- User fills email and progresses through quiz
- Email submitted → state: `lead_captured`
- Quiz answers collected client-side

### 3. **Bridges & Social Proof**
- After key questions, interstitial "bridge" pages appear
- Features protocol diagrams, before/after testimonials (Fernanda, Rosana)
- Builds credibility before offer

### 4. **Offer Page**
- User sees customized offer based on quiz answers
- Product: "Truque da Gelatina" (€9.90)
- State: `offer_viewed`

### 5. **Checkout Initiated**
- User clicks "Comprar agora" → Stripe session created
- Payment method entry
- State: `checkout_initiated`
- Indexed as `abandoned:<email>` with 48-hour TTL (for recovery)

### 6. **Purchase Completed / Failed**
- Stripe webhook confirms payment or failure
- State updated to `purchase_completed` or `payment_failed`
- Success page or retry option shown

---

## Configuration & Deployment

### Prerequisites
- Node.js 18+
- Wrangler CLI
- Cloudflare account (free tier sufficient for test, paid for production)
- Stripe account

### Setup Steps
1. **Create KV namespaces:**
   ```bash
   wrangler kv:namespace create "QUIZ_CRM"
   wrangler kv:namespace create "QUIZ_CRM" --preview
   ```

2. **Set Stripe secrets:**
   ```bash
   wrangler secret put STRIPE_SECRET_KEY
   wrangler secret put STRIPE_PRICE_ID
   wrangler secret put STRIPE_WEBHOOK_SECRET
   wrangler secret put ADMIN_TOKEN
   ```

3. **Local dev:**
   ```bash
   npm run dev  # http://localhost:8788
   ```

4. **Deploy to production:**
   ```bash
   npm run deploy
   ```

5. **Add custom domain** in Cloudflare Pages dashboard

---

## CRM Admin API

### List All Leads
```
GET /api/crm/leads?token=YOUR_ADMIN_TOKEN
```

### Filter by Funnel State
```
GET /api/crm/leads?token=...&state=checkout_initiated
GET /api/crm/leads?token=...&state=lead_captured
GET /api/crm/leads?token=...&state=purchase_completed
```

### Look Up Single Lead
```
GET /api/crm/leads?token=...&email=user@example.com
```

### Funnel States Reference
| State | Meaning |
|-------|---------|
| `quiz_started` | Opened the funnel |
| `lead_captured` | Submitted email |
| `offer_viewed` | Reached the sales page |
| `checkout_initiated` | Clicked buy / opened Stripe |
| `purchase_completed` | Payment confirmed |
| `payment_failed` | Card declined |

---

## Customization Points

### Quiz Content
- Edit `public/js/quiz-data.js` to modify questions, bridges, social proof copy
- Add/remove screens, change image references
- Adjust slider ranges (height, weight) for Q11

### Design & Branding
- CSS variables in `public/css/main.css` for colors, fonts, spacing
- Full responsive design already in place
- Mobile-first approach

### Images
- Place images in `public/images/`
- Reference in `quiz-data.js`
- Graceful degradation if missing

### Stripe Product
- Change product name, price, or currency in Stripe dashboard
- Update `STRIPE_PRICE_ID` secret when product changes

---

## Abandoned Checkout Recovery (Future Feature)

Leads who reach `checkout_initiated` are tracked with 48-hour TTL in KV under `abandoned:<email>`.

**Integration options:**
- Cloudflare Cron Trigger + in-house email service
- Third-party service: Resend, Postmark, Twilio
- Query `/api/crm/leads?state=checkout_initiated` to find recovery candidates

**Recommended messaging tone:** Direct, aggressive, urgent—reference specific quiz answers to personalize copy.

---

## Development & Maintenance

### Local Testing
```bash
npm run dev
# Includes KV emulation and Pages Functions

# For Stripe webhook testing:
stripe listen --forward-to localhost:8788/api/webhook
```

### Monitoring
- Check `/api/crm/leads` for funnel health
- Monitor Stripe dashboard for payment failures
- Review KV storage usage in Cloudflare dashboard

### Common Tasks
- **Update quiz copy:** Edit `quiz-data.js`
- **Add new question:** Add screen to `SCREENS` array
- **Change Stripe product:** Update secret + reference in data
- **Debug lead state:** Query `/api/crm/leads?email=user@example.com`

---

## Security Considerations

1. **Secrets Management**
   - All Stripe keys stored as wrangler secrets (never in code)
   - `ADMIN_TOKEN` must be strong and rotated periodically

2. **KV Data**
   - User email + quiz answers stored in plaintext in KV
   - Consider encryption for production

3. **Webhook Validation**
   - All Stripe webhooks validated with signing secret
   - Prevents replay attacks

4. **CORS & API Access**
   - Admin API protected by token query param (use in admin tools only, not frontend)
   - Consider IP allowlisting for production

---

## Performance & Scalability

- **Cloudflare Pages:** Global edge deployment, auto-scales
- **KV:** Regional strong consistency for this use case (lead reads/writes aren't high-frequency)
- **Typical funnel:** Handles 1000s of concurrent quiz-takers without issue
- **Stripe:** Webhook processing is near-instant

---

## Next Steps / Roadmap

- [ ] Implement email follow-up automation for abandoned checkouts
- [ ] Add SMS follow-up option (Twilio integration)
- [ ] Build analytics dashboard (conversion rates by stage)
- [ ] A/B test quiz bridges and offer copy
- [ ] Implement data export (CSV of all leads)
- [ ] Add user segmentation for targeted follow-ups
- [ ] Mobile app companion (optional)

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `wrangler.toml` | Cloudflare Pages + KV config |
| `package.json` | Scripts, dependencies |
| `public/index.html` | SPA entry point |
| `public/js/quiz-data.js` | All quiz content + copy |
| `public/js/app.js` | Screen rendering engine |
| `public/js/crm.js` | KV sync + local state |
| `functions/api/webhook.js` | Stripe payment hooks |
| `public/css/main.css` | Design system |

---

## Support & Troubleshooting

**Quiz not showing?**
- Check browser console for JS errors
- Verify `quiz-data.js` syntax

**Stripe checkout failing?**
- Verify `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are set
- Check webhook secret is correct
- Test with Stripe test mode first

**Leads not syncing to KV?**
- Verify KV namespace IDs in `wrangler.toml`
- Check browser network tab for 200 response from `/api/crm/upsert`

**Admin API returning no leads?**
- Verify `ADMIN_TOKEN` is set and used correctly
- Check funnel state filter parameter spelling

---

**Version:** 1.0.0  
**Last Updated:** 2026-06-19  
**Status:** Production Ready
