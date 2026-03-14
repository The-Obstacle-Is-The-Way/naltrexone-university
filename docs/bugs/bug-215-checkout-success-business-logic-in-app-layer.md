# BUG-215: Checkout Success Assertions Import `db/schema` Types Directly

**Status:** Open
**Priority:** P4 (downgraded from P2/P3 after verification)
**Date:** 2026-03-13

## Summary

The original report overstated the architecture problem. ADR-014 explicitly places eager Stripe sync on the checkout-success page boundary, and `syncCheckoutSuccess(...)` is already a dependency-injected, heavily tested framework-layer orchestration function. The only verified issue is narrower: `checkout-success-assertions.ts` imports `StripeSubscriptionStatus` directly from `@/db/schema` even though the repo already has an adapter-owned Stripe status type in `src/adapters/shared/stripe-types.ts`.

## Impact

- There is no verified runtime bug in the page-level eager sync flow itself.
- The remaining issue is compile-time coupling from checkout-success page code to database-schema types.
- This is low-risk architectural cleanup, not a P3 application-layer defect.

## Verification Notes

Tracer-bullet verification changed the root cause substantially:

1. **Page-level eager sync is intentional SSOT, not a surprise leak.** `docs/adr/adr-014-stripe-eager-sync.md:31-42` explicitly decides to implement eager sync on the checkout success page and names `app/(marketing)/checkout/success/page.tsx` / `syncCheckoutSuccess(...)` as the implementation location.
2. **The current implementation matches that ADR and stays at the outer boundary.** `app/(marketing)/checkout/success/checkout-success-sync.tsx:84-262` orchestrates Stripe fetches, validation, repository writes, and redirect decisions using injected dependencies from `app/(marketing)/checkout/success/checkout-success-deps.ts:13-42`, domain helpers, and adapter functions. That is framework-layer orchestration, not an inward dependency violation.
3. **The flow is already deeply unit-tested as an orchestration boundary.** `app/(marketing)/checkout/success/page.test.ts:544-1088` verifies validation redirects, transaction writes, entitlement redirects, and idempotent overwrite behavior for the page-level sync path.
4. **The direct `db/schema` type import is real.** `app/(marketing)/checkout/success/checkout-success-assertions.ts:1` imports `StripeSubscriptionStatus` from `@/db/schema` solely for a type predicate used by `assertStripeSubscriptionStatus(...)`.
5. **An adapter-owned type already exists and is the better dependency.** `src/adapters/shared/stripe-types.ts:60-68` already defines `StripeSubscriptionStatus`, so the page helper does not need to depend on `db/schema` for this type.
6. **This remaining issue is compile-time only.** The import in `checkout-success-assertions.ts` is type-only, so the verified problem is architectural coupling, not broken runtime behavior.

## Precise TDD Fix

1. Add a failing unit test in `app/(marketing)/checkout/success/checkout-success-assertions.test.ts` that enumerates the accepted Stripe statuses from an adapter-owned source of truth instead of relying on `db/schema` types.
2. Promote `src/adapters/shared/stripe-types.ts` to the single source of truth by exporting a shared `STRIPE_SUBSCRIPTION_STATUSES` constant alongside the `StripeSubscriptionStatus` union if needed.
3. Update `app/(marketing)/checkout/success/checkout-success-assertions.ts` to import `StripeSubscriptionStatus` from `@/src/adapters/shared/stripe-types` instead of `@/db/schema`.
4. Update any adapter helpers that still need the same status list to consume that shared adapter-owned source instead of duplicating or reaching into `db/schema`.
