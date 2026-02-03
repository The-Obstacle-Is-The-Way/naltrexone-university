# BUG-052: Non-Entitled Subscriptions Could Start New Checkout Sessions

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-03

---

## Summary

Users with an existing subscription that was **not entitled** (e.g. `past_due`) could still start a new Stripe Checkout session. This risks creating multiple Stripe subscriptions for the same user.

## Root Cause

`src/adapters/controllers/billing-controller.ts` blocked checkout session creation only when `isEntitled(subscription, now)` was true. Per SSOT, statuses like `past_due` are **not entitled**, but they can still represent a “current” subscription period that should be recovered via billing management instead of starting a new subscription.

## Fix

- `createCheckoutSession` now returns `ALREADY_SUBSCRIBED` whenever a subscription exists with `currentPeriodEnd > now`, regardless of entitlement status.
- `runSubscribeAction` redirects `ALREADY_SUBSCRIBED` to `/pricing?reason=manage_billing` (not `/app/billing`, which is entitlement-gated).
- Pricing UI renders a “Manage Billing” CTA (Stripe portal) for the `manage_billing`/`payment_processing` reasons.

## Verification

- [x] Unit test added: `src/adapters/controllers/billing-controller.test.ts`
- [x] Unit tests updated: `app/pricing/page.test.tsx`
- [x] `pnpm test --run`

