# BUG-197: SubmitAnswer Two-Phase Write Without Transaction

**Status:** Open
**Priority:** P2
**Date:** 2026-03-03

---

## Description

`SubmitAnswerUseCase.execute()` performs two dependent writes — attempt insert and session state update — without a database transaction. The manual rollback path can fail, leaving orphaned attempt rows. A concurrent `endPracticeSession` between the two writes can also cause valid answer loss.

Observed behavior:
- If `recordQuestionAnswer` (session state update) fails and the rollback `deleteById` also fails, the attempt row persists permanently with no matching session state.
- If `endPracticeSession` runs between the attempt insert and the session state update, `recordQuestionAnswer` throws `CONFLICT` and the attempt is rolled back — the user loses a valid answer.

Expected behavior:
- Both writes should succeed or fail atomically. No orphaned attempts. No lost valid answers.

## Steps to Reproduce

### Scenario A (Orphaned attempt):
1. Submit an answer to a session question.
2. Simulate `recordQuestionAnswer` failing (e.g., CAS exhaustion from BUG-188).
3. Simulate `deleteById` also failing (e.g., transient DB error).
4. Observe: attempt row persists, session state does not include the answer, user sees error.

### Scenario B (Lost answer on concurrent end):
1. Submit an answer to a session question.
2. Simultaneously end the session from another tab.
3. If `endPracticeSession` completes between `attempts.insert` and `sessions.recordQuestionAnswer`, the answer is rolled back despite being a valid submission to a still-open session at submit time.

## Root Cause

Tracer-bullet path:
1. `attempts.insert(...)` at [submit-answer.ts:182](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.ts:182) — first write, no transaction.
2. `sessions.recordQuestionAnswer(...)` at [submit-answer.ts:210](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.ts:210) — second write, can fail independently.
3. Rollback via `attempts.deleteById(...)` at [submit-answer.ts:220](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.ts:220) — best-effort, can itself fail.
4. If `deleteById` returns false (line 224): throws `INTERNAL_ERROR`. Attempt is orphaned.
5. If `deleteById` throws (line 230): logs error and re-throws. Attempt is orphaned.
6. No idempotency protection on the attempt insert for non-session (ad-hoc) mode — the `ATTEMPTS_SESSION_QUESTION_UQ` partial unique index only covers `practiceSessionId IS NOT NULL`.

## Fix

Not yet implemented.

Expected fix shape:
- Wrap both writes in a database transaction. The Drizzle `db.transaction()` API supports this.
- This requires the use case to receive a transaction-capable DB handle, or the repository port to expose a `withTransaction` method.
- Alternative (if transaction refactor is too large): accept the best-effort rollback but add a DB-level constraint or cleanup job for orphaned attempts.

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification
- [x] Code-level tracer-bullet verified (Audit #12, 2026-03-03)

## Related

- BUG-188 (CAS failures) can trigger Scenario A by exhausting CAS retries on `recordQuestionAnswer`.
- The manual rollback pattern at lines 218-252 is the only place in the codebase that attempts cross-write compensation outside a transaction.
