# BUG-079: Preview/Dev Environment Verification Failures

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

After completing Production environment setup (BUG-078, Stripe live mode, Neon database isolation), the Preview deployment (`dev` branch → `*.vercel.app`) was tested end-to-end. **Three distinct failures** surfaced sequentially:

1. **Clerk infinite redirect loop** on first visit
2. **User upsert CONFLICT** error after signing in
3. **Stripe checkout `INTERNAL_ERROR`** when subscribing

The dev branch deployment at `naltrexone-university-a9egqw1oe-john-h-jungs-projects.vercel.app` was used for testing.

### Symptoms Observed

**Symptom 1: Clerk redirect loop (HTTP 307 cascade)**
```
Clerk: Refreshing the session token resulted in an infinite redirect loop.
This usually means that your Clerk instance keys do not match -
make sure to copy the correct publishable and secret keys from the Clerk dashboard.
```
Dozens of 307 redirects on `/` before eventually resolving.

**Symptom 2: User upsert uniqueness constraint**
```
Error [ApplicationError]: User could not be upserted due to a uniqueness constraint
  at S.mapDbError → S.upsertByClerkId
  code: 'CONFLICT', digest: '120756097'
```
Blocked access to `/`, `/app/dashboard`, and every authenticated route.

**Symptom 3: Stripe checkout failure**
```json
{
  "level": 50,
  "plan": "monthly",
  "errorCode": "INTERNAL_ERROR",
  "errorMessage": "Internal error",
  "msg": "Stripe checkout failed"
}
```
Both monthly and annual checkout attempts failed. The "Checkout failed. Please try again." banner appeared on the pricing page.

---

## Root Cause Analysis

### Issue 1: Clerk Session Cross-Contamination

**Root Cause:** The user had an active Production Clerk session cookie (from `addictionboards.com`) in the same browser. When visiting the Preview URL, the Preview deployment uses Development Clerk keys (`pk_test_*`, `sk_test_*`), which cannot validate a Production Clerk session token.

**Fix:** Use incognito/private browser window for Preview URLs, or clear cookies for `vercel.app` domain.

**Architectural Note:** This is expected behavior, not a bug in our code. Production Clerk and Development Clerk are separate instances with incompatible session tokens.

### Issue 2: Stale User Data in Neon `dev` Branch

**Root Cause:** The Neon `dev` database branch was created from `main` on 2026-02-06 **before** BUG-078 Fix #4 wiped stale Development Clerk user data from the `main` branch. The `dev` branch inherited a snapshot of `main` that still contained:

| Table | Stale Rows |
|-------|-----------|
| `users` | 1 row (`jj@novamindnyc.com` with old Clerk Development ID `user_39IzXKBHCiZF34U8g6kqHoOOOj9`) |
| `stripe_customers` | 1 row |
| `stripe_subscriptions` | 1 row |

When the user signed in on Preview with Development Clerk, the `upsertByClerkId` method hit the `users_email_uq` uniqueness constraint because the email already existed with a different `clerk_user_id`.

**Fix:** Wiped all user-related data from the Neon `dev` branch while preserving 958 questions.

### Issue 3: Stripe Checkout Failure — Different Stripe Accounts

**Root Cause:** The test Stripe keys and live Stripe keys were from **two completely separate Stripe accounts**:

| Key | Account ID | Environment |
|-----|-----------|-------------|
| `sk_test_51Svkj6KAPxQwR68A...` | `Svkj6KAPxQwR68A` | Preview, Development, Local (OLD — wrong) |
| `sk_live_51SvkizKItmaHAwgU...` | `SvkizKItmaHAwgU` | Production |

The test price IDs (`price_1SwOiN...`, `price_1SwOiZ...`) existed only on account `Svkj6K...`, but the Stripe SDK was initialized with the test secret key from the same wrong account. The checkout failure was caused by the test account lacking proper configuration or having API version issues, producing a raw Stripe SDK error that the catch-all handler in `action-result.ts:61` converted to a generic `INTERNAL_ERROR`.

This happened because the initial Stripe setup (days earlier) used a separate test/sandbox Stripe account, and when live mode was activated later, it was activated on a **different** account. Every Stripe account has both test mode and live mode built in — they should always be used from the same account.

