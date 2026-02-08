# DEBT-177: Duplicated Question Flow Logic Across Practice Modules

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

Question-flow orchestration logic was duplicated across practice route logic modules, creating drift risk and higher maintenance cost:

1. `app/(app)/app/practice/practice-page-logic.ts`
2. `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`

Duplicated patterns include:

- request-sequenced load-next-question action creation
- submit-answer orchestration and error-state handling
- transition-wrapper boilerplate for async load actions
- repeated elapsed-seconds normalization for answer submission

Evidence:

- Near-equivalent load/submit implementations existed in both route logic files.
- Hook-level orchestration already consumed these route logic helpers, so consolidating the route logic removed the primary drift point.

## Impact

- Changes to core question flow require multi-file edits
- Higher risk of behavior drift between `/app/practice` and `/app/practice/[sessionId]`
- Slower implementation of SPEC-019/SPEC-020 follow-up work

## Resolution

1. Extracted shared question-flow core utilities in `app/(app)/app/practice/shared/question-flow-actions.ts`.
2. Keep route-specific concerns as thin wrappers around shared core contracts.
3. Preserved existing hook contracts while removing duplicated orchestration branches from both route logic modules.

## Verification

- [x] Shared question-flow core introduced with focused tests (`question-flow-actions.test.ts`)
- [x] Route-specific wrappers preserve current behavior
- [x] Duplicate load/submit orchestration branches removed from both practice route logic modules
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `app/(app)/app/practice/shared/question-flow-actions.ts`
- `app/(app)/app/practice/practice-page-logic.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`
- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
