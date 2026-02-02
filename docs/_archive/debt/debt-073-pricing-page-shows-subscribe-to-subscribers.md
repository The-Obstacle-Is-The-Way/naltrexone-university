# DEBT-073: Pricing Page Shows Subscribe Buttons to Already-Subscribed Users

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The pricing page (`/pricing`) should not offer "Subscribe" actions to already-entitled users. This is both a UX issue and a defense-in-depth measure for BUG-047.

## Current Behavior

- **Subscribed users** see a dedicated “You’re already subscribed” panel with links to Dashboard and Billing.
- **Unsubscribed users** see the Subscribe buttons.

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

1. **Conditionally render** based on entitlement (`app/pricing/pricing-view.tsx`).
2. **Defense in depth:** if a stale UI submits anyway, server action redirects already-subscribed users to `/app/billing` (`app/pricing/subscribe-action.ts`).
3. **Backend guard:** refuse to create a checkout session when a current subscription exists (BUG-047 fix in `src/adapters/controllers/billing-controller.ts`).

## Verification

- [x] Subscribed users see different pricing page
- [x] Subscribe actions are not presented to entitled users
- [x] Backend protection exists (BUG-047)

## Related

- BUG-047: Multiple Subscriptions Created Per User
- `app/pricing/page.tsx`
- `app/(app)/app/billing/page.tsx`
