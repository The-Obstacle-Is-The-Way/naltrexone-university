# BUG-197: SubmitAnswer Two-Phase Write Without Transaction

**Status:** Fixed
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
1. `attempts.insert(...)` at [submit-answer.ts:182](../../../src/application/use-cases/submit-answer.ts#L182) — first write, no transaction.
2. `sessions.recordQuestionAnswer(...)` at [submit-answer.ts:210](../../../src/application/use-cases/submit-answer.ts#L210) — second write, can fail independently.
3. Rollback via `attempts.deleteById(...)` at [submit-answer.ts:220](../../../src/application/use-cases/submit-answer.ts#L220) — best-effort, can itself fail.
4. If `deleteById` returns false (line 224): throws `INTERNAL_ERROR`. Attempt is orphaned.
5. If `deleteById` throws (line 230): logs error and re-throws. Attempt is orphaned.

## Fix

Implemented by introducing a write-transaction dependency in `SubmitAnswerUseCase`:
- Added `SubmitAnswerWriteTransaction` callback-style port at the application layer.
- When a session-backed answer is submitted, `attempts.insert` and
  `sessions.recordQuestionAnswer` execute inside a single transaction callback.
- Removed the entire compensating-delete fallback path (~45 lines). Session-backed
  submissions now require `writeTransaction` — omitting it throws `INTERNAL_ERROR`
  instead of silently degrading to non-atomic writes.
- Wired production transaction in `lib/container/use-cases.ts` via
  `primitives.db.transaction(...)`, creating transaction-scoped repositories.

## Verification

- [x] Unit test added — `submit-answer.test.ts` verifies: (1) missing transaction throws `INTERNAL_ERROR`, (2) error propagates from transaction without compensating delete.
- [x] Integration test added — `controllers.integration.test.ts` proves that when `recordQuestionAnswer` fails mid-transaction, no attempt row is committed to the database.
- [ ] Manual verification
- [x] Code-level tracer-bullet verified (Audit #12, 2026-03-03)

## Related

- BUG-188 (CAS failures) can trigger Scenario A by exhausting CAS retries on `recordQuestionAnswer`.
- The manual rollback pattern previously at lines 218-252 was the only place in the codebase that attempted cross-write compensation outside a transaction. It has been fully removed.
