# DEBT-058: cancelAtPeriodEnd Stored But Never Displayed in UI

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The app persisted `cancelAtPeriodEnd` for Stripe subscriptions, but users had no UI feedback indicating that cancellation was scheduled and when access would end.

## Resolution

`app/(app)/app/billing/page.tsx` now renders a “Cancellation scheduled” banner when `subscription.cancelAtPeriodEnd` is true, including the end-of-period date (formatted in UTC).

## Verification

- [x] Render test exists for the cancellation banner state.
- [x] Unit tests and typecheck pass.

## Related

- `app/(app)/app/billing/page.tsx`
