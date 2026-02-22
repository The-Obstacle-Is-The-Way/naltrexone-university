# BUG-149: Idempotency Null Result Is Indistinguishable from Pending State

**Status:** Open
**Priority:** P3
**Date:** 2026-02-22

---

## Description

`withIdempotency()` in `src/adapters/shared/with-idempotency.ts:114` treats completion as:

```typescript
if (existing.resultJson !== null) {
  // Return cached result
}
```

Because pending rows are also stored with `resultJson = null`, a legitimate completed `null` result cannot be distinguished from "still pending".

## Actual Lifecycle in Current Implementation

| State | `resultJson` | `errorCode` |
|-------|-------------|-------------|
| Pending/in-progress | `null` | `null` |
| Completed (non-null result) | `<json value>` | `null` |
| Failed | `null` | `<error code>` |

This matches repository behavior:

- `claim()` initializes pending row with `resultJson = null`, `errorCode = null`
- `storeResult()` stores `resultJson` and clears error fields
- `storeError()` stores error fields and sets `resultJson = null`

## Behavioral Impact of a Legitimate `null` Result

If an idempotent operation legitimately returns `null`/`undefined`:

1. First request stores `resultJson = null`.
2. Second concurrent request treats it as pending.
3. It keeps polling until `maxWaitMs` (~2s default).
4. It throws `ApplicationError('CONFLICT', ...)` timeout.

Important correction: the second caller does **not** return `null` after delay; it times out with `CONFLICT`.

## Current Impact

**Latent / None in current production call sites**.

All current `withIdempotency` callers parse into non-null object outputs:

- `billing:createCheckoutSession`
- `bookmark:toggleBookmark`
- `practice:startPracticeSession`
- `practice:endPracticeSession`
- `practice:setPracticeSessionQuestionMark`
- `question:submitAnswer`

No current idempotent action is expected to complete with `null`.

## `withIdempotency` Callers (Complete List)

- `src/adapters/controllers/billing-controller.ts`
- `src/adapters/controllers/bookmark-controller.ts`
- `src/adapters/controllers/practice-controller.ts` (3 actions)
- `src/adapters/controllers/question-controller.ts`

## Schema Reality: `idempotency_keys` Columns

Current table columns (`db/schema.ts`):

- `user_id` (uuid, PK part)
- `action` (varchar, PK part)
- `key` (varchar, PK part)
- `result_json` (jsonb, nullable)
- `error_code` (varchar, nullable)
- `error_message` (text, nullable)
- `created_at` (timestamp)
- `expires_at` (timestamp)

There is no explicit completion marker (`completed_at`/`status`).

## Error-Code Ambiguity Check

No equivalent ambiguity exists in current error handling.

`withIdempotency()` checks `existing.error` before checking `resultJson`, so failed rows are replayed immediately as `ApplicationError(code, message)`.

## Root Cause

`null` is overloaded for two meanings:

1. "No result yet" (pending sentinel)
2. "Completed with null result"

Without a separate completion signal, these states collapse.

## Recommended Fix

Preferred:

- Add `completedAt` (or explicit status enum) to `idempotency_keys`.
- Treat completion as `completedAt !== null`, independent of `resultJson` value.

Sketch:

```typescript
if (existing.completedAt !== null) {
  return existing.resultJson as T; // may be null
}
```

## Verification

- [ ] Unit test: action returning `null` is replayed immediately (no timeout)
- [ ] Unit test: concurrent caller receives cached `null` without `CONFLICT`
- [ ] Migration + repository tests for `completedAt`/status semantics

## Related

- `src/adapters/shared/with-idempotency.ts:99-135`
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts:21-161`
- `db/schema.ts:203-223`
- `src/adapters/shared/with-idempotency.test.ts`
