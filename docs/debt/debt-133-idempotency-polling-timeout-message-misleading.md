# DEBT-133: Idempotency Polling Timeout Error Message Is Misleading

**Status:** Open
**Priority:** P3
**Date:** 2026-02-06

---

## Description

When the idempotency polling loop times out, it throws `ApplicationError('CONFLICT', 'Request is already in progress')`. However, the concurrent request may have crashed without storing an error result — the message is misleading in that case.

## Impact

- Users see "Request is already in progress" when the issue may be a crashed request
- Debugging is harder without distinguishing active vs. failed requests
- Low frequency: only when a request crashes between claiming key and storing result

## Affected File

`src/adapters/shared/with-idempotency.ts` — Polling loop timeout throw

## Resolution

Improve the timeout error message to reflect both possible scenarios.

## Verification

- [ ] Timeout message is accurate
- [ ] Existing idempotency tests pass

## Related

- `src/adapters/shared/with-idempotency.ts`
- `src/adapters/shared/with-idempotency.test.ts`
