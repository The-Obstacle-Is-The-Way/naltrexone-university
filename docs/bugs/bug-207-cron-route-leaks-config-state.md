# BUG-207: Cron Route Leaks Internal Configuration State to Unauthenticated Callers

**Status:** Open
**Priority:** P1
**Date:** 2026-03-13

## Summary

The `POST /api/cron/reconcile-stripe-subscriptions` endpoint checks whether `CRON_SECRET` is configured *before* validating the caller's authorization token. When the secret is missing, it returns `{ error: 'CRON_SECRET is not configured' }` with HTTP 503. An unauthenticated attacker can probe this endpoint to discover whether the cron infrastructure secret is configured.

## Impact

- Information disclosure: reveals internal infrastructure configuration state.
- Aids attacker reconnaissance -- knowing the cron secret is missing tells them the reconciliation job is unprotected or misconfigured.

## Location

- `app/api/cron/reconcile-stripe-subscriptions/route.ts:61-70`

## Repro

1. `curl -X POST https://example.com/api/cron/reconcile-stripe-subscriptions`
2. If `CRON_SECRET` is not set, receive: `{"error":"CRON_SECRET is not configured"}` (503)

## Suggested Fix

Option A: Return a generic `{"error":"Service unavailable"}` message instead of naming the missing config.

Option B (preferred): Move the auth token check before the config check, so unauthenticated callers always receive 401. If both fail, the caller sees "Unauthorized" rather than the config hint.

## Prevention

- Review all API routes for error messages that leak infrastructure state.
