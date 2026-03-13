# BUG-207: Cron Route Leaks Internal Configuration State to Unauthenticated Callers

**Status:** Open
**Priority:** P3 (downgraded from P1 after verification)
**Date:** 2026-03-13

## Summary

The public `POST /api/cron/reconcile-stripe-subscriptions` endpoint checks whether `CRON_SECRET` is configured before it checks the `Authorization` header. When the secret is missing, any caller receives `{ "error": "CRON_SECRET is not configured" }` with HTTP 503 instead of the normal 401 unauthorized response.

## Verification Notes

- `lib/public-routes.ts:1-10` exposes `/api/cron/reconcile-stripe-subscriptions(.*)` as a public route, so the handler itself must enforce auth.
- `app/api/cron/reconcile-stripe-subscriptions/route.ts:57-69` reads `container.env.CRON_SECRET` and returns the explicit `"CRON_SECRET is not configured"` body before the auth check at `app/api/cron/reconcile-stripe-subscriptions/route.ts:72-81`.
- `app/api/cron/reconcile-stripe-subscriptions/route.test.ts:130-145` locks in that exact response today.
- `lib/env.test.ts:165-187` confirms missing `CRON_SECRET` is still allowed at startup, even when `VERCEL_ENV='production'`, because validation is intentionally deferred to the route layer.

This is a **real but low-risk information disclosure**. The route still fails closed and does not run reconciliation work without a configured secret, so the original P1 classification overstated the impact.

## Location

- `app/api/cron/reconcile-stripe-subscriptions/route.ts:57-69`
- `app/api/cron/reconcile-stripe-subscriptions/route.ts:72-81`
- `lib/public-routes.ts:1-10`
- `app/api/cron/reconcile-stripe-subscriptions/route.test.ts:130-145`

## Repro

1. `curl -X POST https://example.com/api/cron/reconcile-stripe-subscriptions`
2. If `CRON_SECRET` is not set, receive: `{"error":"CRON_SECRET is not configured"}` (503)

## Suggested Fix

Use TDD to harden the route boundary:

1. Update `app/api/cron/reconcile-stripe-subscriptions/route.test.ts` first so:
   - requests without a usable auth header still return `401 { error: 'Unauthorized' }` when `CRON_SECRET` is missing
   - requests with a syntactically valid `Bearer` header also return `401 { error: 'Unauthorized' }` when `CRON_SECRET` is missing
   - no response body ever mentions `CRON_SECRET`
2. Reorder the handler to parse the auth header before the config branch.
3. Keep the detailed `'CRON_SECRET is not configured'` message in server logs only; use the same external unauthorized response for the missing-secret branch.

## Prevention

- Review all API routes for error messages that leak infrastructure state.
