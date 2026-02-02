# BUG-035: No Loading State on Subscribe Buttons

## Severity: P2 - Medium

## Summary
The pricing page subscribe buttons have no loading/disabled state during checkout. When a user clicks subscribe, there is no visual feedback until the Stripe redirect occurs.

## Location
- `app/pricing/page.tsx:130-135` (monthly button)
- `app/pricing/page.tsx:156-161` (annual button)

## Current Behavior
```typescript
<form action={subscribeMonthlyAction}>
  <button
    type="submit"
    className="w-full rounded-lg bg-orange-600 py-3 font-semibold text-white hover:bg-orange-700"
  >
    Subscribe Monthly
  </button>
</form>
```

No:
- `disabled` attribute during submission
- Loading spinner or text change
- Visual indication that action is processing

## Expected Behavior
1. User clicks "Subscribe Monthly"
2. Button shows loading state (spinner, "Processing...", disabled)
3. Stripe checkout opens
4. (Or error state if checkout fails)

## Impact
- **Double-click risk:** Users may click multiple times
- **Abandonment:** Users think nothing happened, leave page
- **Poor accessibility:** No announcement of pending action

## Scenario
1. User clicks Subscribe
2. Network latency or slow server response
3. Button stays static, no feedback
4. User clicks again → potential duplicate checkout sessions (see BUG-025)
5. User gets confused

## Recommended Fix
Use React 19's `useFormStatus` or `useTransition`:

**Option A:** useFormStatus (recommended for server actions)
```typescript
'use client';
import { useFormStatus } from 'react-dom';

function SubscribeButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-orange-600 py-3 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
    >
      {pending ? 'Processing...' : children}
    </button>
  );
}

// Usage
<form action={subscribeMonthlyAction}>
  <SubscribeButton>Subscribe Monthly</SubscribeButton>
</form>
```

**Option B:** useTransition (for client-side state)
```typescript
const [isPending, startTransition] = useTransition();

<button
  disabled={isPending}
  onClick={() => startTransition(() => subscribeMonthlyAction())}
>
  {isPending ? 'Processing...' : 'Subscribe Monthly'}
</button>
```

## Related
- BUG-021: Missing loading states on forms (related)
- BUG-025: Concurrent checkout sessions (caused by double-click)