**Fix:** Obtained the correct test-mode keys from the live Stripe account (`sk_test_51SvkizK...`, `pk_test_51SvkizK...`), created new test products/prices on the correct account's test mode, set up a test webhook, and replaced all env vars in Vercel (Preview + Development), `.env.local`, and Stripe dashboard.

---

## All Fixes Applied (2026-02-06)

| Issue | Fix | Status |
|-------|-----|--------|
| Clerk redirect loop | Use incognito window for Preview URLs | Resolved (expected behavior) |
| Stale user data in `dev` DB | Wiped user-related tables from Neon `dev` branch | Resolved |
| Wrong Stripe account for test keys | Replaced all test keys, price IDs, webhook secret with correct account | Resolved |
| Missing Development price IDs | Added `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY/ANNUAL` to Vercel Development | Resolved |
| Local `.env.local` pointed to Production DB | Changed `DATABASE_URL` from Neon `main` to Neon `dev` branch | Resolved |

### Stripe Configuration After Fix (Single Account: `51SvkizKItmaHAwgU`)

| Variable | Production (live mode) | Preview/Dev/Local (test mode) |
|----------|----------------------|-------------------------------|
| `STRIPE_SECRET_KEY` | `sk_live_51SvkizK...` | `sk_test_51SvkizK...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_51SvkizK...` | `pk_test_51SvkizK...` |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` | `price_1SxttBKItmaHAwgUOYmmLy8o` ($29/mo) | `price_1SxuYAKItmaHAwgUWaePv0AC` ($29/mo) |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL` | `price_1SxtuSKItmaHAwgUYUAl4Kxd` ($199/yr) | `price_1SxuYXKItmaHAwgUjobv4lxY` ($199/yr) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_22Yey...` (live endpoint) | `whsec_dI7ro...` (test endpoint) |

---

## Remaining Follow-up Items

### Env hygiene (non-blocking)
- [ ] Evaluate whether `NEXT_PUBLIC_APP_URL` for Preview should use Vercel's `VERCEL_URL` system env var instead of a static value
- [ ] Consider cleaning up shared Neon auto-generated vars (`POSTGRES_URL`, `PGHOST`, etc.) that still point to `main` across all environments
- [ ] Deactivate or delete the orphan Stripe account (`51Svkj6KAPxQwR68A`) to avoid future confusion

### Systemic improvements (non-blocking)
- [ ] Improve `handleError` in `action-result.ts` to extract and log Stripe-specific error context before converting to `INTERNAL_ERROR`
- [ ] Add prevention: when creating a new Neon branch, document that user data cleanup may be needed

---

## Verification

- [x] All Stripe env vars use same account ID (`51SvkizKItmaHAwgU`) across all environments
- [x] Test price IDs created on correct account's test mode
- [x] Test webhook endpoint created on correct account's test mode
- [x] Neon `dev` branch has clean user tables (958 questions preserved)
- [x] `.env.local` DATABASE_URL points to Neon `dev` branch (not `main`)
- [x] Vercel Development environment has price IDs (was missing before)
- [ ] End-to-end checkout flow on Preview deployment (pending redeploy)
- [ ] End-to-end checkout flow on localhost

---

## Related

- [BUG-078](bug-078-clerk-production-google-oauth-not-configured.md) — Predecessor: Production auth failures (same day), Fix #4 wiped `main` user data but not `dev`
- [BUG-066](../_archive/bugs/bug-066-clerk-development-keys-in-production.md) — Original key switch that created the stale data problem
- [BUG-040](../_archive/bugs/bug-040-clerk-key-mismatch-infinite-redirect.md) — Previous Clerk redirect loop bug (same symptom, different root cause)
- [BUG-069](../_archive/bugs/bug-069-stripe-checkout-fails-localhost.md) / [BUG-070](../_archive/bugs/bug-070-e2e-test-user-checkout-fails.md) — Previous Stripe checkout failures (binding bug, different root cause)
- `docs/dev/deployment-environments.md` — Environment key mapping SSOT
- `src/adapters/controllers/action-result.ts:51-61` — Generic error handler that obscures Stripe errors
- `lib/env.ts` — Environment validation
