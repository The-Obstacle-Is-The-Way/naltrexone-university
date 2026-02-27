# BUG-165: App Billing Manage-Billing Action Missing `unauthenticated` Redirect

**Priority:** P3
**Status:** Resolved (2026-02-27)
**Found:** 2026-02-27 (Audit #7)
**Component:** Billing / Server Actions

---

## Problem

The app billing page's `runManageBillingAction` did not provide an `unauthenticated` redirect in its `ManageBillingRedirects` config. When `createPortalSessionFn` returned an `UNAUTHENTICATED` error, the user was misdirected to `/app/billing?error=portal_failed` instead of `/sign-up`.

The pricing page's equivalent action already provided both redirects.

## Root Cause

Before the fix, `app/(app)/app/billing/manage-billing-action.ts` only provided `failure`:

```typescript
redirects: {
  failure: `${ROUTES.APP_BILLING}?error=portal_failed`,
  // Missing: unauthenticated: ROUTES.SIGN_UP,
},
```

Compare with `app/pricing/manage-billing-action.ts`, which correctly provided both:

```typescript
redirects: {
  failure: `${ROUTES.PRICING}?checkout=error`,
  unauthenticated: ROUTES.SIGN_UP,
},
```

The core routing logic in `lib/manage-billing/manage-billing-core.ts` checks for `redirects.unauthenticated` and falls back to `redirects.failure` when it's undefined:

```typescript
if (errorCode === 'UNAUTHENTICATED' && redirects.unauthenticated) {
  return redirects.unauthenticated;
}
return redirects.failure;
```

## Trigger Path

1. User loads `/app/billing` while authenticated
2. Clerk session expires (timeout, token rotation failure, etc.)
3. User clicks "Manage Billing" button
4. Server action `manageBillingAction` executes
5. `createPortalSessionFn` detects expired auth → returns `{ ok: false, error: { code: 'UNAUTHENTICATED' } }`
6. `getManageBillingErrorRedirect('UNAUTHENTICATED', redirects)` — `redirects.unauthenticated` is undefined
7. Falls back to `redirects.failure` → `/app/billing?error=portal_failed`
8. User sees error banner instead of being redirected to sign-in

## Impact

- **Severity:** Low — the `/app/*` routes are Clerk-middleware-protected, so the trigger requires session expiry between page load and action invocation (narrow race window)
- **UX:** User sees a confusing "portal failed" error instead of being prompted to sign in again
- **Inconsistency:** Pricing page handles this correctly; app billing page doesn't

## Fix

Add `unauthenticated` redirect to `app/(app)/app/billing/manage-billing-action.ts`:

```typescript
redirects: {
  failure: `${ROUTES.APP_BILLING}?error=portal_failed`,
  unauthenticated: ROUTES.SIGN_UP,
},
```

## Verification

1. Unit test: Invoke `runManageBillingAction` with a `createPortalSessionFn` that returns `{ ok: false, error: { code: 'UNAUTHENTICATED' } }` — assert redirect goes to `ROUTES.SIGN_UP`
2. Server action test: Invoke `manageBillingAction` with `UNAUTHENTICATED` result — assert redirect goes to `ROUTES.SIGN_UP`

## Resolution

- **Resolved:** 2026-02-27
- **Commit:** `181e89f4c6fad0ec37a5e9388c8bf0b388c105b3`
- **Changes:**
  - Added `unauthenticated: ROUTES.SIGN_UP` to `app/(app)/app/billing/manage-billing-action.ts`
  - Added app billing regression tests for unauthenticated redirects in both:
    - `app/(app)/app/billing/manage-billing-action.test.ts`
    - `app/(app)/app/billing/manage-billing-actions.test.ts`
