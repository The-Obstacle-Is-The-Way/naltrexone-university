# BUG-042: Checkout Success Redirects Without Diagnostics

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

The checkout success page could redirect to `/pricing?checkout=error` without emitting any structured diagnostics indicating which validation failed. This made troubleshooting Stripe/Clerk/environment issues from server logs impractical.

## Root Cause

`syncCheckoutSuccess()` redirected to the same error route for multiple validation failures, but did not log a reason code or any structured context before redirecting.

## Fix

1. Added a structured `fail(reason, context)` helper that logs a machine-readable `reason` plus minimal context (no PII) before redirecting.
2. Refactored the validations into small assertion helpers so each failure path is explicit and type-safe.
3. Always fetch the subscription via `stripe.subscriptions.retrieve()` to validate against a consistent object shape.

## Verification

- [x] Unit tests added for each validation reason: `app/(marketing)/checkout/success/page.test.ts`
- [ ] Manual: complete Stripe checkout; if redirect occurs, server logs now include `reason=<...>`

## Related

- BUG-039: Checkout Success searchParams not awaited (resolved)
- BUG-041: Webhook subscription.created missing metadata (resolved)
- `app/(marketing)/checkout/success/page.tsx` — `syncCheckoutSuccess`

