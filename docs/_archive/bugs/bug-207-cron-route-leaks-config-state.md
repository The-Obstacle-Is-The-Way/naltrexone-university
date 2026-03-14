# BUG-207: Cron Route Leaks Internal Configuration State to Unauthenticated Callers

**Status:** Resolved
**Priority:** P3 (downgraded from P1 after verification)
**Date:** 2026-03-13
**Resolved:** 2026-03-14 (PR #213)

## Summary

The public `POST /api/cron/reconcile-stripe-subscriptions` endpoint checks whether `CRON_SECRET` is configured before it checks the `Authorization` header. When the secret is missing, any caller receives `{ "error": "CRON_SECRET is not configured" }` with HTTP 503 instead of the normal 401 unauthorized response.

## Verification Notes

- `lib/public-routes.ts:1-10` exposes `/api/cron/reconcile-stripe-subscriptions(.*)` as a public route, so the handler itself must enforce auth.
- `app/api/cron/reconcile-stripe-subscriptions/route.ts:57-69` reads `container.env.CRON_SECRET` and returns the explicit `"CRON_SECRET is not configured"` body before the auth check at `app/api/cron/reconcile-stripe-subscriptions/route.ts:72-81`.
- `app/api/cron/reconcile-stripe-subscriptions/route.test.ts:130-145` locks in that exact response today.
- `lib/env.test.ts:165-187` confirms missing `CRON_SECRET` is still allowed at startup, even when `VERCEL_ENV='production'`, because validation is intentionally deferred to the route layer.

This is a **real but low-risk information disclosure**. The route still fails closed and does not run reconciliation work without a configured secret, so the original P1 classification overstated the impact.

## Resolution

Auth check reordered before config check. External response changed from 503 `"CRON_SECRET is not configured"` to 401 `"Unauthorized"`. Detailed config message retained in server-side `logger.error` only. Tests cover both missing-header and valid-Bearer paths when CRON_SECRET is undefined.
