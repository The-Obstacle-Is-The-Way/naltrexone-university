# BUG-021: Missing Loading States on Form Buttons

**Status:** Open
**Priority:** P3
**Date:** 2026-02-02

---

## Description

Form buttons on pricing and billing pages have no loading/disabled state while server actions are processing. Users can click multiple times, potentially triggering duplicate Stripe sessions.

**Observed behavior:**
- User clicks "Subscribe Monthly" or "Manage in Stripe"
- Button stays enabled while request processes
- User can click again, triggering duplicate requests
- No visual feedback that action is processing

**Expected behavior:**
- Button disabled immediately on click
- Loading spinner or "Processing..." text
- Button re-enabled only after redirect or error

## Steps to Reproduce

1. Navigate to `/pricing`
2. Click "Subscribe Monthly" button
3. Quickly click again before redirect
4. Observe: Two checkout sessions may be created

Same issue on `/app/billing` with "Manage in Stripe" button.

## Root Cause

**Location:** `app/pricing/page.tsx` and `app/(app)/app/billing/page.tsx`

Forms use server actions but don't use `useFormStatus` or `useTransition` to track pending state:

```typescript
// Current - no pending state
<Button type="submit">Subscribe Monthly</Button>

// Should be
<SubmitButton>Subscribe Monthly</SubmitButton>

// Where SubmitButton uses useFormStatus
function SubmitButton({ children }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Processing...' : children}
    </Button>
  );
}
```

## Fix

1. Create a reusable `SubmitButton` component that uses `useFormStatus`:
```typescript
'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, ...props }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? <Spinner /> : children}
    </Button>
  );
}
```

2. Replace all form submit buttons with `SubmitButton`

3. Add to both pricing page buttons and billing page button

## Verification

- [ ] Pricing page: Subscribe buttons show loading state
- [ ] Billing page: Manage button shows loading state
- [ ] Cannot double-click during processing
- [ ] Visual feedback present (spinner or text change)
- [ ] Manual verification on slow network

## Related

- `app/pricing/page.tsx:129-136, 155-162`
- `app/(app)/app/billing/page.tsx:71-78`
- React docs: useFormStatus
