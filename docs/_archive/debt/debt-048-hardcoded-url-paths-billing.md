# DEBT-048: Hard-Coded URL Paths in Billing Controller

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The billing controller previously hard-coded route paths (checkout success/cancel/return URLs), creating drift risk when routes change.

## Impact

- Route renames require manual updates in multiple files
- No compile-time checking — broken URLs only discovered at runtime
- Inconsistent pattern — some controllers use constants, this one doesn't
- Silent failures if URLs diverge from actual routes

## Resolution

Centralized route constants and updated the billing controller to use them:

- `lib/routes.ts` exports `ROUTES`.
- `src/adapters/controllers/billing-controller.ts` builds success/cancel/return URLs using `ROUTES.CHECKOUT_SUCCESS`, `ROUTES.PRICING`, and `ROUTES.APP_BILLING`.

## Verification

- [x] Unit tests continue to pass.
- [x] Billing controller no longer contains hard-coded route literals.

## Related

- `lib/routes.ts`
- `src/adapters/controllers/billing-controller.ts`
- Similar pattern needed for other hard-coded routes in codebase
