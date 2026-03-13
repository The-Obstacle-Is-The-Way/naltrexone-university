# BUG-210: Non-Injectable `Date.now()` in `isSessionInactive` — Convention Deviation

**Status:** Open
**Priority:** P3 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

The `isSessionInactive` function in `stripe-checkout-sessions.ts:53` uses hard-wired `Date.now()`. The rest of the codebase (15+ locations) consistently injects `now: () => Date` for time-dependent logic.

## Verification Notes

Tracer-bullet verification confirmed:

- **This IS the sole `Date.now()` outlier in production code** (all other hits are in test files or fakes).
- **This is NOT a production bug.** `isSessionInactive` compares `expires_at` against real wall-clock time. In production, using `Date.now()` produces correct behavior -- a session expired relative to the real clock IS inactive.
- **The real issue is testability.** The tests work around this by computing `nowUnix = Math.floor(Date.now() / 1000)` and setting relative offsets (`nowUnix - 60` for expired, `nowUnix + 3600` for active). This works but creates minor time-coupling.

Downgraded from P2 to P3: consistency/testability issue, not a correctness defect.

## Location

- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:53` -- `session.expires_at * 1000 <= Date.now()`

## Suggested Fix

Add a `now?: () => number` parameter to `isSessionInactive` (or to the enclosing function/class), defaulting to `Date.now`. This matches the established pattern across the codebase.
