# BUG-166: manage-billing-core Catch Block Swallows Errors Without Logging

**Priority:** P3
**Status:** Resolved (2026-02-27)
**Found:** 2026-02-27 (Audit #7)
**Component:** Billing / Observability

---

## Problem

The `runManageBillingAction` function in `lib/manage-billing/manage-billing-core.ts` caught all errors thrown by `createPortalSessionFn` and silently redirected to the failure URL without logging. In production, when Stripe's portal API failed, there was zero diagnostic visibility.

## Root Cause

Before the fix, `lib/manage-billing/manage-billing-core.ts` had:

```typescript
let result: Awaited<ReturnType<CreatePortalSessionFn>>;
try {
  result = await deps.createPortalSessionFn({});
} catch {
  return deps.redirectFn(deps.redirects.failure);
}
```

The catch block:
1. Catches ALL thrown errors (network failures, Stripe SDK errors, unexpected exceptions)
2. Does not log the error
3. Does not capture the error for monitoring (Sentry, etc.)
4. Redirects immediately — the error is permanently lost

## Impact

- **Observability:** Zero server-side visibility when billing portal creation fails
- **Debugging:** Production issues with Stripe portal require reproducing the error; no logs exist
- **Alerting:** Monitoring systems cannot detect systematic Stripe failures from this code path
- **Scope:** Affects both the app billing page and pricing page manage-billing actions (both call this core function)

## Fix

Add a `logger` dependency to the core function and log the caught error:

```typescript
export async function runManageBillingAction(deps: {
  createPortalSessionFn: CreatePortalSessionFn;
  redirectFn: RedirectFn;
  redirects: ManageBillingRedirects;
  logger?: Pick<Logger, 'error'>;
}): Promise<void> {
  let result: Awaited<ReturnType<CreatePortalSessionFn>>;
  try {
    result = await deps.createPortalSessionFn({});
  } catch (error) {
    deps.logger?.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Billing portal session creation threw',
    );
    return deps.redirectFn(deps.redirects.failure);
  }
  // ...
}
```

The logger remains optional (`?`) to avoid breaking existing callers. Both app billing and pricing manage-billing actions now accept/pass logger dependencies, and their server-action wrappers default to `appLogger`.

## Verification

1. Unit test: Invoke `runManageBillingAction` with a `createPortalSessionFn` that throws → assert `logger.error` is called with the error message
2. Unit test: Invoke without logger → assert no crash (graceful degradation)
3. Caller wiring tests: App billing and pricing `runManageBillingAction` tests pass a `FakeLogger` and verify thrown errors are logged.

## Resolution

- **Resolved:** 2026-02-27
- **Commit:** `181e89f4c6fad0ec37a5e9388c8bf0b388c105b3`
- **Changes:**
  - Added optional `logger?: ManageBillingLogger` dependency to `runManageBillingAction` in `lib/manage-billing/manage-billing-core.ts`
  - Logged thrown portal-session errors before redirecting to failure URL
  - Wired logger through both callers:
    - `app/(app)/app/billing/manage-billing-action.ts`
    - `app/pricing/manage-billing-action.ts`
  - Wired default logger in both server-action wrappers:
    - `app/(app)/app/billing/manage-billing-actions.ts`
    - `app/pricing/manage-billing-actions.ts`
