# BUG-024: Missing Subscription Event Handlers (paused/resumed/incomplete_expired)

## Severity: P2 - Medium

## Summary
The Stripe webhook handler only processes three subscription event types. Several important event types are silently ignored, leaving the database out of sync with Stripe.

## Location
- `src/adapters/gateways/stripe-payment-gateway.ts:187-192`

## Current Behavior
```typescript
if (
  event.type !== 'customer.subscription.created' &&
  event.type !== 'customer.subscription.updated' &&
  event.type !== 'customer.subscription.deleted'
) {
  return result;  // Silently returns without processing
}
```

## Missing Event Types
1. **`customer.subscription.paused`** - Subscription paused by user/admin
2. **`customer.subscription.resumed`** - Subscription unpaused
3. **`customer.subscription.pending_update_applied`** - Scheduled update applied
4. **`customer.subscription.pending_update_expired`** - Scheduled update expired
5. **`invoice.payment_failed`** - Payment failure notification (separate from subscription.updated)
6. **`invoice.payment_action_required`** - 3D Secure or authentication needed

## Impact
- **`paused` status in schema but never set:** Database has `paused` as valid status, but no code path sets it
- **Data consistency:** Stripe state diverges from database state
- **User confusion:** User pauses subscription in Stripe portal, app still shows active

## Expected Behavior
All subscription state-changing events should be handled:
1. `paused` → Set status to 'paused', deny entitlement
2. `resumed` → Set status back to 'active'
3. Payment failures → Consider immediate entitlement denial or grace period

## Root Cause
Original implementation only covered the minimal happy-path events.

## Recommended Fix
```typescript
// Add handling for pause events
if (event.type === 'customer.subscription.paused') {
  // Update subscription status to 'paused'
}

if (event.type === 'customer.subscription.resumed') {
  // Update subscription status back to 'active'
}
```

## Related
- `db/schema.ts:151` - `paused` is a valid status enum value
- SPEC-009: Stripe Integration (line 69-74 lists minimum events)
