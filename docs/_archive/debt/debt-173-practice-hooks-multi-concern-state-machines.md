# DEBT-173: Practice Hooks Are Multi-Concern State Machines

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

Four practice hooks had grown into large, multi-concern state machines:

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
   - Extracted question flow/load orchestration into `use-practice-session-question-flow.ts`
   - Extracted bookmark state/actions into shared `use-practice-question-bookmarks.ts`
   - Kept top-level hook as composition root for review-stage + mark-for-review bridges
2. `use-practice-session-controls`:
   - Extracted session start/filter concerns into `use-practice-session-start.ts`
   - Extracted tag loading into `use-practice-session-tags.ts`
   - Extracted incomplete-session lifecycle into `use-practice-incomplete-session.ts`
3. `use-practice-question-flow`:
   - Extracted answer-flow concern into `use-practice-question-answer-flow.ts`
   - Extracted bookmark concern into shared `use-practice-question-bookmarks.ts`
4. `use-practice-session-review-stage`:
   - Extracted summary review loading into `use-practice-session-summary-review.ts`
   - Extracted navigator loading into `use-practice-session-navigator.ts`
5. Reduced top-level hook complexity while preserving existing public contracts and behavior.

## Verification

- [x] Each extracted hook has a single concern and clear input/output contract
- [x] Existing behavior and tests remain green (`pnpm typecheck && pnpm lint && pnpm test --run`)
- [x] Return contracts are reduced/simplified for each composed hook
- [x] No regression in practice session flows (tutor, exam, review, bookmarks)
- [x] Target hook footprint reduced from 1141 LOC to 456 LOC (`wc -l` across the four original files)

## Related

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
- `app/(app)/app/practice/hooks/use-practice-session-controls.ts`
- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-summary-review.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-navigator.ts`
- `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts`
- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts`
- `app/(app)/app/practice/hooks/use-practice-session-start.ts`
- `app/(app)/app/practice/hooks/use-practice-session-tags.ts`
- `app/(app)/app/practice/hooks/use-practice-incomplete-session.ts`
