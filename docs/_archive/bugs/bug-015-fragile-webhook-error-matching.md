# BUG-015: Fragile Webhook Error Matching Uses String Instead of Error Code

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The Stripe webhook handler relies on exact string matching of error messages to determine HTTP response codes. If the error message text changes anywhere in the codebase, the handler silently returns 500 instead of 400 for invalid signatures.

**Observed behavior:** Error handling depends on:
```typescript
error.message === 'Invalid webhook signature'
```

**Expected behavior:** Error handling should use error codes, not message strings.

## Steps to Reproduce

1. Navigate to `app/api/stripe/webhook/handler.ts` lines 44-47
2. Note the exact string match: `error.message === 'Invalid webhook signature'`
3. Navigate to `src/adapters/gateways/stripe-payment-gateway.ts`
4. Change the error message to anything else (e.g., "Bad webhook signature")
5. Send an invalid webhook signature to the endpoint
6. Observe: Returns 500 instead of 400

## Root Cause

The error message is being used as a pseudo-API contract without documentation. The handler in `handler.ts` and the gateway in `stripe-payment-gateway.ts` are coupled by a magic string instead of a typed error code.

**Location:** `app/api/stripe/webhook/handler.ts:44-47`

```typescript
if (
  isApplicationError(error) &&
  error.code === 'STRIPE_ERROR' &&
  error.message === 'Invalid webhook signature'  // ← Fragile
) {
  return NextResponse.json({ error: error.message }, { status: 400 });
}
```

## Fix

Added `INVALID_WEBHOOK_SIGNATURE` error code to `ApplicationErrorCodes` and updated:
1. `src/application/errors/application-errors.ts` - Added new error code
2. `src/adapters/gateways/stripe-payment-gateway.ts` - Throws `INVALID_WEBHOOK_SIGNATURE` instead of `STRIPE_ERROR`
3. `app/api/stripe/webhook/handler.ts` - Checks `error.code === 'INVALID_WEBHOOK_SIGNATURE'` (removed message string matching)

## Verification

- [x] Unit test added that verifies 400 response for invalid signature
- [x] Unit test verifies gateway throws INVALID_WEBHOOK_SIGNATURE error code
- [x] All 384 tests pass
- [x] TypeScript compiles without errors
- [x] Production build succeeds

## Related

- `app/api/stripe/webhook/handler.ts:44-47`
- `src/adapters/gateways/stripe-payment-gateway.ts`
- SPEC-010: Stripe Integration
