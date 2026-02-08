# DEBT-196: Cron Endpoint Lacks Rate Limiting

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

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

Add `DrizzleRateLimiter` to the cron endpoint, similar to other API routes:

```typescript
const rateLimiter = new DrizzleRateLimiter(db, {
  windowMs: 60_000,
  maxRequests: 5, // Max 5 reconciliation runs per minute
});
```

Alternatively, verify the `x-vercel-cron-signature` header if deployed on Vercel to ensure only Vercel Cron can trigger it.

## Verification

- `pnpm test --run` — existing tests pass
- Manual test: hit the endpoint multiple times, verify rate limiting kicks in

## Related

- BUG-120 (reconciliation conflict strategy — same endpoint)
