# BUG-215: `checkout-success-sync.tsx` Contains 200+ Lines of Business Logic in App Layer

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

The `syncCheckoutSuccess` function in `checkout-success-sync.tsx` (lines 84-262, ~180 lines) performs Stripe session retrieval, subscription validation, metadata cross-checking, status mapping, and database upsert -- all orchestrated directly in the `app/` (presentation) layer. This is a use case that belongs in `src/application/use-cases/`.

Additionally, `checkout-success-assertions.ts` imports `StripeSubscriptionStatus` directly from `@/db/schema`, bypassing the Clean Architecture boundary.

## Impact

- Business logic is untestable without mocking Next.js server component infrastructure.
- The `@/db/schema` import in the app layer creates a direct dependency on persistence types.
- Cannot reuse this sync logic from other entry points (e.g., a webhook handler, CLI tool, or cron job).
- Violates the project's Clean Architecture contract (domain decisions made outside domain/application layers).

## Locations

- `app/(marketing)/checkout/success/checkout-success-sync.tsx:84-262` -- business logic in app layer
- `app/(marketing)/checkout/success/checkout-success-assertions.ts:1` -- imports `@/db/schema`

## Suggested Fix

Extract `syncCheckoutSuccess` to `src/application/use-cases/sync-checkout-success.ts` with injected dependencies (repositories, Stripe gateway). The app-layer page component should only call the use case through the container.

## Prevention

- If a function in `app/` exceeds ~30 lines of non-UI logic, it likely belongs in `src/application/use-cases/`.
