# BUG-075: Pricing CTA Mismatch for Recoverable Subscription States

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

This issue was originally framed as a checkout-guard bug. Validation against code and SSOT shows the guard is intentional; the actual defect is a pricing UX mismatch.

Current behavior for users with a non-entitled status but a still-current subscription window (`currentPeriodEnd > now`) is:

1. `/pricing` renders subscribe cards because the page only knows `isEntitled: boolean`
2. Submitting subscribe hits `CreateCheckoutSessionUseCase`
3. Use case throws `ALREADY_SUBSCRIBED` for any current subscription period
4. UI redirects to `/pricing?reason=manage_billing`

So users are not in a true dead-end, but they get a misleading initial CTA and an avoidable failed round-trip.

## What Was Verified

### Entitlement Gate (`/app/*`)

`isEntitled` requires both:
- status in `{active, inTrial}`
- `currentPeriodEnd > now`

### Checkout Guard (`create-checkout-session`)

Checkout blocks whenever there is any subscription with `currentPeriodEnd > now`, regardless of status.

This behavior was intentionally introduced in [BUG-052](../_archive/bugs/bug-052-non-entitled-subscriptions-could-start-new-checkout.md) to prevent duplicate/concurrent Stripe subscriptions.

## Root Cause

`CheckEntitlementUseCase` returns only `{ isEntitled }`, so pricing cannot distinguish:
- no subscription exists
- recoverable non-entitled state (e.g., `pastDue`, `paymentProcessing`)
- other non-entitled states

Without status/context, pricing defaults to subscribe CTAs even when the next valid action is billing recovery.

## Correct Fix Direction

Do **not** relax the checkout guard back to entitlement-only checks.

Instead:
- extend entitlement/pricing input data with subscription context (status and whether current period is still active)
- render "Manage Billing" guidance immediately for recoverable current subscriptions
- keep checkout guard strict to avoid duplicate Stripe subscriptions

## Verification

- [ ] Unit test: pricing data distinguishes `no_subscription` vs `recoverable_non_entitled`
- [ ] Unit test: pricing view hides subscribe forms for recoverable current subscriptions
- [ ] Unit test: checkout guard still blocks `currentPeriodEnd > now` subscriptions
- [ ] Existing BUG-052 protections remain intact

## Related

- `src/application/use-cases/create-checkout-session.ts`
- `src/application/use-cases/check-entitlement.ts`
- `app/pricing/page.tsx`
- `app/pricing/subscribe-action.ts`
- [BUG-052](../_archive/bugs/bug-052-non-entitled-subscriptions-could-start-new-checkout.md)
