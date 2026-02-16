# BUG-139: GetPreviousAttemptUseCase Silently Returns Null on Data Integrity Mismatch

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

When `GetPreviousAttemptUseCase` fetches an attempt by ID and the attempt's `questionId` doesn't match `input.questionId`, it logs a warning and returns `null`. This silently masks what could be a data integrity issue — either the repository returned wrong data, or the caller is using corrupted IDs.

**Observed:** Mismatched `attemptId ↔ questionId` pairs are logged as a warning and treated as "no attempt found."

**Expected:** A mismatch between a fetched attempt's `questionId` and the requested `questionId` should be flagged as a data integrity error, not silently ignored.

## Steps to Reproduce

1. Call `GetPreviousAttemptUseCase.execute()` with a valid `attemptId` and a `questionId` that doesn't match the attempt's actual question
2. Use case logs a warning and returns `null`
3. Caller cannot distinguish between "no attempt exists" and "data is corrupted"

## Root Cause

`src/application/use-cases/get-previous-attempt.ts:49-58`:
```typescript
if (attempt.questionId !== input.questionId) {
  this.logger.warn(
    { attemptId, questionId, attemptQuestionId: attempt.questionId },
    'Previous attempt does not match requested question',
  );
  return null;
}
```

## Fix

Escalate to an `ApplicationError` so callers (and monitoring) can detect data integrity issues:

```typescript
if (attempt.questionId !== input.questionId) {
  this.logger.error(
    { attemptId: input.attemptId, questionId: input.questionId, attemptQuestionId: attempt.questionId },
    'Previous attempt does not match requested question — possible data corruption',
  );
  throw new ApplicationError(
    'INTERNAL_ERROR',
    'Attempt does not belong to the requested question',
  );
}
```

Alternatively, if the soft-fail behavior is intentional (e.g., for UX), document the reasoning inline.

## Verification

- [ ] Unit test: `it('throws INTERNAL_ERROR when attempt questionId mismatches input questionId')`
- [ ] Review callers to ensure they handle the error gracefully

## Related

- `src/application/use-cases/get-previous-attempt.ts:25-99`
