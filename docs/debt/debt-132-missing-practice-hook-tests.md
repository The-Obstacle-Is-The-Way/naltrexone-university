# DEBT-132: Missing Tests for 6 Extracted Practice Hooks (SPEC-020 Phase 1)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06

---

## Description

SPEC-020 Phase 1 extracted 6 custom hooks from the god components. These hooks orchestrate complex UI state, async side effects, and server action integration. None have unit tests.

## Impact

- Hooks contain significant business coordination logic (state machines, async flows, error handling)
- Refactoring these hooks risks regressions without test coverage
- SPEC-020 acceptance criteria requires "Each extracted hook has independent unit tests"

## Affected Files

| Hook | File | Lines | Purpose |
|------|------|-------|---------|
| `usePracticeQuestionFlow` | `app/(app)/app/practice/hooks/use-practice-question-flow.ts` | 191 | Question loading, bookmarks, submit |
| `usePracticeSessionControls` | `app/(app)/app/practice/hooks/use-practice-session-controls.ts` | ~220 | Session start, filters, tags, history |
| `usePracticeSessionHistory` | `app/(app)/app/practice/hooks/use-practice-session-history.ts` | ~100 | Session history loading + drill-down |
| `usePracticeSessionMarkForReview` | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts` | 101 | Mark-for-review toggle |
| `usePracticeSessionPageController` | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` | 281 | Full session page orchestration |
| `usePracticeSessionReviewStage` | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` | ~200 | Exam review stage + summary |

## Resolution

Add tests for each hook. Since these hooks call server actions, tests should mock the server actions and verify state transitions.

Note: The extracted *logic functions* in `practice-page-logic.ts` and `practice-session-page-logic.ts` already have tests. The hooks primarily wire these functions together — tests should verify the wiring is correct.

## Verification

- [ ] Each hook has a `.test.ts` file
- [ ] Tests verify state initialization and transitions
- [ ] Tests verify async operation handling (loading, error, success)
- [ ] All using `renderToStaticMarkup` pattern for any TSX tests

## Related

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 1 acceptance criteria
- `app/(app)/app/practice/practice-page-logic.test.ts` — Logic function tests
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` — Session logic tests
