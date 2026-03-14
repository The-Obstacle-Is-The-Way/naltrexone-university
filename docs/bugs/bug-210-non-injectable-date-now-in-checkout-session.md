# BUG-210: Hard-Wired `Date.now()` in Stripe Checkout Session Inactivity Check

**Status:** Open
**Priority:** P4 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

`isSessionInactive()` in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:46-58` reads `Date.now()` directly. That is not producing incorrect runtime behavior today, but it makes the checkout gateway's expiration logic depend on ambient wall-clock time instead of an injectable time source.

## Verification Notes

Tracer-bullet verification confirmed:

1. **The hard-wired clock is real.** `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:46-58` uses `session.expires_at * 1000 <= Date.now()`.
2. **That helper controls multiple billing decisions.** The result is used when deciding whether to reuse an existing checkout session at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:198-212`, and when validating the primary and recovery create responses at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:323-374`.
3. **This is not the only production `Date.now()` in the repo.** `app/(marketing)/checkout/success/checkout-success-sync.tsx:249` uses `Date.now()` for a subscription-period comparison, and `app/(app)/app/questions/[slug]/use-question-page-controller.ts:493` calls `Date.now()` for a client-side UI timestamp. (Line 473 in the same file passes `Date.now` as a function reference — `nowMs: Date.now` — which is the injectable pattern, not a hard-wired call.) The old claim that `isSessionInactive` is the sole production outlier was false.
4. **This is still not a production correctness bug.** The helper is comparing Stripe's `expires_at` against real wall-clock time, which is the correct production behavior for deciding whether a session is already inactive.
5. **The real issue is deterministic testability.** Current tests have to derive expiry timestamps from the live clock with `Math.floor(Date.now() / 1000)` at `src/adapters/gateways/stripe/stripe-checkout-sessions.test.ts:176-191`, `221-246`, `252-281`, `286-318`, and `423-446`. That works, but it couples the tests to ambient time instead of an injected clock.

This is a **gateway-level testability / consistency defect**, not an active production bug.

## Impact

- Expiration-boundary tests in a payment adapter are less deterministic than they should be.
- The gateway cannot be driven from a fixed clock the way many other server-side paths in this repo can.
- Future boundary bugs around stale-session recovery would be harder to isolate precisely in unit tests.

## Precise TDD Fix

1. Add failing unit tests that inject a fixed "now" and assert the exact boundary behavior for expired vs. still-open checkout sessions without calling global `Date.now()` in the test setup.
2. Thread an optional `nowMs?: () => number` (or `now: () => Date`) into `createStripeCheckoutSession(...)`, defaulting to `Date.now`.
3. Change `isSessionInactive(...)` to accept the injected clock and use that instead of reading the global clock directly.
4. Update the existing expiry/recovery tests to use the injected clock rather than computing relative timestamps from ambient wall time.
