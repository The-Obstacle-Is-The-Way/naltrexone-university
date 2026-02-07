# DEBT-133: Idempotency Polling Timeout Error Message Is Misleading

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-06
**Resolved:** 2026-02-07

---

## Description

When the idempotency polling loop times out, it throws `ApplicationError('CONFLICT', 'Request is already in progress')`. However, the concurrent request may have crashed without storing an error result — the message is misleading in that case.

## Impact

- Users see "Request is already in progress" when the issue may be a crashed request
- Debugging is harder without distinguishing active vs. failed requests
- Low frequency: only when a request crashes between claiming key and storing result

## Affected File

`src/adapters/shared/with-idempotency.ts` — `withIdempotency()` polling loop timeout throw

## Resolution

Improve the timeout error message to distinguish between:
1. Request is actively in progress (legitimate wait)
2. Request may have crashed without storing a result

Implemented message:
`"Request timed out waiting for idempotency key. The concurrent request may still be in progress or may have failed."`

## Verification

- [x] Timeout message distinguishes between in-progress and crashed scenarios
- [x] Message explicitly acknowledges both possibilities
- [x] Regression coverage added in `with-idempotency.test.ts`

## Related

- `src/adapters/shared/with-idempotency.ts`
- `src/adapters/shared/with-idempotency.test.ts`
