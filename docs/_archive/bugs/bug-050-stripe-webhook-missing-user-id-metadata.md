# BUG-050: Stripe Webhook Skips Events Missing `metadata.user_id`

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-03

---

## Description

Some Stripe webhook events were treated as “safe to ignore” when the retrieved subscription was missing `metadata.user_id`.

**Expected behavior:** If we cannot map a Stripe subscription to an internal `userId` via `metadata.user_id`, treat this as a processing error so the webhook fails loudly and the `stripe_events.error` field captures the failure for investigation/retry.

**Actual behavior:** For `checkout.session.completed` and `customer.subscription.created`, the gateway logged a warning and returned no `subscriptionUpdate`, causing the webhook controller to mark the event as processed and respond `200` without syncing subscription state.

## Location

- `src/adapters/gateways/stripe-payment-gateway.ts`
  - `normalizeSubscriptionUpdate()` missing `metadata.user_id` branch

## Root Cause

An earlier mitigation (BUG-041) allowed `customer.subscription.created` events without `metadata.user_id` to be treated as ignorable to avoid noisy Stripe retries. That exception also covered `checkout.session.completed`, which can represent a paid checkout completion where silently skipping is unacceptable.

## Impact

- **Silent subscription desync:** The system can fail to upsert `stripe_subscriptions` for some Stripe events.
- **Entitlement risk:** If checkout success eager-sync does not run (user closes tab), a paying user can remain unentitled due to missing DB state.
- **Poor observability:** The `stripe_events` row is marked processed with `error = null`, hiding the failure from DB-based monitoring.

## Fix

- Remove the “skip” behavior when `metadata.user_id` is missing.
- Log an error with event/subscription/customer identifiers.
- Throw `ApplicationError('STRIPE_ERROR')` so the webhook controller marks the event as failed and the webhook responds with a non-2xx status.

## Verification

- [x] Unit test: `customer.subscription.created` without `metadata.user_id` throws `STRIPE_ERROR` and logs `logger.error`.
- [x] Unit test: `checkout.session.completed` subscription without `metadata.user_id` throws `STRIPE_ERROR` and logs `logger.error`.
- [x] Unit test: `customer.subscription.deleted` normalization covered.

## Related

- `docs/_archive/bugs/bug-041-webhook-subscription-created-missing-metadata.md`
- `docs/specs/spec-009-payment-gateway.md` — “do not silently ignore” required fields
