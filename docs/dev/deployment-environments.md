# Deployment Environments: Source of Truth

**Last Verified:** 2026-02-06 (post database isolation + env scoping + Stripe single-account consolidation)

This document is the single source of truth for how Clerk, Stripe, Neon, and Vercel are configured across all environments.

---

## Current State Audit (2026-02-06)

### What's Working

- [x] **Production** (`addictionboards.com`) — sign-up, sign-in, dashboard all working
- [x] **Database isolation** — Neon `main` (Production) and `dev` (Preview/Local) branches created
- [x] **Env var scoping** — DATABASE_URL, Stripe keys, Clerk keys all scoped per environment
- [x] **Stripe Live Mode** — Production uses `sk_live_*` / `pk_live_*` keys (account review in progress)
- [x] **Stripe Production Webhook** — `addictionboards.com/api/webhooks/stripe` configured with 5 events
- [x] **Stripe Live Price IDs** — Monthly ($29) and Annual ($199) products created in live mode
- [x] **Stripe Single Account** — Test and live modes on same Stripe account (`51SvkizKItmaHAwgU`), fixed in [BUG-079](../bugs/bug-079-preview-dev-environment-verification-failures.md)
- [x] **Stripe Test Webhook** — Test endpoint configured for Preview deployment with 5 events
- [x] **Stripe Test Price IDs** — Monthly ($29) and Annual ($199) test products created
- [ ] **Preview** (`*.vercel.app`, non-main branches) — NEEDS END-TO-END VERIFICATION (env vars fixed, pending redeploy)
- [ ] **Local Development** (`localhost:3000`) — NEEDS END-TO-END VERIFICATION

---

## Architecture: Three Environments, Three Isolation Boundaries

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION                                       │
│  URL:      addictionboards.com                                          │
│  Branch:   main                                                          │
│  Clerk:    Production instance (pk_live_*, sk_live_*)                   │
│  Stripe:   Live mode (sk_live_*, pk_live_*)                  [WORKING] │
│  Database: Neon main branch (ep-withered-cell-ah14ik13)                 │
│  Webhook:  addictionboards.com/api/webhooks/clerk            [WORKING] │
│  Webhook:  addictionboards.com/api/webhooks/stripe           [WORKING] │
│                                                                          │
│  Users: Real paying customers only                                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     PREVIEW / DEVELOPMENT                                │
│  URL:      *.vercel.app (Preview) / localhost:3000 (Local)              │
│  Branch:   Any non-main branch / local                                   │
│  Clerk:    Development instance (pk_test_*, sk_test_*)                  │
│  Stripe:   Test mode (sk_test_*, pk_test_*)              [CONFIGURED] │
│  Database: Neon dev branch (ep-still-frog-ahx7bp6y)                     │
│  Webhook:  Dev Clerk webhook (if configured)                             │
│  Webhook:  Test Stripe webhook (Preview URL)             [CONFIGURED] │
│                                                                          │
│  Users: Test accounts, E2E test user, your personal dev account         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Current Vercel Environment Variables (Verified 2026-02-06)

### Properly Scoped (each environment has its own value)

| Variable | Production | Preview | Development | Status |
|----------|-----------|---------|-------------|--------|
| `DATABASE_URL` | Neon `main` branch | Neon `dev` branch | Neon `dev` branch | Correct |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_*` | `pk_test_*` | `pk_test_*` | Correct |
| `CLERK_SECRET_KEY` | `sk_live_*` | `sk_test_*` | `sk_test_*` | Correct |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Production webhook | Preview webhook | Dev webhook | Correct |
| `NEXT_PUBLIC_APP_URL` | `https://addictionboards.com` | Preview URL | Dev URL | Correct |
| `STRIPE_SECRET_KEY` | `sk_live_51SvkizK...` | `sk_test_51SvkizK...` | `sk_test_51SvkizK...` | Correct (same account) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_51SvkizK...` | `pk_test_51SvkizK...` | `pk_test_51SvkizK...` | Correct (same account) |
| `STRIPE_WEBHOOK_SECRET` | Live webhook secret | Test webhook secret | Test webhook secret | Correct |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` | Live price ID ($29/mo) | Test price ID ($29/mo) | Test price ID ($29/mo) | Correct |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL` | Live price ID ($199/yr) | Test price ID ($199/yr) | Test price ID ($199/yr) | Correct |

### Auto-Generated Neon Vars (Vercel integration — still shared, app doesn't use these)

These were auto-created by the Vercel-Neon integration and still point to the main branch. Our app only reads `DATABASE_URL`, which is now properly scoped. These are harmless but could be cleaned up later:

`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `DATABASE_URL_UNPOOLED`, `PGHOST`, `PGHOST_UNPOOLED`, `POSTGRES_HOST`, `POSTGRES_URL_NO_SSL`, `POSTGRES_DATABASE`, `PGDATABASE`, `POSTGRES_USER`, `PGUSER`, `PGPASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_PRISMA_URL`, `NEON_PROJECT_ID`

---

## Stripe Configuration (Single Account — Configured 2026-02-06)

**IMPORTANT:** Test mode and live mode MUST use the same Stripe account. Account ID: `51SvkizKItmaHAwgU`. See [BUG-079](../bugs/bug-079-preview-dev-environment-verification-failures.md) for what happens when they don't match.

### Live Mode (Production)

- [x] Stripe account activated (business verification in progress — 2-3 business days)
- [x] Live API keys (`sk_live_*`, `pk_live_*`) set in Vercel Production
- [x] Live webhook endpoint: `https://addictionboards.com/api/webhooks/stripe`
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
- [x] Live webhook signing secret set in Vercel Production
- [x] Live Price IDs created and set in Vercel Production:
  - Monthly: `price_1SxttBKItmaHAwgUOYmmLy8o` ($29/mo)
  - Annual: `price_1SxtuSKItmaHAwgUYUAl4Kxd` ($199/yr)
