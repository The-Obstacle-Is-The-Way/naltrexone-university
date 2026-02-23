# BUG-149: Idempotency Null Result Is Indistinguishable from Pending State

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-22
**Resolved:** 2026-02-23

---

## Description

`withIdempotency()` previously treated completion as `resultJson !== null`.
Pending rows also used `resultJson = null`, so a legitimate completed `null`
result was indistinguishable from "still pending" and could timeout with
`CONFLICT` for concurrent callers.

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

## Root Cause

`null` is overloaded for two meanings:

1. "No result yet" (pending sentinel)
2. "Completed with null result"

Without a separate completion signal, these states collapse.

## Resolution

Implemented an explicit completion marker end-to-end.

1. Added `completed_at` nullable timestamp to `idempotency_keys`.
2. Updated repository contract (`IdempotencyKeyRecord`) with `completedAt`.
3. `claim()` initializes/resets `completedAt = null` for pending rows.
4. `storeResult()` and `storeError()` now set `completedAt = now()`.
5. `withIdempotency()` now treats completion as `existing.completedAt !== null`
   (not `resultJson !== null`), allowing cached `null` results to replay.
6. Added safe rollout compatibility for pre-fix rows:
   - migration backfills `completed_at` for already-completed legacy rows
   - runtime fallback still replays legacy rows with non-null `resultJson`

## Verification

- [x] Unit test: action returning `null` is replayed immediately (no timeout)
- [x] Unit + repository tests verify completion marker semantics
- [x] Integration test verifies `resultJson = null` + `completedAt` is persisted
- [x] Migration added for `completed_at` column

## Related

- `src/adapters/shared/with-idempotency.ts`
- `src/adapters/shared/with-idempotency.test.ts`
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts`
- `src/adapters/repositories/drizzle-idempotency-key-repository.test.ts`
- `src/application/ports/idempotency-key-repository.ts`
- `src/application/test-helpers/fakes/fake-idempotency-key-repository.ts`
- `tests/integration/repositories.integration.test.ts`
- `db/schema.ts`
- `db/migrations/0012_whole_baron_strucker.sql`
