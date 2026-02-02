# BUG-047: Multiple Subscriptions Created Per User

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

---

## Summary

Users can create multiple active subscriptions by repeatedly clicking "Subscribe" after completing checkout. The Stripe portal shows 3+ identical "Pro Annual" subscriptions for the same user, each billing $199/year.

## Observed Behavior

Screenshot shows Stripe Customer Portal with:
- 3x "Pro Annual" subscriptions at $199.00/year
- All with same billing date (February 2, 2027)
- All charging to same card (Visa ****4242)

## User Impact

- **Revenue issue:** Users charged multiple times for same access
- **Refund liability:** Will need to refund duplicate subscriptions
- **User trust:** Poor experience, feels like a scam

## Root Cause

The checkout session protection in `stripe-payment-gateway.ts:161-165` only checks for `status: 'open'` checkout sessions:

```typescript
const existing = await this.deps.stripe.checkout.sessions.list({
  customer: input.stripeCustomerId,
  status: 'open',  // Only checks for incomplete checkouts
  limit: 1,
});
```

This does NOT prevent users who already have an active subscription from creating another one.

**Flow:**
1. User subscribes → subscription #1 created, checkout session completes
2. User navigates back to /pricing and clicks "Subscribe"
3. No open checkout sessions exist → creates new checkout session
4. User completes checkout → subscription #2 created
5. Repeat → subscription #3, #4, etc.

## Affected Code

- `src/adapters/gateways/stripe-payment-gateway.ts:156-216` — `createCheckoutSession`
- `app/pricing/subscribe-actions.ts` — Server action calling the gateway

## Fix Required

Before creating a checkout session, check if the user already has an active subscription:

```typescript
// Option 1: Check subscription status in our DB
const existingSubscription = await subscriptionRepo.findByUserId(userId);
if (existingSubscription?.status === 'active') {
  throw new ApplicationError('ALREADY_SUBSCRIBED', 'User already has an active subscription');
}

// Option 2: Check Stripe directly
const subscriptions = await stripe.subscriptions.list({
  customer: stripeCustomerId,
  status: 'active',
  limit: 1,
});
if (subscriptions.data.length > 0) {
  throw new ApplicationError('ALREADY_SUBSCRIBED', 'User already has an active subscription');
}
```

Also consider:
- UI should hide/disable Subscribe buttons for subscribed users
- Redirect subscribed users from /pricing to /app/billing

## Steps to Reproduce

1. Log in as a new user
2. Go to /pricing, subscribe with test card 4242424242424242
3. Complete checkout, land on dashboard
4. Navigate back to /pricing
5. Click "Subscribe" again
6. Complete checkout with same test card
7. Check Stripe dashboard — user has 2 subscriptions

## Verification

- [ ] Cannot create checkout session when user has active subscription
- [ ] Pricing page shows "Manage Subscription" instead of "Subscribe" for active users
- [ ] Unit test added for subscription-exists check
- [ ] Manual test: cannot create duplicate subscription

## Related

- BUG-026 (archived): No Protection Against Concurrent Checkout Sessions — this is the gap that wasn't fully addressed
- `src/adapters/gateways/stripe-payment-gateway.ts`
- `app/pricing/page.tsx`