- [ ] Test a real checkout flow on `addictionboards.com` (after Stripe review completes)

### Test Mode (Preview / Development / Local)

- [x] Test API keys (`sk_test_51SvkizK...`, `pk_test_51SvkizK...`) set in Vercel Preview + Development + `.env.local`
- [x] Test webhook endpoint: Preview deployment URL + `/api/webhooks/stripe`
  - Same 5 events as live
- [x] Test webhook signing secret set in Vercel Preview + Development + `.env.local`
- [x] Test Price IDs created and set everywhere:
  - Monthly: `price_1SxuYAKItmaHAwgUWaePv0AC` ($29/mo)
  - Annual: `price_1SxuYXKItmaHAwgUjobv4lxY` ($199/yr)
- [ ] Test checkout flow on Preview deployment (pending redeploy)

---

## Neon Database

| Property | Value |
|----------|-------|
| Project ID | `summer-math-94727887` |
| Database | `neondb` |
| PostgreSQL | 17.7 |
| Questions | 958 (on both branches) |

### Branches

| Branch | Endpoint | Purpose | Created |
|--------|----------|---------|---------|
| `main` (default) | `ep-withered-cell-ah14ik13-pooler` | Production | 2026-01-31 |
| `dev` | `ep-still-frog-ahx7bp6y-pooler` | Preview + Local Dev | 2026-02-06 |

### Managing Branches via CLI

```bash
# List branches
neonctl branches list --project-id summer-math-94727887

# Create a new branch
neonctl branches create --project-id summer-math-94727887 --name <name> --parent main

# Get connection string (pooled)
neonctl connection-string <branch-name> --project-id summer-math-94727887 --pooled

# Run migrations against a specific branch
DATABASE_URL="<branch-connection-string>" pnpm db:migrate
```

---

## Clerk Production Configuration (Verified 2026-02-06)

All of these are confirmed working:

| Setting | Location | Value | Status |
|---------|----------|-------|--------|
| Domain | Developers → Domains | `addictionboards.com` | Verified |
| DNS (Frontend API) | Developers → Domains | `clerk.addictionboards.com` → `frontend-api.clerk.services` | Verified |
| DNS (Account Portal) | Developers → Domains | `accounts.addictionboards.com` → `accounts.clerk.services` | Verified |
| DNS (Email DKIM) | Developers → Domains | 3 CNAME records | Verified |
| SSL | Developers → Domains | Issued for both Frontend API + Account Portal | Verified |
| Google OAuth | SSO Connections → Google | Client ID + Secret configured | Verified |
| Google OAuth App | Google Cloud Console | Published (not Testing) | Verified |
| Component Paths (SignIn) | Developers → Paths | Application domain: `addictionboards.com/sign-in` | Verified |
| Component Paths (SignUp) | Developers → Paths | Application domain: `addictionboards.com/sign-up` | Verified |
| Component Paths (SignOut) | Developers → Paths | Application domain: `addictionboards.com/sign-in` | Verified |
| Webhook | Developers → Webhooks | `https://addictionboards.com/api/webhooks/clerk` | Verified |
| Webhook Events | Developers → Webhooks | `user.created`, `user.updated`, `user.deleted` | Verified |

---

## Clerk Development Configuration

| Setting | Status |
|---------|--------|
| Google OAuth | Configured (was working before BUG-066) |
| Webhook | Needs verification — may need endpoint for Preview URLs |
| Users | Your personal dev account exists here |

**Note:** Clerk Development webhooks are tricky with Preview deployments because the URL changes with each deploy. Options:
1. Use [Clerk's Svix CLI](https://docs.svix.com/receiving/using-app-portal/replay) for local testing
2. Rely on `ClerkAuthGateway.getCurrentUser()` upsert (works without webhook)
3. Set a stable Preview URL (Vercel allows custom aliases)

---

## URL Reference

| URL | Environment | Clerk Keys | Database | Auth Works? |
|-----|-------------|-----------|----------|-------------|
| `addictionboards.com` | Production | `pk_live_*` | Neon `main` | Yes |
| `*.vercel.app` (main branch) | Production | `pk_live_*` | Neon `main` | No (domain-locked, expected) |
| `*.vercel.app` (non-main branch) | Preview | `pk_test_*` | Neon `dev` | Needs verification |
| `localhost:3000` | Development | `pk_test_*` | Neon `dev` | Needs verification |

---

## Prevention Checklist

When setting up a new service or changing environment configuration:

1. [ ] Is the variable scoped correctly? (Production-only vs shared vs Preview-only)
2. [ ] Does Production use live/production keys?
3. [ ] Does Preview/Dev use test/development keys?
4. [ ] Are databases isolated? (Production data never touched by test code)
5. [ ] Are webhooks configured for the correct environment?
6. [ ] Has end-to-end auth been tested on the target environment?
7. [ ] Has payment flow been tested on the target environment?

---

## Related

- [BUG-066](../_archive/bugs/bug-066-clerk-development-keys-in-production.md) — Original Production key switch
- [BUG-078](../bugs/bug-078-clerk-production-google-oauth-not-configured.md) — Production auth broken (resolved)
- `proxy.ts` — Clerk middleware
- `lib/env.ts` — Environment validation
- `app/api/webhooks/clerk/route.ts` — Clerk webhook handler
- `app/api/webhooks/stripe/route.ts` — Stripe webhook handler
