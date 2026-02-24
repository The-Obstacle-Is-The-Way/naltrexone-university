# DEBT-246: Targeted E2E Coverage Gaps and Visual/CSS Testing Layer Policy

**Status:** Resolved  
**Priority:** P3  
**Date:** 2026-02-24  
**Resolved:** 2026-02-24  
**Owner:** Test Infrastructure  
**Related:** DEBT-245 (resolved)

---

## Description

DEBT-245 correctly removed audit-heavy E2E specs that were asserting CSS/design tokens in Playwright. The current gap is narrower than originally documented: most functionality is still covered by unit/component/browser tests, but a few targeted regressions are not explicitly owned.

This debt tracks those real gaps and defines where visual/CSS checks must live going forward.

## Verified Current State (Fact Check)

### Already covered (not active gaps)

- **Score denominator accuracy** is covered in use-case tests:
  - `src/application/use-cases/get-session-history.test.ts`
  - `src/application/use-cases/end-practice-session.test.ts`
- **Action bar ordering + disabled boundary states** are covered in component tests:
  - `app/(app)/app/practice/components/practice-view.test.tsx`
  - `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
- **Quick Practice is not zero-covered in E2E**:
  - `tests/e2e/helpers/bookmark.ts` drives `/app/practice/quick` in live flows.
  - Called by `tests/e2e/bookmarks.spec.ts`, `tests/e2e/core-app-pages.spec.ts`, `tests/e2e/cross-page-navigation.spec.ts`, `tests/e2e/subscribe-and-practice.spec.ts`.

### Real remaining gaps

1. **No dedicated Quick Practice E2E journey assertion for submit-feedback flow**  
   Quick Practice is exercised indirectly for bookmark seeding, but there is no direct Playwright assertion for question submit + feedback behavior on `/app/practice/quick`.

2. **No explicit E2E assertion for exam-mode “Mark for review” control**  
   Coverage exists in component/browser tests, but the main exam journey E2E test does not assert the control is present.

3. **No explicit regression test for choice-label parity between choice list and feedback explanations**  
   This remains the key desync risk from prior audits.

---

## Required Backfill (Definitive)

1. **Add dedicated Quick Practice E2E smoke**
- File: `tests/e2e/practice.spec.ts`
- Add one test that:
  - navigates to `/app/practice/quick?status=unanswered`
  - verifies question content is visible
  - submits one answer
  - verifies feedback is rendered (`Correct`/`Incorrect`)

2. **Add explicit exam-mode “Mark for review” assertion in existing exam E2E flow**
- File: `tests/e2e/practice.spec.ts`
- In `exam mode completes session without showing explanation`, assert:
  - `page.getByRole('button', { name: 'Mark for review' })` is visible before “Review answers”.

3. **Add choice-label parity component regression**
- File: `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
- Add one render test with non-empty `choiceExplanations` that asserts:
  - displayed letter labels in feedback map to the same choice IDs as displayed answer options.

---

## Visual/CSS Policy (SSOT)

### What must not be added back to E2E

- No Playwright audits that assert Tailwind class tokens (`hover:*`, `focus-visible:*`, etc.).
- No Playwright tests that exist only to inspect static design-system styling.

### Correct layer mapping

| Concern | Layer | Tool |
|---|---|---|
| Semantic structure (`role`, `aria-*`, link vs button semantics) | Component/unit | Vitest + `renderToStaticMarkup` |
| Token/class contract assertions | Component/unit | Vitest + `renderToStaticMarkup` |
| Dynamic interaction styling (hover/focus behavior) | Browser component test | `vitest-browser-react` |
| Global CSS variable contracts and contrast math | Unit | Vitest + source parsing/math |
| Full user journeys (auth, start session, submit, navigation) | E2E | Playwright |

---

## Verification

- [x] `tests/e2e/practice.spec.ts` includes a dedicated Quick Practice submit-feedback journey (`quick practice submit shows correctness feedback`).
- [x] `tests/e2e/practice.spec.ts` exam flow asserts “Mark for review” visibility.
- [x] `app/(app)/app/questions/[slug]/question-page-client.test.tsx` includes choice-label parity regression (`renders feedback labels and explanation text with matching question choice ids`).
- [x] No new Playwright specs assert CSS class tokens.
- [x] `pnpm test --run`, `pnpm test:e2e`, `pnpm typecheck`, and `pnpm lint` pass.

## Related

- [DEBT-245](./debt-245-e2e-pyramid-drift-and-skip-governance.md)
- [DEBT-244](./debt-244-test-reliability-schema-and-state-drift.md)
