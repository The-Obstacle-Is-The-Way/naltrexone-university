# DEBT-124: E2E Question Existence Helper Can Produce False Negatives

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

The E2E helper `assertQuestionSlugExists()` can fail even when the seeded question exists.

File:
- `tests/e2e/helpers/question.ts`

Current behavior:
1. It waits up to 2s for `Question not found.` to appear.
2. It throws a custom error if that text appears.
3. It catches errors and rethrows if `error.message.includes('not found')`.

The problem is that Playwright timeout errors include the locator text (`Question not found.`), so valid timeout paths are misclassified as "question missing" and rethrown.

---

## Impact

- Authenticated E2E specs can fail on a false negative before exercising the intended flow.
- Test failures become misleading (looks like seed/content failure, but it is helper logic).
- Reduces trust in E2E signal for regression detection.

---

## Evidence

Reproduced on 2026-02-06 with valid Clerk credentials:

- `subscribe.spec.ts` passes with the provided test user.
- `core-app-pages.spec.ts` fails at `assertQuestionSlugExists()` with timeout at:
  - `tests/e2e/helpers/question.ts:25`

This confirms credential/auth worked and the helper produced the blocking false negative.

---

## Resolution (Implemented)

Updated `tests/e2e/helpers/question.ts` to distinguish explicit helper failures
from Playwright timeout behavior:

- Added `SeededQuestionMissingError` sentinel error class.
- Added `isPlaywrightTimeoutError(error)` helper.
- Added `rethrowIfQuestionMissingCheckError(error)` helper:
  - rethrows only `SeededQuestionMissingError`
  - treats Playwright `TimeoutError` as non-fatal
  - rethrows unexpected errors
- Refactored `assertQuestionSlugExists()` to use these helpers.

---

## Verification

- [x] Added targeted tests: `tests/e2e/helpers/question.test.ts`
- [x] `tests/e2e/core-app-pages.spec.ts` no longer fails at helper false negatives
- [x] Existing helper semantics preserved for true missing-question paths

---

## Related

- `tests/e2e/helpers/question.ts`
- `tests/e2e/helpers/question.test.ts`
- `tests/e2e/core-app-pages.spec.ts`
- [DEBT-110](./debt-110-e2e-helper-anti-patterns.md)
