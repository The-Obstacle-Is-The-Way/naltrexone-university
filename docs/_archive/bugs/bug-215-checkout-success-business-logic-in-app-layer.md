# BUG-215: Checkout Success Assertions Import `db/schema` Types Directly

**Status:** Resolved
**Priority:** P4 (downgraded from P2/P3 after verification)
**Date:** 2026-03-13
**Resolved:** 2026-03-14 (PR #215)

## Summary

The only verified issue is narrower than originally reported: `checkout-success-assertions.ts` imports `StripeSubscriptionStatus` directly from `@/db/schema` even though the repo already has an adapter-owned Stripe status type in `src/adapters/shared/stripe-types.ts`. The page-level eager sync itself is intentional per ADR-014.

## Resolution

Consolidated `StripeSubscriptionStatus` into `src/adapters/shared/stripe-types.ts` as the single source of truth. Updated `checkout-success-assertions.ts` to import from the adapter-owned module instead of `@/db/schema`. Added `STRIPE_SUBSCRIPTION_STATUSES` constant and updated test assertions to verify against the adapter-owned source.
