# BUG-165: App Billing Manage-Billing Action Missing `unauthenticated` Redirect

**Priority:** P3
**Status:** Open
**Found:** 2026-02-27 (Audit #7)
**Component:** Billing / Server Actions

---

## Problem

The app billing page's `runManageBillingAction` does not provide an `unauthenticated` redirect in its `ManageBillingRedirects` config. When `createPortalSessionFn` returns an `UNAUTHENTICATED` error, the user is misdirected to `/app/billing?error=portal_failed` instead of `/sign-up`.

The pricing page's equivalent action correctly provides both redirects.

## Root Cause

`app/(app)/app/billing/manage-billing-action.ts` lines 14-16 only provides `failure`:

```typescript
redirects: {
  failure: `${ROUTES.APP_BILLING}?error=portal_failed`,
  // Missing: unauthenticated: ROUTES.SIGN_UP,
},
```

Compare with `app/pricing/manage-billing-action.ts` lines 14-17 which correctly provides both:

```typescript
redirects: {
  failure: `${ROUTES.PRICING}?checkout=error`,
  unauthenticated: ROUTES.SIGN_UP,
},
```

The core routing logic at `lib/manage-billing/manage-billing-core.ts` line 12 checks for `redirects.unauthenticated` and falls back to `redirects.failure` when it's undefined:

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
2. Parity test: Both manage-billing-action files (app billing + pricing) provide identical redirect key sets
