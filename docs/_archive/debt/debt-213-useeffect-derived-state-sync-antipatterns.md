# DEBT-213: useEffect Derived-State Sync Anti-Patterns in Practice Hooks

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-13
**Resolved:** 2026-02-14

---

## Description

On 2026-02-13, an audit of practice-page hooks found **5 cases** of the "derived state sync via `useEffect`" anti-pattern — a `useEffect` that watches one piece of state and calls a setter for another piece of state (or triggers navigation) in response. This pattern adds an extra render pass and makes state flow harder to trace.

This is one of the most common React anti-patterns AI coding models produce (see: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)). The remaining `useEffect` usage in practice is for legitimate side effects (data fetching, focus management, timer cleanup, etc.).

## Resolution (2026-02-14)

Removed all 5 derived-state sync effects and replaced them with action-driven state transitions:

1. `app/(app)/app/practice/shared/use-question-flow-core.ts`
   - `setSubmitResult()` now also sets `isAnswered=true` when a non-null submit result arrives (no effect watching `submitResult`).
   - `setLoadState()` now synchronizes `selectedChoiceId` + `isAnswered` for ready questions (draft choice vs session-restored choice) using a question ref (no effect watching `loadState`/`question`).

2. `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts`
   - `sessionMode` is set when session info is applied (no effect watching `sessionInfo?.mode`).

3. `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
   - Auto-advance is now chained after `questionFlow.onSubmit()` resolves and is skipped when `reviewStage.isInReviewStage` is true (no effect watching `submitResult` to trigger navigation).

4. `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`
   - The finalize double-click guard resets via the finalize promise’s `.finally()` (no effect watching `isPending`).

## Verification

- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build`
- `pnpm test:browser "app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx"`
- `pnpm test:browser "app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx"`

## Related

- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — React official guide on when NOT to use useEffect
- FE-045 — Duplicate question flow hooks extraction (created `use-question-flow-core.ts`)
