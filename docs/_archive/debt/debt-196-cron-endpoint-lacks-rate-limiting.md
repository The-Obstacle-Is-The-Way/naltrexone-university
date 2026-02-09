# DEBT-196: Cron Endpoint Lacks Rate Limiting

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-09

---

## Description

The Stripe reconciliation cron endpoint (`/api/cron/reconcile-stripe-subscriptions`) authenticates via Bearer token with timing-safe comparison but has no rate limiting. All other API endpoints (health, webhooks) use `DrizzleRateLimiter`.

An attacker who brute-forces or obtains the `CRON_SECRET` could hit the endpoint repeatedly, triggering excessive Stripe API calls and database writes.

## Affected Files

| File | Issue |
|------|-------|
| `app/api/cron/reconcile-stripe-subscriptions/route.ts` | No rate limiter |
| `lib/public-routes.ts` | Listed in `PUBLIC_ROUTE_PATTERNS` (bypasses Clerk) |

## Impact

- Without rate limiting, a compromised or leaked `CRON_SECRET` allows unlimited reconciliation runs
- Each run calls Stripe's `subscriptions.list` API, which has its own rate limits
- Excessive runs could cause database contention on the `stripe_subscriptions` table
- On Vercel, the cron endpoint is also callable by external HTTP requests, not just Vercel Cron

## Resolution

The cron route now enforces a shared, centralized rate limit before running the
reconciliation job. The implementation uses the composition root-provided rate
limiter (`container.createRateLimiter()`) plus a shared config constant
(`CRON_RECONCILE_STRIPE_SUBSCRIPTIONS_RATE_LIMIT`) to avoid scattered magic
numbers.

Behavior:
- Returns `429` with `Retry-After` and `X-RateLimit-*` headers when exceeded.
- Returns `503` (and logs) when the rate limiter fails.

Alternatively, verify the `x-vercel-cron-signature` header if deployed on Vercel to ensure only Vercel Cron can trigger it.

## Verification

- [x] `pnpm typecheck && pnpm test --run`
- [x] Added regression coverage for `429` (rate limited) and `503` (limiter failure) in `app/api/cron/reconcile-stripe-subscriptions/route.test.ts`

## Related

- BUG-120 (reconciliation conflict strategy — same endpoint)
