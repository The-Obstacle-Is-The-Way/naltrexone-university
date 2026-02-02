# DEBT-058: cancelAtPeriodEnd Stored But Never Displayed in UI

## Category: Feature Gap

## Summary
The database stores `cancelAtPeriodEnd` boolean from Stripe, but the UI never displays this information to users. Users who cancel their subscription don't see when it will actually end.

## Location
- `db/schema.ts:140` - Field defined
- `app/(app)/app/billing/page.tsx` - No display of cancellation status

## Current State
```typescript
// Schema stores the field
cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),

// Webhook updates it correctly
// But billing page doesn't show it
```

## Expected Behavior
Billing page should show:
- "Your subscription will cancel on [date]" when `cancelAtPeriodEnd = true`
- Or allow user to reactivate

## Impact
- **User confusion:** "Did my cancellation work?"
- **Support burden:** Users ask if they're still being charged
- **Poor UX:** No visibility into subscription state

## Effort: Low
Just needs a conditional UI element on billing page.

## Recommended Fix
```typescript
{subscription?.cancelAtPeriodEnd && (
  <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4">
    <p>Your subscription will cancel on {formatDate(subscription.currentPeriodEnd)}.</p>
    <p>You'll have access until then.</p>
  </div>
)}
```

## Related
- BUG-016: Billing button without subscription
- SPEC-009: Stripe Integration
