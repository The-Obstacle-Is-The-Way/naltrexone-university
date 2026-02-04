# BUG-051: Checkout Success Redirects with Non-Entitled Status

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-03

---

## Summary

`/checkout/success` synced the Stripe subscription into the database, but always redirected to `/app/dashboard` even when Stripe returned a **valid-but-non-entitled** subscription status (e.g. `incomplete`).

This caused an immediate follow-up redirect back to `/pricing` from the `/app/*` entitlement gate, which is confusing right after payment.

## Root Cause

`app/(marketing)/checkout/success/page.tsx` validated `subscription.status` only as “valid `SubscriptionStatus`”, not as “entitled”, and unconditionally redirected to the dashboard.

## Fix

- After syncing customer + subscription, `/checkout/success` now redirects based on entitlement:
  - `incomplete` / `incomplete_expired` → `/pricing?reason=payment_processing`
  - other non-entitled statuses → `/pricing?reason=manage_billing`
  - entitled statuses with a future period end → `/app/dashboard`
- The pricing page now supports these reasons and renders a “Manage Billing” CTA that opens Stripe Customer Portal.

## Verification

- [x] Unit test added: `app/(marketing)/checkout/success/page.test.ts`
- [x] `pnpm test --run`

