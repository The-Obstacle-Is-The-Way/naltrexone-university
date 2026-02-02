# BUG-025: No Protection Against Concurrent Checkout Sessions

## Severity: P2 - Medium

## Summary
A user can initiate multiple Stripe checkout sessions simultaneously. If both are completed, race conditions occur in webhook processing and subscription state.

## Location
- `src/adapters/controllers/billing-controller.ts:85-113` (createCheckoutSession)

## Current Behavior
1. User clicks "Subscribe Monthly" → Redirected to Stripe checkout
2. Before completing, user opens new tab and clicks "Subscribe Annual"
3. Second checkout session created without checking for existing session
4. Both sessions are valid and can be completed
5. Webhook processing may:
   - Create two subscriptions (double billing)
   - Race condition on database upsert
   - Undefined behavior

## Expected Behavior
- Only one active checkout session per user at a time
- Attempting to create a second session should either:
  - Return the existing session URL
  - Cancel the old session and create new one
  - Error with "checkout already in progress"

## Impact
- **Double billing:** User charged twice if both sessions completed
- **Data corruption:** Race condition in subscription upsert
- **Support burden:** Users confused by duplicate subscriptions

## Root Cause
No deduplication logic for checkout sessions. Each call to `createCheckoutSession` creates a new Stripe session unconditionally.

## Recommended Fix
**Option A:** Query for existing checkout sessions before creating:
```typescript
// Before creating new session
const existingSessions = await stripe.checkout.sessions.list({
  customer: stripeCustomerId,
  status: 'open',
  limit: 1,
});

if (existingSessions.data.length > 0) {
  // Return existing session URL or expire it first
  return ok({ url: existingSessions.data[0].url });
}
```

**Option B:** Store checkout session ID in database, expire on new request:
```typescript
// In users or separate table
checkout_session_id: varchar('checkout_session_id')
```

## Related
- SPEC-009: Stripe Integration
- Stripe docs: https://stripe.com/docs/api/checkout/sessions/list
