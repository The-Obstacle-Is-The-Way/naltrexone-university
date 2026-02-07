# BUG-101: Stripe Checkout Can Create Duplicate Subscriptions if DB State Drifts

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-07

---

## Description

Checkout duplicate prevention relied on local `stripe_subscriptions` state only. If local state drifted (for example, legacy duplicates already existed in Stripe, or local subscription state was stale), checkout could still create another paid subscription for the same Stripe customer.

**Observed:** `createCheckoutSession` can return a new checkout URL even when Stripe already has an active subscription for that customer.

**Expected:** Checkout must fail closed with `ALREADY_SUBSCRIBED` when Stripe reports an active/trialing/past_due/unpaid/incomplete/paused subscription for the customer.

## Steps to Reproduce

1. Set up a Stripe customer with an active subscription in Stripe.
2. Ensure local `stripe_subscriptions` state is missing or stale for the same user.
3. Call `createCheckoutSession`.
4. Observe a new checkout session URL is returned (pre-fix), enabling duplicate subscription purchase.

## Root Cause

`createStripeCheckoutSession` only checked open checkout sessions (`checkout.sessions.list status=open`) and did not inspect existing Stripe subscriptions before creating a new checkout session.

That meant stale local DB state could bypass the local `ALREADY_SUBSCRIBED` guard in `CreateCheckoutSessionUseCase`.

## Fix

1. Added a Stripe-side guard in `createStripeCheckoutSession`:
   - Calls `subscriptions.list({ customer, status: 'all', limit: 10 })`
   - Blocks checkout when any blocking status is found (`active`, `trialing`, `past_due`, `unpaid`, `incomplete`, `paused`)
   - Throws `ApplicationError('ALREADY_SUBSCRIBED', ...)`
2. Extended Stripe client adapter types to include typed `subscriptions.list` support.
3. Added regression tests:
   - Fails checkout when Stripe already has an active subscription.
   - Allows checkout when existing Stripe subscriptions are only ended/canceled (`canceled`, `incomplete_expired`).

## Verification

- [x] Unit test added for active-subscription rejection
- [x] Unit test added for ended/canceled-subscription allowlist behavior
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`
- `src/adapters/shared/stripe-types.ts`
- `src/adapters/gateways/stripe-payment-gateway.test.ts`
- `docs/_archive/bugs/bug-047-multiple-subscriptions-per-user.md`
