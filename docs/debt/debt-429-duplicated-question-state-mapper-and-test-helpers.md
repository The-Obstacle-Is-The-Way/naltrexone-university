# DEBT-429: Duplicated question-state mapper and test helpers across practice-session-question-state files

**Status:** Open
**Priority:** P4
**Date:** 2026-06-30

---

## Description

`toDomainQuestionState` (row → domain mapping for `practice_session_question_states`) is duplicated byte-for-byte between `practice-session-question-state-updater.ts` (lines 24-37) and `drizzle-practice-session-repository.ts` (lines 64-77). Test helper duplication is also real but uneven: `StateRow` is duplicated across `drizzle-practice-session-repository-question-state.test.ts`, `-reads.test.ts`, and `-session-writes.test.ts`; `createStateRow()` is duplicated across those three files plus `practice-session-question-state-updater-lock.test.ts`; and `collectColumnNames` / `collectPrimitiveValues` are duplicated across `drizzle-practice-session-repository-question-state.test.ts` and `-reads.test.ts`. The three repository tests already import the shared `drizzle-practice-session-repository-test-helpers.ts` module for other shared concerns, while the lock test does not.

## Impact

A future column addition/rename on `practice_session_question_states` requires editing the mapper in two places and the test fixture/helper shape in up to four places independently, with no compiler signal tying the copies together — one already shows drift (the lock test's fixture omits several fields and reorders ID generation relative to the others).

## Resolution

Export the single mapper function from one location and import it in the other. Move `StateRow`/`createStateRow`/`collectColumnNames`/`collectPrimitiveValues` into the existing shared test-helpers module.

## Verification

After consolidation, grep confirms a single definition of each; existing test suites stay green.

## Related

- PR #537, [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md)
- `src/adapters/repositories/practice-session-question-state-updater.ts:24-37`
- `src/adapters/repositories/drizzle-practice-session-repository.ts:64-77`
