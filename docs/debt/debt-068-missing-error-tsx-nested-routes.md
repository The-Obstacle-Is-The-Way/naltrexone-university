# DEBT-068: Missing error.tsx in Nested Routes

## Category: Error Handling / UX

## Summary
Several app routes lack dedicated `error.tsx` files, falling back to the root error boundary. This means errors in these routes show a generic error page instead of a contextual one.

## Locations Missing error.tsx
- `app/(app)/app/practice/` - No error.tsx
- `app/(app)/app/billing/` - No error.tsx
- `app/(app)/app/dashboard/` - No error.tsx

## Current State
Only root error boundaries exist:
- `app/error.tsx` (catches all app errors)
- `app/global-error.tsx` (catches root layout errors)

## Impact
- **Generic error experience:** All errors look the same
- **Lost context:** User can't see what action failed
- **Poor error recovery:** Can't offer route-specific retry actions

## Example
If practice page errors:
1. User sees "Something went wrong"
2. No indication it was a practice error
3. "Try again" might not be the right action
4. User doesn't know to go to dashboard or contact support

## Effort: Low-Medium

## Recommended Fix
Create route-specific error boundaries:

```typescript
// app/(app)/app/practice/error.tsx
'use client';

export default function PracticeError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="text-center py-16">
      <h2>Practice Error</h2>
      <p>We couldn't load your practice session.</p>
      <div className="mt-4 flex gap-4 justify-center">
        <button onClick={reset}>Try Again</button>
        <Link href="/app/dashboard">Back to Dashboard</Link>
      </div>
    </div>
  );
}

// app/(app)/app/billing/error.tsx
'use client';

export default function BillingError({ reset }) {
  return (
    <div className="text-center py-16">
      <h2>Billing Error</h2>
      <p>We couldn't load your billing information.</p>
      <p>Your subscription is not affected.</p>
      <button onClick={reset}>Try Again</button>
    </div>
  );
}
```

## Priority
Lower priority than functional bugs, but improves user experience during errors.

## Related
- DEBT-067: Generic error page lacks details
- Next.js error handling docs
