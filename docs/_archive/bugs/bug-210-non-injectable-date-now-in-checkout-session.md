# BUG-210: Hard-Wired `Date.now()` in Stripe Checkout Session Inactivity Check

**Status:** Resolved
**Priority:** P4 (downgraded from P2 after verification)
**Date:** 2026-03-13
**Resolved:** 2026-03-14 (PR #213)

## Summary

`isSessionInactive()` in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:46-58` reads `Date.now()` directly. That is not producing incorrect runtime behavior today, but it makes the checkout gateway's expiration logic depend on ambient wall-clock time instead of an injectable time source.

## Verification Notes

Tracer-bullet verification confirmed:

1. **The hard-wired clock is real.** `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:46-58` uses `session.expires_at * 1000 <= Date.now()`.
2. **That helper controls multiple billing decisions.** The result is used when deciding whether to reuse an existing checkout session at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:198-212`, and when validating the primary and recovery create responses at `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:323-374`.
3. **This is not the only production `Date.now()` in the repo.** `app/(marketing)/checkout/success/checkout-success-sync.tsx:249` uses `Date.now()` for a subscription-period comparison, and `app/(app)/app/questions/[slug]/use-question-page-controller.ts:493` calls `Date.now()` for a client-side UI timestamp.
4. **This is still not a production correctness bug.** The helper is comparing Stripe's `expires_at` against real wall-clock time, which is the correct production behavior for deciding whether a session is already inactive.
5. **The real issue is deterministic testability.** Current tests have to derive expiry timestamps from the live clock with `Math.floor(Date.now() / 1000)`.

This is a **gateway-level testability / consistency defect**, not an active production bug.

## Resolution

Threaded optional `nowMs?: () => number` (defaulting to `Date.now`) into `createStripeCheckoutSession` and `isSessionInactive`. All expiry/recovery tests now use a fixed `nowMs = 1_700_000_000_000` constant instead of ambient `Date.now()`, asserting exact boundary behavior deterministically.
