# DEBT-429: Duplicated question-state mapper and test helpers across practice-session-question-state files

**Status:** Resolved
**Priority:** P4
**Date:** 2026-06-30

---

## Description

`toDomainQuestionState` (row → domain mapping for `practice_session_question_states`) is duplicated byte-for-byte between `practice-session-question-state-updater.ts` (lines 24-37) and `drizzle-practice-session-repository.ts` (lines 64-77). Test helper duplication is also real but uneven: `StateRow` is duplicated across `drizzle-practice-session-repository-question-state.test.ts`, `-reads.test.ts`, and `-session-writes.test.ts`; `createStateRow()` is duplicated across those three files plus `practice-session-question-state-updater-lock.test.ts`; and `collectColumnNames` / `collectPrimitiveValues` are duplicated across `drizzle-practice-session-repository-question-state.test.ts` and `-reads.test.ts`. The three repository tests already import the shared `drizzle-practice-session-repository-test-helpers.ts` module for other shared concerns, while the lock test does not.

**Re-verified inventory (2026-07-04, after PRs #554-#556 rewrote this surface):**

- Mapper duplication still real, shape changed: the updater's standalone `toDomainQuestionState` is now at `practice-session-question-state-updater.ts:23-36`, and the repository's copy is now a **private method** at `drizzle-practice-session-repository.ts:64-77` — identical body, different declaration form, still no compiler signal tying them together.
- `StateRow` + `createStateRow`: still duplicated across all four test files named above; the three repository tests import the shared helpers module while the lock test still does not.
- `collectColumnNames` / `collectPrimitiveValues`: the originally-named duplication (question-state + reads tests) was **resolved in the interim** — the canonical copy now lives in `drizzle-practice-session-repository-test-helpers.ts:8` and both tests import it. However, two **new** copies have since appeared outside the practice-session family: `drizzle-idempotency-key-repository.test.ts:11` and `drizzle-question-repository.test.ts:43`. Consolidating those may warrant promoting the two functions to a neutral shared test-helper location rather than importing practice-session repository helpers into unrelated repository tests.

## Impact

A future column addition/rename on `practice_session_question_states` requires editing the mapper in two places and the test fixture/helper shape in up to four places independently, with no compiler signal tying the copies together — one already shows drift (the lock test's fixture omits several fields and reorders ID generation relative to the others).

## Resolution

Resolved in the debt-register clear-out branch:

- `toDomainQuestionState` is exported from `practice-session-question-state-updater.ts`, the module that owns state-row writes and already maps updated rows back to domain state. `drizzle-practice-session-repository.ts` imports that mapper and no longer keeps a private copy.
- `StateRow` and `createStateRow()` now live in `drizzle-practice-session-repository-test-helpers.ts`. The shared factory emits the full strict row shape, and tests that create state rows now pass `practiceSessionId` explicitly instead of relying on file-local hidden defaults.
- Generic Drizzle predicate inspection helpers moved to neutral `repository-test-helpers.ts`. Practice-session tests continue to get `collectColumnNames` / `collectPrimitiveValues` through their family helper, while idempotency and question repository tests import `collectColumnNamesForTable` from the neutral helper instead of carrying local copies.

## Verification

Consolidation proof:

```bash
rg -n "function toDomainQuestionState|private toDomainQuestionState|function createStateRow|type StateRow|function collectColumnNames|function collectPrimitiveValues|function collectColumnNamesForTable" src/adapters/repositories
```

Result: one definition each for `toDomainQuestionState`, `StateRow`, `createStateRow`, `collectColumnNames`, `collectPrimitiveValues`, and `collectColumnNamesForTable`.

Behavior proof:

- `pnpm exec tsc --noEmit --pretty false` passed after the consolidation.
- `pnpm test --run src/adapters/repositories/drizzle-practice-session-repository-question-state.test.ts src/adapters/repositories/drizzle-practice-session-repository-reads.test.ts src/adapters/repositories/drizzle-practice-session-repository-session-writes.test.ts src/adapters/repositories/practice-session-question-state-updater-lock.test.ts src/adapters/repositories/drizzle-idempotency-key-repository.test.ts src/adapters/repositories/drizzle-question-repository.test.ts` passed: 6 files, 70 tests.

## Related

- PR #537, [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md)
- `src/adapters/repositories/practice-session-question-state-updater.ts:23-36`
- `src/adapters/repositories/drizzle-practice-session-repository.ts:64-77`
- `src/adapters/repositories/drizzle-idempotency-key-repository.test.ts:11`, `src/adapters/repositories/drizzle-question-repository.test.ts:43` (new `collectColumnNames`/`collectPrimitiveValues` copies, 2026-07-04)
