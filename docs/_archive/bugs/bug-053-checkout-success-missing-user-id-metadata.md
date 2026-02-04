# BUG-053: Checkout Success Accepts Missing `metadata.user_id`

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-03
**Resolved:** 2026-02-03

---

## Summary

The checkout success page could accept Stripe subscriptions with missing/empty `metadata.user_id` and still upsert the subscription row for the currently authenticated user.

This violated the paywall SSOT requirement that **internal user identity mapping comes from Stripe metadata** and weakened defense-in-depth against cross-account attribution.

## Root Cause

`syncCheckoutSuccess()` only rejected mismatched `metadata.user_id` when the value was truthy:

- Missing `metadata.user_id` (or `''`) bypassed the mismatch check
- The code proceeded to upsert the subscription for the authenticated user

## Fix

1. Require `subscription.metadata.user_id` to be a **non-empty string**
2. Require it to **match** the authenticated `user.id`
3. Add a regression test for the new validation reason `missing_user_id`

## Verification

- [x] Unit test added: `app/(marketing)/checkout/success/page.test.ts`
- [ ] Manual: complete checkout and confirm subscription is persisted and entitlement works

## Related

- SSOT: `docs/specs/spec-011-paywall.md` (“User identity mapping”)
- `app/(marketing)/checkout/success/page.tsx` — `syncCheckoutSuccess()`

