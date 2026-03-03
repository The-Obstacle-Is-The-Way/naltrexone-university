# BUG-196: Practice Session Review Stage loadReview Double-Call Race

**Status:** Open
**Priority:** P3
**Date:** 2026-03-03

---

## Description

`loadReview` in `usePracticeSessionReviewStageState` has no concurrency guard. Double-clicking "End session" or clicking "End session" then "Retry" while the first request is in-flight fires two concurrent `loadReview` calls. Both check only `isMounted()`. The slower response can overwrite the faster one's committed state, or call `finalizeSession()` twice for non-exam sessions.

Observed behavior:
- Under slow network, rapid "End session" clicks can produce duplicate `finalizeSession` calls or reset `isInReviewStage` after the user has moved past review.

Expected behavior:
- Only the latest `loadReview` call should commit state. Concurrent calls should be either debounced or sequenced.

## Steps to Reproduce

1. Start a practice session (tutor or exam).
2. Throttle network to slow 3G.
3. Click "End session" twice quickly, or click "End session" then "Retry" before the first resolves.
4. Observe duplicate state transitions or `finalizeSession` firing twice.

## Root Cause

Tracer-bullet path:
1. `loadReview` is defined at [use-practice-session-review-stage-state.ts:50-97](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:50) — no semaphore, no request-sequence guard.
2. Called from `onEndSession` at line 122 (`void loadReview()`) and `onRetryReview` at line 129 (`void loadReview()`).
3. Both callers fire-and-forget with `void` — no way to prevent concurrent calls.
4. For non-exam mode (line 77-83), `loadReview` calls `input.finalizeSession()` — duplicate calls fire this twice.
5. Contrast with `usePracticeSessionMarkForReview` which uses `isMarkingRef.current` as a semaphore — the correct pattern exists in the same codebase.

## Fix

Not yet implemented.

Expected fix shape:
- Add a ref-based semaphore (e.g., `isLoadingReviewRef.current`) checked at entry and set before the async call. Reset in `finally`.
- Or: track a monotonic request counter and discard stale responses.
- The `isMarkingRef` pattern in `usePracticeSessionMarkForReview` is the reference implementation.

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification
- [x] Code-level tracer-bullet verified (Audit #12, 2026-03-03)

## Related

- BUG-189 and BUG-194 cover the same class of missing concurrency guards in other hooks.
- `usePracticeSessionMarkForReview` has the correct semaphore pattern.
