# BUG-041: Webhook Fails on subscription.created — Missing user_id Metadata

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The Stripe webhook handler returns HTTP 500 when processing `customer.subscription.created` events because the subscription's `metadata.user_id` field is not set yet. This is a timing/race condition issue.

**Server Log Evidence:**
```json
{"level":50,"time":1770048705930,"error":{"code":"STRIPE_ERROR"},"msg":"Stripe webhook failed"}
POST /api/stripe/webhook 500
```

**Stripe CLI Output:**
```
2026-02-02 11:11:45   --> customer.subscription.created [evt_1SwPj3KAPxQwR68Awjxnrgft]
2026-02-02 11:11:45  <--  [500] POST http://localhost:3000/api/stripe/webhook [evt_1SwPj3KAPxQwR68Awjxnrgft]
```

## Steps to Reproduce

1. Start dev server and Stripe CLI webhook forwarding
2. Go to `/pricing` and click "Subscribe Monthly"
3. Complete Stripe checkout with test card
4. Observe 500 error on `customer.subscription.created` webhook in Stripe CLI

## Root Cause

When a user completes checkout:
1. Stripe creates the subscription immediately
2. `customer.subscription.created` webhook fires
3. The subscription metadata may not have `user_id` set yet (it's added via `subscription_data.metadata` in checkout session)
4. Webhook handler at `src/adapters/gateways/stripe-payment-gateway.ts:232-237` throws:
   ```typescript
   const userId = subscription.metadata?.user_id;
   if (!userId) {
     throw new ApplicationError(
       'STRIPE_ERROR',
       'Stripe subscription metadata.user_id is required',
     );
   }
   ```

The `checkout.session.completed` webhook (which fires after) succeeds because by then the metadata is attached.

## Impact

- **User impact:** None — checkout still works, eager sync on success page handles it
- **Data impact:** None — `checkout.session.completed` webhook syncs correctly
- **Operational:** Noisy — generates 500 errors in logs, Stripe may retry the webhook

## Potential Fix Options

1. **Option A: Gracefully skip early events** — If `user_id` missing, return 200 and log warning (let `checkout.session.completed` handle it)

2. **Option B: Use checkout session event** — Remove `customer.subscription.created` from handled events, only process subscription updates via `checkout.session.completed` and `customer.subscription.updated`

3. **Option C: Re-fetch subscription** — On `subscription.created`, wait/retry to see if metadata appears

**Recommended:** Option A — simplest, maintains idempotency, reduces noise

## Verification

- [ ] Webhook returns 200 for `subscription.created` without `user_id`
- [ ] Warning logged when skipping event
- [ ] No 500 errors in Stripe CLI output during checkout flow
- [ ] Subscription still synced correctly via `checkout.session.completed`

## Related

- `src/adapters/gateways/stripe-payment-gateway.ts:232-237`
- BUG-025: Missing Subscription Event Handlers (resolved)
- BUG-034: Webhook Catch Block Loses Error Context (resolved)
