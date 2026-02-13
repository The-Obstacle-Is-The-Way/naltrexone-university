# DEBT-213: useEffect Derived-State Sync Anti-Patterns in Practice Hooks

**Status:** Open
**Priority:** P4
**Date:** 2026-02-13

---

## Description

A full audit of all 27 production `useEffect` instances found **5 mild cases** of the "syncing state via useEffect" anti-pattern — the pattern where a `useEffect` watches one piece of state and sets another piece of state in response, creating an unnecessary extra render cycle.

This is the most common React anti-pattern AI coding models produce (see: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), David Khourshid's commentary on state machines vs effect chains). None of these are bugs, and all are covered by existing tests. The remaining 22 `useEffect` instances are textbook legitimate (data fetching, focus management, error logging, timer cleanup, etc.).

### Instance 1: `setIsAnswered` when `submitResult` arrives

**File:** `app/(app)/app/practice/shared/use-question-flow-core.ts:108-111`

```typescript
useEffect(() => {
  if (!submitResult) return;
  setIsAnswered(true);
}, [submitResult]);
```

**Why it's questionable:** `isAnswered` could be set to `true` in the same event handler / action that calls `setSubmitResult`, eliminating the extra render.

**Why it persists:** `isAnswered` has a complex lifecycle — it's also set from session state restoration (line 129) and reset during question loads (lines 115, 122, 142). The effect acts as a catch-all "if we have a result, we're answered" guard across multiple code paths that set `submitResult`.

**Fix:** Move `setIsAnswered(true)` into every action that calls `setSubmitResult(result)`, or derive `isAnswered` as `submitResult !== null || sessionHadPreviousAnswer`.

### Instance 2: Complex state reset/restore on question change

**File:** `app/(app)/app/practice/shared/use-question-flow-core.ts:113-143`

```typescript
useEffect(() => {
  if (loadState.status === 'loading') { setIsAnswered(false); return; }
  if (loadState.status !== 'ready') return;
  if (!question) { setIsAnswered(false); return; }
  // Restore session-selected choice or draft choice
  // ...
}, [loadState.status, question, updateDraftSelectedChoices]);
```

**Why it's questionable:** This orchestrates 3 state variables (`isAnswered`, `selectedChoiceId`, draft map) in response to `loadState`/`question` changes. A `useReducer` would express these state transitions atomically in one render.

**Why it persists:** The practice engine was refactored from god hooks (FE-001/FE-003/FE-004) into composable sub-hooks. The current structure is much better than the original, but the state coordination between `loadState`, `question`, `selectedChoiceId`, and `isAnswered` still uses the "watch-then-set" pattern instead of atomic transitions.

**Fix:** Extract to a `useReducer` where `QUESTION_LOADED`, `QUESTION_LOADING`, and `SUBMIT_RESULT_RECEIVED` actions update all related state atomically.

### Instance 3: Auto-advance after submit in exam mode

**File:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:45-62`

```typescript
useEffect(() => {
  if (reviewStage.isInReviewStage) return;
  maybeAutoAdvanceAfterSubmit({
    mode: questionFlow.sessionMode,
    submitResult: questionFlow.submitResult,
    // ...
    advance: questionFlow.onNextQuestion,
  });
}, [reviewStage.isInReviewStage, questionFlow.sessionMode, questionFlow.submitResult, ...]);
```

**Why it's questionable:** This watches `submitResult` and calls `onNextQuestion` (a navigation action) — the classic "watch-then-act" pattern. The auto-advance could be triggered in the submit action's completion callback instead.

**Why it persists:** The pure logic is extracted to a testable `maybeAutoAdvanceAfterSubmit` function, which mitigates the risk. The effect coordinates state from two different hooks (`questionFlow` and `reviewStage`), making it harder to colocate in the submit handler.

**Fix:** Chain the auto-advance into the submit action's `.then()` callback, passing the review stage check as a parameter.

### Instance 4: Sync `sessionMode` from `sessionInfo`

**File:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:125-128`

