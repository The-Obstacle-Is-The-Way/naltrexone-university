# Deployment Environments: Source of Truth

**Last Verified:** 2026-02-06 (post-BUG-078 resolution)

This document is the single source of truth for how Clerk, Stripe, Neon, and Vercel are configured across all environments.

---

## Current State Audit (2026-02-06)

### What's Working

- [x] **Production** (`addictionboards.com`) — sign-up, sign-in, dashboard all working
- [ ] **Preview** (`*.vercel.app`, non-main branches) — BROKEN (shared database conflict)
- [ ] **Local Development** (`localhost:3000`) — BROKEN (same shared database issue)

### What's Broken and Why

| Problem | Root Cause | Impact | Fix |
|---------|-----------|--------|-----|
| Preview/Local auth fails with `CONFLICT` error | Single database shared across all envs; Clerk Dev + Prod IDs collide on same email | Can't test auth on Preview or locally | Neon database branching |
| Stripe keys shared across all envs | One set of Stripe keys for Prod + Preview + Dev | Either can't charge real users OR test charges real cards | Separate Stripe keys per env |

---

## Architecture: Three Environments, Three Isolation Boundaries

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION                                       │
│  URL:      addictionboards.com                                          │
│  Branch:   main                                                          │
│  Clerk:    Production instance (pk_live_*, sk_live_*)                   │
│  Stripe:   Live mode (sk_live_*, pk_live_*)                [NEEDS FIX]  │
│  Database: Neon main branch                                              │
│  Webhook:  addictionboards.com/api/webhooks/clerk                       │
│  Webhook:  addictionboards.com/api/webhooks/stripe         [NEEDS CHECK]│
│                                                                          │
│  Users: Real paying customers only                                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     PREVIEW / DEVELOPMENT                                │
│  URL:      *.vercel.app (Preview) / localhost:3000 (Local)              │
│  Branch:   Any non-main branch / local                                   │
│  Clerk:    Development instance (pk_test_*, sk_test_*)                  │
│  Stripe:   Test mode (sk_test_*, pk_test_*)                             │
│  Database: Neon dev branch (SEPARATE from Production)      [NEEDS FIX]  │
│  Webhook:  Dev Clerk webhook (if configured)                             │
│                                                                          │
│  Users: Test accounts, E2E test user, your personal dev account         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Current Vercel Environment Variables (Verified 2026-02-06)

### Correctly Configured

| Variable | Production | Preview/Dev | Status |
|----------|-----------|-------------|--------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_*` (1d ago) | `pk_test_*` (6d ago) | Correct |
| `CLERK_SECRET_KEY` | `sk_live_*` (1d ago) | `sk_test_*` (6d ago) | Correct |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Production webhook (today) | Dev webhook (4d ago) | Correct |
| `NEXT_PUBLIC_APP_URL` | `https://addictionboards.com` (22h ago) | Preview URL (22h ago) | Correct |

### PROBLEMS — Shared When They Shouldn't Be

| Variable | Current Scope | Problem | Fix |
|----------|--------------|---------|-----|
| `DATABASE_URL` | All environments (shared) | Clerk Dev/Prod ID collisions | Create Neon branch for Preview/Dev |
| `STRIPE_SECRET_KEY` | All environments (shared) | Can't separate test vs live payments | Set Production-only live Stripe key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | All environments (shared) | Same | Set Production-only live Stripe key |
| `STRIPE_WEBHOOK_SECRET` | All environments (shared) | Webhook verification mismatch | Separate per environment |

---

## Fix Plan

### Fix 1: Database Isolation (Neon Branching)

**Problem:** One database for all environments → Clerk ID collisions on same email.

**Solution:** Use [Neon database branching](https://neon.tech/docs/manage/branches) to create a `dev` branch.

**Steps:**
1. Create a Neon branch called `dev` from the main branch (this copies all data including questions)
2. Get the `dev` branch connection string
3. Set `DATABASE_URL` for **Preview** and **Development** scopes in Vercel to the dev branch URL
4. Keep Production `DATABASE_URL` pointing to the main Neon branch
5. Run migrations on the dev branch: `DATABASE_URL=<dev-branch-url> pnpm db:migrate`
6. Verify: Preview deployment can sign in without conflicting with Production users

**Result:**
```
Production (addictionboards.com) → Neon main branch → Production Clerk users
Preview (*.vercel.app)           → Neon dev branch  → Development Clerk users
Local (localhost:3000)           → Neon dev branch  → Development Clerk users
```

### Fix 2: Stripe Key Separation

**Problem:** One set of Stripe keys shared across all environments.

**Current state (NEEDS VERIFICATION):**
- Are the current shared keys `sk_test_*` or `sk_live_*`?
- If `sk_test_*`: Production can't process real payments (P0 if launching)
- If `sk_live_*`: Preview/local would charge real cards (dangerous)

**Steps:**
1. Check current Stripe key type in Vercel (`sk_test_*` or `sk_live_*`)
2. Set Production-only Stripe keys:
   - `STRIPE_SECRET_KEY` = `sk_live_*` (Production scope only)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_*` (Production scope only)
   - `STRIPE_WEBHOOK_SECRET` = Live webhook secret (Production scope only)
3. Set Preview/Dev-only Stripe keys:
   - `STRIPE_SECRET_KEY` = `sk_test_*` (Preview + Development scope)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_test_*` (Preview + Development scope)
   - `STRIPE_WEBHOOK_SECRET` = Test webhook secret (Preview + Development scope)
4. Set Production-specific Stripe Price IDs (already done — set 4d ago)

### Fix 3: Stripe Webhook Endpoint (Production)

**Check:** Is `https://addictionboards.com/api/webhooks/stripe` configured in Stripe Live mode dashboard?
- If not, create it and set `STRIPE_WEBHOOK_SECRET` for Production

### Fix 4: Wipe Dev Branch Users

After creating the Neon dev branch (which copies Production data):
1. Delete the Production user from the dev branch database
2. Let Development Clerk re-create users on first sign-in

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

## Neon Database

| Property | Value |
|----------|-------|
| Database | `neondb` |
| PostgreSQL | 17.7 |
| Questions | 958 |
| Users (Production) | 1 (your account) |
| Branches | `main` only (dev branch NEEDS CREATION) |

---

## URL Reference

| URL | Environment | Clerk Keys | Auth Works? |
|-----|-------------|-----------|-------------|
| `addictionboards.com` | Production | `pk_live_*` | Yes |
| `*.vercel.app` (main branch) | Production | `pk_live_*` | **No** (domain-locked, expected) |
| `*.vercel.app` (non-main branch) | Preview | `pk_test_*` | **No** (shared DB conflict, FIXABLE) |
| `localhost:3000` | Development | `pk_test_*` | **No** (shared DB conflict, FIXABLE) |

After Fix 1 (Neon branching):

| URL | Environment | Clerk Keys | Database | Auth Works? |
|-----|-------------|-----------|----------|-------------|
| `addictionboards.com` | Production | `pk_live_*` | Neon main | Yes |
| `*.vercel.app` (main) | Production | `pk_live_*` | Neon main | No (domain-locked, expected) |
| `*.vercel.app` (non-main) | Preview | `pk_test_*` | Neon dev | **Yes** |
| `localhost:3000` | Development | `pk_test_*` | Neon dev | **Yes** |

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
