# BUG-014: Fragile Webhook Error Matching Uses String Instead of Error Code

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

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

Option 1: Add a specific error code for invalid signatures:
```typescript
// In application errors
type StripeErrorCode = 'STRIPE_ERROR' | 'INVALID_WEBHOOK_SIGNATURE';

// In handler
if (isApplicationError(error) && error.code === 'INVALID_WEBHOOK_SIGNATURE') {
  return NextResponse.json({ error: error.message }, { status: 400 });
}
```

Option 2: Use a constant for the message string shared between files.

## Verification

- [ ] Unit test added that verifies 400 response for invalid signature
- [ ] Unit test added that verifies coupling between gateway and handler
- [ ] Integration test with actual invalid Stripe signature
- [ ] Manual verification

## Related

- `app/api/stripe/webhook/handler.ts:44-47`
- `src/adapters/gateways/stripe-payment-gateway.ts`
- SPEC-010: Stripe Integration
