# BUG-036: No Loading State on Subscribe Buttons

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary
The pricing page subscribe buttons had no loading/disabled state during checkout. When a user clicked subscribe, there was no visual feedback until the Stripe redirect occurred.

## Location
- `app/pricing/pricing-client.tsx`
- `app/pricing/pricing-view.tsx`

## Root Cause
Buttons were simple submit buttons with no loading state integration.

## Fix
Created `SubscribeButton` client component using React 19's `useFormStatus` hook:

**pricing-client.tsx:**
```typescript
'use client';
import { useFormStatus } from 'react-dom';

export function SubscribeButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="... disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Processing...' : children}
    </button>
  );
}
```

**pricing-view.tsx:**
Accepts `SubscribeButtonComponent` prop (defaults to standard button for SSR/tests):
```typescript
export type PricingViewProps = {
  // ...
  SubscribeButtonComponent?: React.ComponentType<{ children: React.ReactNode }>;
};

// In form:
<form action={subscribeMonthlyAction}>
  <SubscribeButtonComponent>Subscribe Monthly</SubscribeButtonComponent>
</form>
```

## Verification
- [x] Unit test added (`page.test.tsx` - SubscribeButton renders children when not pending)
- [x] TypeScript compilation passes
- [x] Build succeeds
- [x] Manual test: Click subscribe, see "Processing..." and disabled state

## Related
- BUG-035: Error banner not clearable
- BUG-026: Concurrent checkout sessions (this prevents double-click issues)
