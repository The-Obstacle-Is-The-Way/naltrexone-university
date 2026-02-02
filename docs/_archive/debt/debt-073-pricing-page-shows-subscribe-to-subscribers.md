# DEBT-073: Pricing Page Shows Subscribe Buttons to Already-Subscribed Users

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The pricing page (`/pricing`) shows "Subscribe" buttons to users who already have an active subscription. This is a UX issue and contributes to BUG-047 (multiple subscriptions).

## Current Behavior

- User with active subscription visits /pricing
- Page shows "Monthly $29" and "Annual $199" subscribe buttons
- Clicking creates a new checkout session → duplicate subscription

## Expected Behavior

For subscribed users, the pricing page should either:
1. Redirect to /app/billing (billing management)
2. Show "You're subscribed!" with link to billing portal
3. Show "Upgrade/Downgrade" options if plan switching is supported

## Impact

- **UX confusion:** Users unsure if they're subscribed
- **Enables BUG-047:** Makes it easy to create duplicate subscriptions
- **Support burden:** Users confused by multiple charges

## Resolution

1. **Check subscription status** in pricing page server component
2. **Conditionally render** different UI for subscribed vs unsubscribed users
3. **Add redirect** — subscribed users going to /pricing could redirect to /app/billing

```typescript
// app/(marketing)/pricing/page.tsx
export default async function PricingPage() {
  const subscription = await getSubscription();

  if (subscription?.status === 'active') {
    return <SubscribedPricingView subscription={subscription} />;
    // Or: redirect('/app/billing');
  }

  return <UnsubscribedPricingView />;
}
```

## Verification

- [ ] Subscribed users see different pricing page
- [ ] Cannot accidentally create duplicate subscription from UI
- [ ] BUG-047 backend protection also in place (defense in depth)

## Related

- BUG-047: Multiple Subscriptions Created Per User
- `app/pricing/page.tsx`
- `app/(app)/app/billing/page.tsx`
