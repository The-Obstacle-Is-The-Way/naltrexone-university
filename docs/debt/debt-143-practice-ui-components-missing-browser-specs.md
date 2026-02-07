# DEBT-143: Practice UI Components Missing Browser Specs

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07
**Related:** DEBT-141 (hook migration), SPEC-020 (practice engine completion)

---

## Description

The practice feature is the most complex interactive area of the application, yet its 7 UI components have zero test coverage. These components render the primary user-facing experience — session setup, question answering, exam review, session summary, and session history.

The logic layer underneath IS tested (`practice-page-logic.ts`, `practice-session-page-logic.ts` both have unit tests, and all 15 use cases are fully covered). The gap is at the component/view layer where that logic connects to what users actually see and interact with.

This pairs naturally with DEBT-141 (hook test migration to Browser Mode). When writing `*.browser.spec.tsx` files for the hooks, the components should be tested in the same pass since the hooks drive the components.

## Untested Practice Components

### Practice Landing Page (`app/(app)/app/practice/components/`)

| Component | Responsibility | Priority |
|-----------|---------------|----------|
| `practice-session-starter.tsx` | Tag/difficulty filters, session mode toggle, question count, start button | High — primary entry point |
| `practice-view.tsx` | Orchestrates starter + incomplete session + history | High — page-level composition |
| `incomplete-session-card.tsx` | Resume/abandon incomplete session prompt | Medium |
| `practice-session-history-panel.tsx` | Completed session list with drill-down | Medium |

### Active Session Page (`app/(app)/app/practice/[sessionId]/components/`)

| Component | Responsibility | Priority |
|-----------|---------------|----------|
| `practice-session-page-view.tsx` | Question display, choice selection, navigation, submit | High — core answering experience |
| `exam-review-view.tsx` | Exam mode review grid before final submission | High — exam-only flow |
| `session-summary-view.tsx` | Post-session results with per-question breakdown | High — completion screen |

### Untested Client Wiring

| File | Responsibility |
|------|---------------|
| `app/(app)/app/practice/client-navigation.ts` | Client-side router wrapper |
| `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` | Client-side session page shell |
| `app/(app)/app/practice/[sessionId]/practice-session-page-utils.ts` | Session page utility functions |

## Impact

- The most important user feature has the lowest UI test coverage (31% overall, 0% for components)
- Regressions in component rendering, conditional logic, or prop wiring go undetected
- Component behavior can only be verified through slow E2E tests or manual QA
- New feature work on the practice engine (SPEC-020 phases) risks breaking existing UI without fast feedback

## Resolution

1. Write `*.browser.spec.tsx` files alongside DEBT-141 hook migration
2. Use `vitest-browser-react`'s `render` to mount components with controlled props
3. Test user-visible behavior: rendered content, conditional sections, interaction callbacks
4. For components that depend on hooks, test the hook+component together in browser mode
5. Follow the existing pattern from `ChoiceButton.browser.spec.tsx` and `QuestionCard.browser.spec.tsx`

### Suggested test priorities (do these first):
1. `practice-session-page-view.tsx` — core answering loop
2. `practice-session-starter.tsx` — session setup entry point
3. `session-summary-view.tsx` — completion screen
4. `exam-review-view.tsx` — exam-only review flow

## Verification

- [ ] All 7 practice components have `*.browser.spec.tsx` files
- [ ] `pnpm test:browser` passes with new specs
- [ ] Each spec tests user-visible behavior (not implementation details)
- [ ] `pnpm typecheck` and `pnpm test --run` still pass

## Related

- DEBT-141 — Hook test migration to Browser Mode (do together)
- SPEC-020 — Practice Engine Completion (components support this feature)
- `docs/dev/react-vitest-testing.md` — Testing strategy and harness documentation
- `components/question/ChoiceButton.browser.spec.tsx` — Reference pattern
- `components/question/QuestionCard.browser.spec.tsx` — Reference pattern
