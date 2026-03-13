# BUG-215: Checkout Success Orchestration in App Layer + `@/db/schema` Import Leak

**Status:** Open
**Priority:** P3 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

The `syncCheckoutSuccess` function in `checkout-success-sync.tsx` (~180 lines) performs Stripe session retrieval, subscription validation, metadata cross-checking, status mapping, and database upsert in the `app/` layer. Additionally, `checkout-success-assertions.ts` imports `StripeSubscriptionStatus` from `@/db/schema`.

## Verification Notes

Tracer-bullet verification refined the severity:

- **The "200+ lines of business logic" was overstated.** The file is 293 lines total, but `syncCheckoutSuccess` is ~178 lines including whitespace, logging, assertions, and comments. The actual *domain-level decisions* are minimal -- the function is primarily **orchestration/glue code**: it retrieves a Stripe session, validates the response shape using assertion helpers, maps Stripe types to domain types via existing adapter functions (`stripeSubscriptionStatusToSubscriptionStatus`, `getSubscriptionPlanFromPriceId`), and calls repository methods.
- **The `@/db/schema` import IS a real layer violation.** `StripeSubscriptionStatus` is derived from a `pgEnum` in the DB schema, making it structurally coupled to Postgres. While used purely as a TypeScript union type, the `app/` layer file reaches into `db/schema` for a type that should come from the domain or adapter layer.
- **No corresponding use case exists** in `src/application/use-cases/` for this checkout sync flow. The project has `create-checkout-session.ts` but no `sync-checkout-success`.

Downgraded from P2 to P3: the orchestration is glue code (not domain logic), but the missing use case abstraction and the `@/db/schema` import are real architectural concerns.

## Locations

- `app/(marketing)/checkout/success/checkout-success-sync.tsx:84-262` -- orchestration in app layer
- `app/(marketing)/checkout/success/checkout-success-assertions.ts:1` -- imports `@/db/schema` type

## Suggested Fix

1. Extract `syncCheckoutSuccess` to `src/application/use-cases/sync-checkout-success.ts` with injected dependencies.
2. Re-export `StripeSubscriptionStatus` from `src/adapters/` instead of importing directly from `db/schema`.
