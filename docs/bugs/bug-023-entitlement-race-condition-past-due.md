# BUG-023: Entitlement Race Condition During Payment Failure

## Severity: P1 - High

## Summary
When a Stripe subscription transitions to `past_due` status (payment failure), there is a race condition window where `isEntitled()` may still return `true` because the database hasn't been updated yet via webhook.

## Location
- `src/domain/services/entitlement.ts:7-15`
- `src/domain/value-objects/subscription-status.ts:27-29`

## Current Behavior
```typescript
// entitlement.ts
export function isEntitled(
  subscription: Subscription | null,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (!isEntitledStatus(subscription.status)) return false;  // Only checks 'active'/'trialing'
  if (subscription.currentPeriodEnd <= now) return false;
  return true;
}
```

The `EntitledStatuses` array only includes `['active', 'trialing']`. When payment fails:
1. Stripe immediately marks subscription as `past_due`
2. Stripe sends webhook to update database
3. **Race window:** Between steps 1 and 2, database still shows `active`
4. During this window, `isEntitled()` returns `true` for a user with failed payment

## Expected Behavior
Zero trust of stale subscription state during payment processing. Users with failed payments should be denied access immediately upon Stripe state change.

## Impact
- **Revenue leakage:** Users access premium content without paying
- **Grace period abuse:** Window can be exploited if webhook processing is slow
- **SLA violation:** Paying customers subsidize non-paying users

## Root Cause
1. Webhook-based state synchronization has inherent latency
2. No real-time Stripe API check at entitlement time
3. `past_due` status not explicitly handled

## Recommended Fix
**Option A (Minimal):** Document the race window and accept it as a trade-off for performance:
```typescript
/**
 * NOTE: There is a small window (ms to seconds) between Stripe marking
 * a subscription as past_due and the webhook updating the database.
 * This is acceptable for SaaS; consider real-time checks for high-value operations.
 */
```

**Option B (Stricter):** Add a grace period buffer to the entitlement check:
```typescript
// Deny access if within 1 hour of period end (covers grace period)
if (subscription.currentPeriodEnd <= new Date(now.getTime() + 3600000)) {
  // Consider real-time Stripe API check here
}
```

**Option C (Real-time):** For critical operations, query Stripe API directly.

## Related
- BUG-014: Fragile webhook error matching
- SPEC-009: Stripe Integration
