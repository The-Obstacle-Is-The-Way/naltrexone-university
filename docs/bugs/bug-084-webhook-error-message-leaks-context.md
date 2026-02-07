# BUG-084: Webhook Error Response Leaks Implementation Details

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

The Stripe webhook handler returns the full `error.message` in the HTTP response body for invalid signature and invalid payload errors. This can leak implementation details (Stripe SDK internals, signature comparison details) to external callers.

**Observed:** A 400 response body contains: `{"error":"Invalid webhook signature: No signatures found matching the expected signature for payload..."}`.

**Expected:** External-facing error responses should use generic messages. Detailed error context should only appear in server logs.

## Affected File

`app/api/stripe/webhook/handler.ts:78-84`

```typescript
if (
  isApplicationError(error) &&
  (error.code === 'INVALID_WEBHOOK_SIGNATURE' ||
    error.code === 'INVALID_WEBHOOK_PAYLOAD')
) {
  return NextResponse.json({ error: error.message }, { status: 400 });
  //                                 ^^^^^^^^^^^^^ leaks implementation details
}
```

## Fix

Return a generic message and log the detail server-side:

```typescript
if (
  isApplicationError(error) &&
  (error.code === 'INVALID_WEBHOOK_SIGNATURE' ||
    error.code === 'INVALID_WEBHOOK_PAYLOAD')
) {
  container.logger.error({ error }, 'Stripe webhook validation failed');
  return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
}
```

## Verification

- [ ] 400 response for invalid signature contains generic message only
- [ ] Detailed error is logged server-side for debugging
- [ ] Valid webhook requests still process correctly

## Related

- `src/adapters/gateways/stripe/stripe-webhook-processor.ts` — Webhook processing
- OWASP — Improper Error Handling