```typescript
useEffect(() => {
  if (!sessionInfo?.mode) return;
  setSessionMode(sessionInfo.mode);
}, [sessionInfo?.mode]);
```

**Why it's questionable:** `sessionMode` is derived from `sessionInfo.mode` on first load. This is the "copy props into state" pattern with an effect to keep them synced.

**Why it persists:** `sessionMode` is independently mutable — external code (review stage) can change it via `setSessionMode`. The effect initializes it from server data, then it lives independently. This is intentional "initial value from async data" but the effect means server data always overwrites external changes, which may not be desired.

**Fix:** Initialize `sessionMode` to `null`, set it once when `sessionInfo` first arrives (via a ref guard), and don't re-sync on subsequent `sessionInfo` changes. Or, derive it: `const effectiveMode = sessionMode ?? sessionInfo?.mode ?? null`.

### Instance 5: Reset finalizing ref when `isPending` clears

**File:** `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:97-101`

```typescript
useEffect(() => {
  if (!isPending) {
    isFinalizingRef.current = false;
  }
}, [isPending]);
```

**Why it's questionable:** This watches `isPending` (from `useTransition`) and resets a double-click guard ref. The ref could be reset in the finalize action's completion handler instead.

**Why it persists:** `isPending` comes from `useTransition`, which doesn't provide a completion callback. The finalize action is triggered by `onFinalizeReview()` which is passed in as a prop. The component doesn't have access to the promise chain.

**Fix:** Have `onFinalizeReview` return a Promise, then reset the ref in `.finally()`. Or accept this as pragmatic — it's a 3-line guard on a ref (not state), so it doesn't cause extra renders.

## Impact

- **Zero user-facing bugs** — all 5 instances are functional and tested
- **Minor performance** — each creates one extra render cycle when the watched state changes, but these are infrequent transitions (submit, question load, session start), not hot paths
- **Code clarity** — the "watch-then-set" pattern makes state flow harder to trace compared to explicit action-driven updates or reducers

## Resolution

This is P4 because:
1. All instances are tested and functional
2. Performance impact is negligible (infrequent transitions)
3. The practice hooks were recently refactored from much worse god hooks (DEBT-173/FE-001)
4. Fixing requires either `useReducer` refactoring or restructuring action callbacks

**Recommended approach when touched:**
- If modifying `use-question-flow-core.ts`: extract instances 1-2 into a `useReducer`
- If modifying exam review: accept instance 5 as-is (ref, not state)
- If modifying session question flow: derive `sessionMode` instead of syncing (instance 4)
- If modifying session page controller: chain auto-advance into submit callback (instance 3)

## Verification

- No new `useEffect(() => { setState(...) }, [otherState])` patterns introduced
- Existing tests continue to pass after any refactoring
- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` all green

## Audit Summary

| Category | Count | Verdict |
|----------|-------|---------|
| Data fetching on mount/prop change | 8 | Legitimate |
| Error logging side effects | 2 | Legitimate |
| Focus management (accessibility) | 2 | Legitimate |
| Timer/resource cleanup | 3 | Legitimate |
| One-shot URL param toasts | 2 | Legitimate |
| Hydration guard (next-themes) | 1 | Legitimate |
| Lifecycle tracking (useIsMounted) | 1 | Legitimate |
| Notification from prop change | 1 | Legitimate |
| Ref sync for stable callbacks | 1 | Legitimate |
| Bookmark fetch with retry | 1 | Legitimate |
| **Derived-state sync (this debt)** | **5** | **Minor anti-pattern** |
| **Total** | **27** | **81% clean, 19% minor debt** |

## Related

- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) — React official guide on when NOT to use useEffect
- [David Khourshid on useEffect](https://gitnation.com/contents/using-useeffect-effectively) — talk on using useEffect effectively
- FE-001 / DEBT-173 — Original god hook refactor that created the current structure
- FE-045 — Duplicate question flow hooks extraction (created `use-question-flow-core.ts`)
