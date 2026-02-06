# Deployment Environments: Source of Truth

**Last Verified:** 2026-02-06 (post database isolation + env scoping + Stripe single-account consolidation + Neon var cleanup + Clerk webhook fix + Deployment Protection fix + env var trailing newline fix)

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
- [x] **Preview** (`*.vercel.app`, non-main branches) — E2E verified 2026-02-06: sign-in → paywall → Stripe test checkout → subscription active → full app access. See [BUG-080](../bugs/bug-080-vercel-env-var-deployment-issues.md) for issues resolved during verification.
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

### Auto-Generated Neon Vars — REMOVED (2026-02-06)

15 auto-generated vars from the Vercel-Neon integration (`POSTGRES_URL`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `POSTGRES_HOST`, `POSTGRES_DATABASE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NO_SSL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, `PGHOST_UNPOOLED`, `NEON_PROJECT_ID`) were removed via `vercel env rm`. They all pointed to the `main` (Production) branch across all environments — a latent risk if any dependency ever read `POSTGRES_URL` instead of `DATABASE_URL`. Our app only reads `DATABASE_URL`, which is properly scoped per environment.

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
- [x] Test checkout flow on Preview deployment — Verified 2026-02-06 (after [BUG-080](../bugs/bug-080-vercel-env-var-deployment-issues.md) fixes)

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
| `*.vercel.app` (non-main branch) | Preview | `pk_test_*` | Neon `dev` | Verified (2026-02-06) |
| `localhost:3000` | Development | `pk_test_*` | Neon `dev` | Needs verification |

---

## Known Gotchas (Learned the Hard Way)

### Vercel Deployment Protection Blocks Webhooks

Vercel's **Standard Protection** (Project Settings → Deployment Protection → Vercel Authentication) intercepts ALL unauthenticated requests to Preview URLs with a 401 + SSO redirect. This blocks server-to-server webhooks from Clerk and Stripe, which use signature verification, not session cookies.

**Current state:** Disabled for this project. Preview deployments rely on Clerk/Stripe's own signature verification for webhook security.

See [BUG-080](../bugs/bug-080-vercel-env-var-deployment-issues.md) Issue 1.

### Trailing `\n` in Vercel Dashboard Env Vars

When pasting values into the Vercel dashboard, invisible trailing newline characters can be stored. This silently breaks HTTP headers (e.g., `Authorization: Bearer sk_test_...\n` → transport error).

**Prevention:**
- Use CLI to set secrets: `printf '%s' "value" | vercel env add NAME env --yes --force`
- Never use `echo` (appends `\n`). Always use `printf '%s'`.
- After pasting in dashboard, pull back and verify: `vercel env pull /tmp/check && cat -A /tmp/check | grep VAR_NAME`

See [BUG-080](../bugs/bug-080-vercel-env-var-deployment-issues.md) Issue 2.

### `NEXT_PUBLIC_*` Vars Require Fresh Builds

`NEXT_PUBLIC_*` variables are inlined at build time by Next.js's webpack DefinePlugin. Changing the Vercel env var alone is **not sufficient** — a fresh build is required.

**Critical:** `vercel redeploy` reuses build cache and will serve stale `NEXT_PUBLIC_*` values. Push a commit (even `git commit --allow-empty`) to trigger a fresh GitHub-linked build.

**`NEXT_PUBLIC_APP_URL` for Preview** must be set to the stable branch URL (e.g., `https://naltrexone-university-git-dev-john-h-jungs-projects.vercel.app`), not `localhost:3000`. This URL is used by the billing controller to construct Stripe `success_url` and `cancel_url`.

See [BUG-080](../bugs/bug-080-vercel-env-var-deployment-issues.md) Issue 3.

### Clerk Development Mode Re-Authentication After Stripe Checkout

In Clerk Development mode, sessions use `__clerk_db_jwt` URL parameters (not HTTP-only cookies). When Stripe redirects back to `/checkout/success`, it doesn't carry the `__clerk_db_jwt` param, so Clerk's middleware sees an unauthenticated request and redirects to sign-in.

**This is expected behavior in Development mode only.** In Production, Clerk uses HTTP-only cookies on `addictionboards.com`, so the redirect from Stripe automatically carries the auth cookie. No re-sign-in needed.

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
- [BUG-080](../bugs/bug-080-vercel-env-var-deployment-issues.md) — Vercel env var + Deployment Protection issues (resolved)
- `proxy.ts` — Clerk middleware
- `lib/env.ts` — Environment validation
- `app/api/webhooks/clerk/route.ts` — Clerk webhook handler
- `app/api/webhooks/stripe/route.ts` — Stripe webhook handler
