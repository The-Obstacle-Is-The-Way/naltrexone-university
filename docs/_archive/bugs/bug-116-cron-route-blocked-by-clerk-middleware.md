# BUG-116: Cron Reconcile Route Blocked by Clerk Middleware

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

`/api/cron/reconcile-stripe-subscriptions` was not listed as a public route pattern, so requests could be intercepted by Clerk middleware before cron-secret authentication logic ran inside the route handler.

## Root Cause

`lib/public-routes.ts` omitted:

```ts
'/api/cron/reconcile-stripe-subscriptions(.*)'
```

`proxy.ts` relies on `PUBLIC_ROUTE_PATTERNS` to determine which routes bypass Clerk auth checks. Missing this pattern meant unauthenticated cron requests did not reliably reach route-level token verification.

## Resolution

1. Added cron reconcile route to `PUBLIC_ROUTE_PATTERNS` in `lib/public-routes.ts`.
2. Added regression coverage in `lib/public-routes.test.ts`.

## Verification

- [x] `PUBLIC_ROUTE_PATTERNS` includes `/api/cron/reconcile-stripe-subscriptions(.*)`
- [x] Regression test asserts cron route remains public
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `lib/public-routes.ts`
- `lib/public-routes.test.ts`
- `proxy.ts`
- `app/api/cron/reconcile-stripe-subscriptions/route.ts`
