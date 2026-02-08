# DEBT-173: Practice Hooks Are Multi-Concern State Machines

**Status:** Open
**Priority:** P1
**Date:** 2026-02-08

---

## Description

Four practice hooks have grown into large, multi-concern state machines:

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` (305 lines)
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` (304 lines)
- `app/(app)/app/practice/hooks/use-practice-session-controls.ts` (287 lines)
- `app/(app)/app/practice/hooks/use-practice-question-flow.ts` (245 lines)

These hooks currently combine multiple responsibilities in each file (network loading, UI interaction state, idempotency key lifecycle, navigation orchestration, and error handling/retry paths). Example: `use-practice-session-page-controller` contains many local state fields plus a 30+ property return contract (`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:42`, `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:272`).

## Impact

- High change risk in SPEC-019/SPEC-020 follow-up work (small edits can break unrelated behavior)
- Lower readability and slower onboarding for contributors
- Harder to write focused tests because concerns are cross-coupled
- Increased chance of regressions when evolving question flow and review behavior

## Resolution

Split each hook by concern boundary and keep composition at the top-level hook:

1. `use-practice-session-page-controller`:
   - Extract question flow/load orchestration
   - Extract bookmark state/actions
   - Extract review-stage bridge/state handoff
2. `use-practice-session-controls`:
   - Extract tag/filter state
   - Extract session start orchestration
   - Extract incomplete-session handling
3. `use-practice-question-flow`:
   - Mirror the same decomposition pattern as session page controller
4. Keep return types narrow and role-focused (fewer broad "god object" contracts).

## Verification

- [ ] Each extracted hook has a single concern and clear input/output contract
- [ ] Existing behavior and tests remain green (`pnpm typecheck && pnpm lint && pnpm test --run`)
- [ ] Return contracts are reduced/simplified for each composed hook
- [ ] No regression in practice session flows (tutor, exam, review, bookmarks)

## Related

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
- `app/(app)/app/practice/hooks/use-practice-session-controls.ts`
- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
