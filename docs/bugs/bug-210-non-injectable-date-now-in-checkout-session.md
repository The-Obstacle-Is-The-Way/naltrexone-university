# BUG-210: Non-Injectable `Date.now()` in `isSessionInactive` Prevents Deterministic Testing

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

The `isSessionInactive` function in `stripe-checkout-sessions.ts:53` uses a hard-wired `Date.now()` to check session expiration. The rest of the codebase consistently injects `now: () => Date` for time-dependent logic (e.g., `stripe-webhook-controller.ts`, `drizzle-user-repository.ts`). This outlier is untestable for time-sensitive edge cases without monkey-patching.

## Impact

- Sessions at the expiration boundary cannot be tested deterministically.
- A session that just expired could be incorrectly treated as active (or vice versa) depending on execution timing, and this race cannot be reproduced in tests.

## Location

- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:53` -- `session.expires_at * 1000 <= Date.now()`

## Suggested Fix

Add a `now?: () => number` parameter to `isSessionInactive` (or to the enclosing function/class), defaulting to `Date.now`. This matches the established pattern across the codebase.

## Prevention

- Grep for `Date.now()` in production code during review; all time-dependent logic should accept an injectable clock.
