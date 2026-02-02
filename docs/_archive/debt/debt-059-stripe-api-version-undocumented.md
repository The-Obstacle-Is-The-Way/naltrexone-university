# DEBT-059: Stripe API Version Hardcoded Without Documentation

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The Stripe client pinned an API version, but the rationale and safe upgrade process were not documented inline.

## Resolution

Added an explanatory comment above the pinned `apiVersion` in `lib/stripe.ts`, including a reference to Stripe’s API version changelog and guidance for safely updating the pin.

## Verification

- [x] Code includes documentation adjacent to the pin.
- [x] Unit tests and typecheck pass.

## Related

- `lib/stripe.ts`
