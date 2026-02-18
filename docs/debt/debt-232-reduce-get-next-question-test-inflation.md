# DEBT-232: Reduce get-next-question.test.ts Test Inflation

**Status:** Open
**Priority:** P3
**Date:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `src/application/use-cases/get-next-question.test.ts`

---

## Description

`get-next-question.test.ts` is **1,020 lines** with only **24 tests** — an average of **42 lines per test**. The file is inflated by:

1. **Inline test data** — question/choice/session objects constructed from scratch in nearly every test with slight variations
2. **Repeated repository instantiation** — `new FakeQuestionRepository([...])`, `new FakeAttemptRepository([])`, `new FakePracticeSessionRepository([...])` copied across 15+ tests
3. **No parametrization** — similar scenarios (e.g., "returns next unanswered question") have 3+ near-identical test bodies instead of using `describe.each()` or `it.each()`

**Disposition:** Test file over-inflated with inline test data and limited parametrization.

## Impact

- 42 lines/test is 2x the healthy ratio for use case tests
- Adding a new scenario requires copy-pasting 30+ lines of setup
- Hard to see what's actually being tested vs what's boilerplate

## Resolution

1. Create `createTestScenario()` builder that accepts overrides for question counts, modes, answered states
2. Extract `createDefaultQuestion()`, `createDefaultSession()` factories with sensible defaults
3. Use `it.each()` / `describe.each()` for parametrized test variants
4. Target: reduce to ~650-700 lines (saving 300-350 lines)

## Verification

- [ ] Test data factories extracted
- [ ] Parametrized tests replace copy-pasted variants
- [ ] All 24 tests still pass: `pnpm test --run`
- [ ] File under 800 lines
- [ ] No test behavior changed (same coverage, same assertions)

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — Parent audit
