# BUG-269: `FinalizeExamAnswersUseCase` stale-snapshot clobber claim

**Status:** Invalidated (false positive against current HEAD)
**Priority:** ~~P1~~ N/A
**Date:** 2026-07-01

---

## Summary

The original report claimed `FinalizeExamAnswersUseCase` can silently overwrite a concurrent draft autosave with an omitted outcome because it decides each question from the session snapshot loaded before its own per-question state lock is acquired.

The trace was partially right but the active-bug conclusion was wrong against current `chore/legacy-audit` head. The stale snapshot window exists, but the current BUG-267 fix opens the owning finalize/submit write transactions at `REPEATABLE READ` (`lib/container/use-cases.ts:35-59, 192-206`). Under that isolation level, the later `UPDATE practice_session_question_states ... WHERE id = ... AND version = ...` in `updatePracticeSessionQuestionState` (`src/adapters/repositories/practice-session-question-state-updater.ts:169-189`) does not silently update a child row changed after the transaction snapshot. PostgreSQL raises SQLSTATE `40001` for the attempted write.

## Invalidation Reason

Line-level verification:

1. `FinalizeExamAnswersUseCase.execute` reads `loadedSession` once inside the outer write transaction (`src/application/use-cases/finalize-exam-answers.ts:118-122`) and then iterates `activeSession.questionStates` (`src/application/use-cases/finalize-exam-answers.ts:178-245`).
2. `finalizeDraftAnswer` ignores `current.draftSelectedChoiceId` and overwrites state from caller-supplied `outcome` / `isCorrect` (`src/adapters/repositories/drizzle-practice-session-repository.ts:420-445`).
3. However, the repository write is executed through `updatePracticeSessionQuestionState`, whose nested transaction is a savepoint under the outer `REPEATABLE READ` transaction. It reads the old row version from the fixed snapshot and then tries to update that same stale version (`src/adapters/repositories/practice-session-question-state-updater.ts:151-189`).
4. PostgreSQL's `REPEATABLE READ` semantics make that stale write fail with `40001` if another transaction committed a change to the target row after the snapshot started. That means the failure mode is a raw serialization failure, not silent answer loss.

The exact concurrent-draft-save race described here is therefore a useful reachable trigger for [BUG-268](../../bugs/bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md), not an independent active data-loss bug.

## Residual Note

If the BUG-267 repeatable-read transaction-boundary fix were reverted, this stale-decision path would become dangerous again under `READ COMMITTED`: the nested state read would see the newer row version, `finalizeDraftAnswer` would still decide from the older closure-captured outcome, and the CAS update could then silently clobber the draft. Do not remove the repeatable-read boundary without adding a separate row-fresh decision path.

## Verification

Re-opened and traced:

- `lib/container/use-cases.ts:35-59, 192-206`
- `src/application/use-cases/finalize-exam-answers.ts:118-245`
- `src/adapters/repositories/drizzle-practice-session-repository.ts:420-445`
- `src/adapters/repositories/practice-session-question-state-updater.ts:151-189`

Conclusion: invalidated as a standalone active bug; fold the concurrency coverage into BUG-268's transaction-boundary serialization-failure fix.
