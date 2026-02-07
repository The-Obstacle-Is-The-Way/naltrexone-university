# BUG-099: Checkout Success Race with Concurrent Webhook CONFLICT

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

When a user completes Stripe checkout, two flows run concurrently:
1. **Checkout success page** calls `syncCheckoutSuccess()` which inserts the Stripe customer and upserts the subscription
2. **Stripe webhook** (`checkout.session.completed`) does the same via the webhook handler

If the webhook processes first and inserts the Stripe customer record, the checkout success page's `stripeCustomers.insert()` throws `CONFLICT`. The transaction fails, and the user sees an error page — even though their subscription is active.

**Observed:** User completes payment but lands on an error page instead of being redirected to the dashboard.

**Expected:** If the webhook already created the customer/subscription, the checkout success page should detect this and redirect to the dashboard.

## Steps to Reproduce

1. User clicks "Subscribe" → redirected to Stripe checkout
2. User completes payment → Stripe fires `checkout.session.completed` webhook
3. Webhook handler processes first, inserts Stripe customer + subscription
4. User lands on `/checkout/success` → `syncCheckoutSuccess()` attempts to insert the same Stripe customer
5. `stripeCustomers.insert()` throws `CONFLICT`
6. Transaction fails → user sees error page

**Window:** ~1-3 seconds between payment and page load. Common with fast webhook delivery.

## Root Cause

`app/(marketing)/checkout/success/page.tsx`: The `syncCheckoutSuccess()` function uses a transaction that calls `stripeCustomers.insert()` without handling the `CONFLICT` case. When the webhook beats the checkout success page, the insert fails because the customer already exists.

## Fix

Applied Option A:

- changed checkout success transaction to call:
  `stripeCustomers.insert(user.id, stripeCustomerId, { conflictStrategy: 'authoritative' })`
- this keeps webhook-first and success-page-first flows idempotent while preserving user-id guardrails

## Verification

- [x] Regression test: webhook-first customer mapping still redirects to dashboard
- [x] Mapping updated to checkout customer in idempotent reconciliation path
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- BUG-075: Pricing CTA mismatch for recoverable subscription states (related checkout flow)
- BUG-077: Payment processing users see wrong error message (related redirect logic)
- `app/(marketing)/checkout/success/page.tsx`
- `app/(marketing)/checkout/success/page.test.ts`
