# BUG-084: Webhook Error Response Leaks Implementation Details

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-07

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

Handler already returned a generic 400 response and logged details server-side. Added explicit regression assertions in:

- `app/api/stripe/webhook/route.test.ts`

The tests now verify invalid signature and invalid payload both return:

```json
{ "error": "Webhook validation failed" }
```

## Verification

- [x] 400 response for invalid signature contains generic message only
- [x] 400 response for invalid payload contains generic message only
- [x] Valid webhook requests still process correctly

## Related

- `src/adapters/gateways/stripe/stripe-webhook-processor.ts` — Webhook processing
- OWASP — Improper Error Handling
