# DEBT-232: Reduce get-next-question.test.ts Test Inflation

**Status:** Open
**Priority:** P3
**Date:** 2026-02-18
**Last Verified:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `src/application/use-cases/get-next-question.test.ts`

---

## Description

`get-next-question.test.ts` is **1,020 lines** with **23 declared tests** — an average of **44 lines per test**. The file is inflated by:

1. **Over-specified test data** — the file already imports `createQuestion()`, `createChoice()`, `createPracticeSession()` from `src/domain/test-helpers/`, but nearly every test overrides most factory parameters inline instead of leaning on sensible defaults
2. **Repeated repository instantiation** — `new FakeQuestionRepository([...])`, `new FakeAttemptRepository([])`, `new FakePracticeSessionRepository([...])` appear 23-24 times each (once per test)
3. **No parametrization** — similar scenarios have 3+ near-identical test bodies (e.g., "previousSubmission" tests at lines 395-483, "shuffle order" tests at lines 753-868) that could use `it.each()`

**Disposition:** Test file over-inflated with verbose inline setup and limited parametrization.

## Impact

- 44 lines/test is about 2x the healthy ratio for use case tests
- Adding a new scenario requires copy-pasting 30+ lines of setup
- Hard to see what's actually being tested vs what's boilerplate

## Why This Is Worth Fixing

- **Robustness gain:** reducing inline over-specification makes tests easier to read and less prone to accidental setup inconsistencies.
- **Complexity risk to avoid:** over-parameterization can hide intent; use `it.each` only for truly identical assertion shapes.

## Resolution

1. Create a `createTestScenario()` builder that accepts overrides for question counts, modes, and answered states — wiring the three fake repositories internally so tests only specify what varies
2. Reduce inline factory overrides — lean on existing `createQuestion()` / `createPracticeSession()` defaults instead of re-specifying every field
3. Use `it.each()` for the "previousSubmission" group (~2 tests) and "shuffle order" group (~3 tests) where setup is near-identical
4. Target: reduce to ~650-700 lines (saving 300-350 lines)

Guardrail: keep each test's behavioral assertion explicit; only abstract Arrange boilerplate. Existing domain factories (`createQuestion`, `createChoice`, `createPracticeSession`) are already imported — do not create duplicates.

## Verification

- [ ] Test data factories extracted
- [ ] Parametrized tests replace copy-pasted variants
- [ ] All 23 declared tests still pass: `pnpm test --run`
- [ ] File under 800 lines
- [ ] No test behavior changed (same coverage, same assertions)

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
