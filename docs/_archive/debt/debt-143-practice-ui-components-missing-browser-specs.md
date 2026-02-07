# DEBT-143: Practice UI Components Missing Browser Specs

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07
**Resolved:** 2026-02-07
**Related:** DEBT-141 (hook migration), SPEC-020 (practice engine completion)

---

## Description

The practice feature is the most interactive area of the app, but the seven
core practice UI components previously had no Browser Mode coverage.

This is now resolved with dedicated `*.browser.spec.tsx` files that assert
user-visible behavior for all seven components.

## Covered Practice Components

### Practice Landing Page (`app/(app)/app/practice/components/`)

| Component | Responsibility |
|-----------|---------------|
| `practice-session-starter.tsx` | Session mode/count and filter setup |
| `practice-view.tsx` | Main practice interaction surface |
| `incomplete-session-card.tsx` | Resume/abandon incomplete session prompt |
| `practice-session-history-panel.tsx` | Completed session list and drill-down |

### Active Session Page (`app/(app)/app/practice/[sessionId]/components/`)

| Component | Responsibility |
|-----------|---------------|
| `practice-session-page-view.tsx` | Main active-session branch orchestration |
| `exam-review-view.tsx` | Exam review grid before final submit |
| `session-summary-view.tsx` | Post-session summary and breakdown |

## Added Browser Specs

| Spec File | Covered Component |
|-----------|-------------------|
| `app/(app)/app/practice/components/practice-session-starter.browser.spec.tsx` | `practice-session-starter.tsx` |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | `practice-view.tsx` |
| `app/(app)/app/practice/components/incomplete-session-card.browser.spec.tsx` | `incomplete-session-card.tsx` |
| `app/(app)/app/practice/components/practice-session-history-panel.browser.spec.tsx` | `practice-session-history-panel.tsx` |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx` | `practice-session-page-view.tsx` |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx` | `exam-review-view.tsx` |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.browser.spec.tsx` | `session-summary-view.tsx` |

## Verification

- [x] All 7 practice components have `*.browser.spec.tsx` files
- [x] `pnpm test:browser` passes with the added specs
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes

## Related

- DEBT-141 — Hook test migration to Browser Mode
- SPEC-020 — Practice Engine Completion
- `docs/dev/react-vitest-testing.md`
