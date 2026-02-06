# DEBT-124: E2E Question Existence Helper Can Produce False Negatives

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

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

## Resolution

Update `assertQuestionSlugExists()` to distinguish:
- the helper's own explicit "seeded question missing" error, vs
- Playwright timeout waiting for the "not found" banner.

Recommended:
- Use a sentinel error check (or explicit branch) for the helper-thrown error only.
- Treat timeout as "question exists, continue".

---

## Verification

- [ ] Add targeted tests for `tests/e2e/helpers/question.ts`
- [ ] `tests/e2e/core-app-pages.spec.ts` no longer fails at helper when question exists
- [ ] Existing E2E specs still fail correctly when a slug is truly missing

---

## Related

- `tests/e2e/helpers/question.ts`
- `tests/e2e/core-app-pages.spec.ts`
- [DEBT-110](../_archive/debt/debt-110-e2e-helper-anti-patterns.md)
