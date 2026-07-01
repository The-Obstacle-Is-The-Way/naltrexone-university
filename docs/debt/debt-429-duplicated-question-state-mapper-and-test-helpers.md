# DEBT-429: Duplicated question-state mapper and test helpers across practice-session-question-state files

**Status:** Open
**Priority:** P4
**Date:** 2026-06-30

---

## Description

`toDomainQuestionState` (row → domain mapping for `practice_session_question_states`) is duplicated byte-for-byte between `practice-session-question-state-updater.ts` (lines 24-37) and `drizzle-practice-session-repository.ts` (lines 64-77). The `StateRow` type / `createStateRow()` fixture builder and the `collectColumnNames`/`collectPrimitiveValues` SQL-tree-walking test helpers are each independently duplicated across 3-4 test files (`drizzle-practice-session-repository-question-state.test.ts`, `-reads.test.ts`, `-session-writes.test.ts`, `practice-session-question-state-updater-lock.test.ts`) despite a shared `drizzle-practice-session-repository-test-helpers.ts` module already being imported by all of them for other shared concerns.

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
