# DEBT-232: Reduce get-next-question.test.ts Test Inflation

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-18
**Resolved:** 2026-02-18
**Last Verified:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `src/application/use-cases/get-next-question.test.ts`

---

## Description

`get-next-question.test.ts` was reduced from **1,020 lines** to **757 lines** while retaining **23 passing scenarios** (about **33 lines per test**). The inflation came from:

1. **Over-specified test data** — the file already imports `createQuestion()`, `createChoice()`, `createPracticeSession()` from `src/domain/test-helpers/`, but nearly every test overrides most factory parameters inline instead of leaning on sensible defaults
2. **Repeated repository instantiation** — `new FakeQuestionRepository([...])`, `new FakeAttemptRepository([])`, `new FakePracticeSessionRepository([...])` appear 23-24 times each (once per test)
3. **Limited parametrization** — near-identical previous-submission scenarios were copy-pasted instead of table-driven

**Disposition:** Test file over-inflated with verbose inline setup and limited parametrization.

## Impact

- 44 lines/test is about 2x the healthy ratio for use case tests
- Adding a new scenario requires copy-pasting 30+ lines of setup
- Hard to see what's actually being tested vs what's boilerplate

## Why This Is Worth Fixing

- **Robustness gain:** reducing inline over-specification makes tests easier to read and less prone to accidental setup inconsistencies.
- **Complexity risk to avoid:** over-parameterization can hide intent; use `it.each` only for truly identical assertion shapes.

## Resolution

1. Add a `createTestDeps()` builder inside the test file that wires fake repositories + use case and accepts per-test seeds
2. Reduce inline factory overrides — lean on existing `createQuestion()` / `createPracticeSession()` defaults instead of re-specifying every field
3. Use `it.each()` for the near-identical "previousSubmission" no-submission scenarios; keep shuffle tests separate where assertion shape differs
4. Land under the `<800` cap without changing assertions or behavior

Guardrail: keep each test's behavioral assertion explicit; only abstract Arrange boilerplate. Existing domain factories (`createQuestion`, `createChoice`, `createPracticeSession`) are already imported — do not create duplicates.

## Verification

- [x] Test data factories extracted
- [x] Parametrized tests replace copy-pasted variants
- [x] All 23 declared tests still pass: `pnpm test --run src/application/use-cases/get-next-question.test.ts`
- [x] File under 800 lines (`757`)
- [x] No test behavior changed (same coverage, same assertions)

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
