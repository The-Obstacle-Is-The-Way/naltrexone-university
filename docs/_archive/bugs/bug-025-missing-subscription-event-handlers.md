# BUG-025: Missing Subscription Event Handlers (paused/resumed)

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Stripe can emit subscription lifecycle events beyond `customer.subscription.created|updated|deleted` (e.g. pause/resume and pending update events). The payment gateway ignored those event types entirely, so if Stripe delivered them without an accompanying `customer.subscription.updated` event, our database could drift from Stripe.

## Root Cause

`StripePaymentGateway.processWebhookEvent()` only treated three event types as “subscription events”. All other types returned early, producing no `subscriptionUpdate` for the webhook controller to persist.

## Fix

Expanded the allowlist of “subscription events” to include:

- `customer.subscription.paused`
- `customer.subscription.resumed`
- `customer.subscription.pending_update_applied`
- `customer.subscription.pending_update_expired`

These events are normalized using the same subscription object parsing as `customer.subscription.updated`, updating stored status (including `paused`) and plan metadata.

## Verification

- [x] Unit test added for `customer.subscription.paused` normalization (`src/adapters/gateways/stripe-payment-gateway.test.ts`)
- [x] `pnpm test --run`

## Notes

Invoice events like `invoice.payment_failed` are not currently normalized in the payment gateway. We rely on subscription webhooks to drive persisted subscription state, but `customer.subscription.updated` is not a dedicated signal for invoice failures (and Stripe does not guarantee webhook event ordering). If we need explicit invoice failure handling (or observe drift where subscription status transitions only surface via invoice events), add a targeted handler for `invoice.payment_failed` (or `invoice.updated`) that retrieves the subscription and performs a sync.

## Related

- `src/adapters/gateways/stripe-payment-gateway.ts`
- `src/domain/value-objects/subscription-status.ts` (`paused` is non-entitled)
