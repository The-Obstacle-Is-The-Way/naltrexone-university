# BUG-017: Billing Page Shows "Manage in Stripe" When User Has No Subscription

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The billing page always shows the "Manage in Stripe" button, even for users without an active subscription. When clicked, the button fails silently and redirects back to the billing page with no error message.

**Observed behavior:**
1. User with no subscription sees "Manage in Stripe" button
2. User clicks button
3. `createPortalSession` fails with NOT_FOUND
4. User redirected to `/app/billing` with no feedback
5. User confused — nothing happened

**Expected behavior:**
- Button hidden or disabled when no subscription exists, OR
- Clear error message shown when portal session creation fails

## Steps to Reproduce

1. Create a user account without subscribing
2. Navigate to `/app/billing`
3. Observe: "Manage in Stripe" button is visible
4. Click the button
5. Observe: Page reloads with no indication of what happened

## Root Cause

**Location:** `app/(app)/app/billing/page.tsx:71-78`

```typescript
async function manageBilling() {
  const result = await createPortalSession({});
  if (!result.ok) {
    redirect('/app/billing');  // No error message passed!
  }
  redirect(result.data.url);
}
```

The error path redirects without any query parameter or toast to inform the user.

Additionally, the button is always rendered regardless of subscription status.

## Fix

Option 1: Hide button when no subscription:
```typescript
{hasActiveSubscription && (
  <form action={manageBilling}>
    <Button type="submit">Manage in Stripe</Button>
  </form>
)}
```

Option 2: Pass error to URL and display:
```typescript
if (!result.ok) {
  redirect('/app/billing?error=no_subscription');
}
```

Then display the error on the billing page.

## Verification

- [x] Unit test: button not rendered when no subscription
- [x] `BillingContent` component extracted for testability
- [x] Tests in `app/(app)/app/billing/page.test.tsx`
- [x] `ManageBillingButton` with loading state created

## Related

- `app/(app)/app/billing/page.tsx:71-78`
- `src/adapters/controllers/billing-controller.ts`
