# DEBT-272: Fakes Test God File Split

**Status:** Resolved (2026-03-03)
**Priority:** P3
**Date:** 2026-03-03
**Owner:** Testing
**Related:** DEBT-270

---

## Summary

This debt tracked the single 1,383-line `src/application/test-helpers/fakes.test.ts`
god file (12 top-level fake suites, 64 tests). It has now been split into
colocated per-fake test files, and the original god file has been deleted.

## Resolution implemented

Deleted:
- `src/application/test-helpers/fakes.test.ts`

Added:
- `src/application/test-helpers/fakes/fake-attempt-repository.test.ts`
- `src/application/test-helpers/fakes/fake-auth-gateway.test.ts`
- `src/application/test-helpers/fakes/fake-bookmark-repository.test.ts`
- `src/application/test-helpers/fakes/fake-logger.test.ts`
- `src/application/test-helpers/fakes/fake-payment-gateway.test.ts`
- `src/application/test-helpers/fakes/fake-practice-session-repository.test.ts`
- `src/application/test-helpers/fakes/fake-question-repository.test.ts`
- `src/application/test-helpers/fakes/fake-stripe-customer-repository.test.ts`
- `src/application/test-helpers/fakes/fake-stripe-event-repository.test.ts`
- `src/application/test-helpers/fakes/fake-subscription-repository.test.ts`
- `src/application/test-helpers/fakes/fake-tag-repository.test.ts`
- `src/application/test-helpers/fakes/fake-user-repository.test.ts`

## Why this is debt

1. **Navigation:** Finding the test for `FakeBookmarkRepository` requires scrolling past 600+ lines of unrelated fake tests.
2. **Colocation mismatch:** The fakes themselves are already properly split into individual files under `src/application/test-helpers/fakes/` (e.g., `fake-user-repository.ts`, `fake-attempt-repository.ts`). The test file doesn't match this structure.
3. **Diff noise:** Any change to one fake's test creates a diff in a file that covers 12 other fakes.

## Post-resolution verification (2026-03-03)

- `pnpm test --run src/application/test-helpers/fakes/*.test.ts`
  - Passed (`68` tests total including existing `fake-use-cases.test.ts`).
- `pnpm test --run`
  - Passed (`1785` tests).
- `pnpm lint`
  - Passed.

## Acceptance criteria

- [x] 12 colocated fake test files created
- [x] Original `fakes.test.ts` deleted
- [x] All previous fake-repository assertions preserved
- [x] `pnpm test --run` passes
- [x] No cross-suite behavior changes (pure test-file reorganization)

## Risk

Negligible. Behavior is unchanged; only test organization was refactored.
