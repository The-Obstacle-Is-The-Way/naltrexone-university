# BUG-041: Webhook 500 on `customer.subscription.created` (Missing `metadata.user_id`)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

The Stripe webhook handler returned HTTP 500 for some `customer.subscription.created` events because `subscription.metadata.user_id` was missing. Since we cannot map such events to an internal user, failing the webhook just causes noisy retries without making progress.

## Root Cause

`StripePaymentGateway.processWebhookEvent()` treated missing `metadata.user_id` as a hard error for all subscription events.

**Location:** `src/adapters/gateways/stripe-payment-gateway.ts:233-252`

## Fix

When receiving `customer.subscription.created` events without `metadata.user_id`:

- Log a warning with the event/subscription/customer IDs
- Return early with no `subscriptionUpdate` (webhook responds 200)

All other subscription update events still require `metadata.user_id` and continue to throw when missing.

## Verification

- [x] Unit test added: `src/adapters/gateways/stripe-payment-gateway.test.ts`
- [ ] Manual: run Stripe CLI forwarding and confirm `customer.subscription.created` no longer produces 500s when missing metadata

## Related

- `src/adapters/gateways/stripe-payment-gateway.ts` — webhook normalization
- BUG-025: Missing Subscription Event Handlers (resolved)
- BUG-034: Webhook Catch Block Loses Error Context (resolved)
