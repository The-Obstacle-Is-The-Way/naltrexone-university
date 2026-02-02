# DEBT-069: Document Stripe Eager Sync Pattern

## Category: Documentation / Architecture

## Summary
The codebase implements Theo Browne's recommended "eager sync" pattern for Stripe subscription data, but this pattern is not documented anywhere. New developers may not understand why `syncCheckoutSuccess()` exists alongside webhook handlers.

## Current State
The checkout success page (`app/(marketing)/checkout/success/page.tsx:92-151`) implements eager sync:

```typescript
export async function syncCheckoutSuccess(input, deps?, redirectFn) {
  // 1. Fetch session from Stripe API
  const session = await d.stripe.checkout.sessions.retrieve(input.sessionId, {
    expand: ['subscription'],
  });

  // 2. Extract subscription data
  const subscription = typeof session.subscription === 'object'
    ? session.subscription
    : await d.stripe.subscriptions.retrieve(subscriptionId);

  // 3. Upsert to database BEFORE webhook arrives
  await d.transaction(async ({ stripeCustomers, subscriptions }) => {
    await stripeCustomers.insert(user.id, stripeCustomerId);
    await subscriptions.upsert({ ... });
  });

  // 4. Then redirect to dashboard
  redirectFn('/app/dashboard');
}
```

This prevents the race condition where:
1. User completes checkout
2. User is redirected to success page
3. User sees "no subscription" because webhook hasn't arrived yet

## What's Missing

### 1. No ADR Documenting This Decision
Why do we have both eager sync AND webhooks? This should be explained in an ADR.

### 2. No Code Comments Explaining the Pattern
The function works but doesn't explain WHY it exists:
```typescript
// Current: No explanation
export async function syncCheckoutSuccess(...)

// Should be:
/**
 * Eagerly syncs subscription data from Stripe API after checkout.
 *
 * This prevents a race condition where the user arrives at the dashboard
 * before the Stripe webhook updates the database. Per Theo Browne's
 * stripe-recommendations (https://github.com/t3dotgg/stripe-recommendations):
 * "While calling syncStripeData eagerly isn't 'necessary', there's a good
 * chance your user will make it back to your site before the webhooks do."
 *
 * Webhooks are still needed for:
 * - Payment failures (user not on site)
 * - Subscription renewals
 * - Admin actions in Stripe dashboard
 */
export async function syncCheckoutSuccess(...)
```

### 3. No Reference to Industry Best Practices
- Theo Browne's stripe-recommendations: https://github.com/t3dotgg/stripe-recommendations
- Pedro Alonso's webhook series: https://www.pedroalonso.net/blog/stripe-webhooks-deep-dive/

## Impact
- **Onboarding friction:** New developers may think eager sync is redundant
- **Maintenance risk:** Someone might remove it thinking webhooks are sufficient
- **Architecture clarity:** Pattern not visible in architecture documentation

## Effort: Low

## Resolution
1. Create `docs/adr/adr-013-stripe-eager-sync.md` explaining the pattern
2. Add JSDoc comment to `syncCheckoutSuccess()` function
3. Reference in SPEC-009 (Stripe Integration) or SPEC-011 (Paywall)

## ADR Content Suggestion

```markdown
# ADR-013: Stripe Eager Sync Pattern

## Status
Implemented

## Context
When a user completes Stripe checkout, they are redirected back to our app.
Stripe also sends webhooks to update subscription state. These are two
independent events with a race condition: the user often arrives before
the webhook.

## Decision
Implement "eager sync" by fetching subscription data directly from Stripe
API on the checkout success page, then upserting to the database before
redirecting to dashboard.

## Consequences
- User immediately sees correct subscription state
- Webhooks still needed for payment failures, renewals, admin actions
- Slightly more Stripe API calls (acceptable trade-off)

## References
- https://github.com/t3dotgg/stripe-recommendations
- https://www.pedroalonso.net/blog/stripe-webhooks-deep-dive/
```

## Related
- AUDIT-003: External integrations review
- BUG-023: Entitlement race condition (partially mitigated by this pattern)
- SPEC-009: Stripe Integration
