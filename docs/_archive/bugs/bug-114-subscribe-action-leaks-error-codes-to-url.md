# BUG-114: Subscribe Action Exposes Internal Error Codes in URL Params

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

`runSubscribeAction()` in `subscribe-action.ts` explicitly handles three error codes (`UNAUTHENTICATED`, `ALREADY_SUBSCRIBED`, `RATE_LIMITED`) but all other codes fall through to a default path that places the raw internal error code directly in the URL query params.

**Observed:** When checkout fails with an unhandled code (e.g., `INTERNAL_ERROR`, `STRIPE_ERROR`, `CONFLICT`, `VALIDATION_ERROR`), the URL becomes:
```
/pricing?checkout=error&plan=monthly&error_code=INTERNAL_ERROR
```

In development mode, the raw error message is also appended (truncated to 200 chars):
```
/pricing?checkout=error&plan=monthly&error_code=STRIPE_ERROR&error_message=Failed+to+create+checkout+session
```

**Expected:** Internal error codes should be mapped to user-safe categories before being placed in URLs. The URL should use a generic identifier like `checkout=error` without exposing the internal error taxonomy.

## Root Cause

**File:** `app/pricing/subscribe-action.ts:53-65`

```typescript
const url = new URL(ROUTES.PRICING, 'https://example.com');
url.searchParams.set('checkout', 'error');
url.searchParams.set('plan', input.plan);
url.searchParams.set('error_code', result.error.code);  // <-- raw internal code

if (process.env.NODE_ENV === 'development') {
  const rawMessage = result.error.message;
  const safeMessage =
    rawMessage.length > 200 ? `${rawMessage.slice(0, 200)}…` : rawMessage;
  url.searchParams.set('error_message', safeMessage);  // <-- raw message in dev
}
```

The `error_code` is always set from `result.error.code`, which is an `ApplicationErrorCode` enum value. These internal codes are:
- Visible in the browser address bar
- Logged in browser history
- Can leak via `Referer` headers to external services
- Expose the system's internal error taxonomy

## Impact

- **Information exposure** — internal error codes visible to users and potentially third parties via `Referer` headers
- **Non-exhaustive handling** — when new `ApplicationErrorCode` values are added, they automatically leak to URLs without explicit handling
- **Dev mode message leak** — raw error messages (which may contain database details, Stripe API errors, etc.) appear in URLs during development, and could accidentally reach production if `NODE_ENV` is misconfigured

## Resolution

Removed internal error taxonomy from pricing redirect URLs:

1. `runSubscribeAction()` now redirects generic failures to `/pricing?checkout=error&plan=<plan>` only.
2. `runManageBillingAction()` now redirects generic failures to `/pricing?checkout=error` only.
3. `getPricingBanner()` no longer renders development-only `error_code` / `error_message` query details; checkout error messaging is always user-safe and generic.
4. Internal diagnostics remain server-side through structured logger calls (`logError`) so observability is preserved without URL leakage.

## Verification

- [x] Internal `ApplicationErrorCode` values are not appended to pricing URLs
- [x] Development-mode URLs do not include `error_message`
- [x] Checkout errors still log server-side with structured context
- [x] User-facing checkout banner remains actionable and generic
- [x] Subscribe/manage-billing pricing tests updated and passing
- [x] Full quality gates pass (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `app/pricing/subscribe-action.ts`
- `app/pricing/subscribe-actions.ts` — server actions that call `runSubscribeAction`
- `app/pricing/subscribe-actions.test.ts` — existing tests
- `src/application/errors.ts` — `ApplicationErrorCode` enum
