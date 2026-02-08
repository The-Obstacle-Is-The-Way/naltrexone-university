# DEBT-177: Duplicated Question Flow Logic Across Practice Modules

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

Question-flow orchestration logic is duplicated across multiple practice modules, creating drift risk and higher maintenance cost:

1. `app/(app)/app/practice/practice-page-logic.ts`
2. `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`
3. `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
4. `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`

Duplicated patterns include:

- request-sequenced load-next-question action creation
- submit-answer orchestration and error-state handling
- bookmark toggle orchestration with idempotency keys
- `canSubmitAnswer` / select-choice gating

Evidence:

- Shared orchestration functions exist in `practice-page-logic.ts` and near-equivalent copies in `practice-session-page-logic.ts`
- The two hooks wire identical helper families (`createLoadNextQuestionAction`, `submitAnswerForQuestion`, `toggleBookmarkForQuestion`, `createBookmarksEffect`) with near-identical state slices

## Impact

- Changes to core question flow require multi-file edits
- Higher risk of behavior drift between `/app/practice` and `/app/practice/[sessionId]`
- Slower implementation of SPEC-019/SPEC-020 follow-up work

## Resolution

1. Extract a shared question-flow core for practice routes (load/submit/bookmark orchestration).
2. Keep route-specific concerns as thin wrappers around shared core contracts.
3. Consolidate duplicated state-shape conventions where possible.

## Verification

- [ ] Shared question-flow core introduced with focused tests
- [ ] Route-specific wrappers preserve current behavior
- [ ] Duplicate orchestration branches removed from the four target modules
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `app/(app)/app/practice/practice-page-logic.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`
- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
