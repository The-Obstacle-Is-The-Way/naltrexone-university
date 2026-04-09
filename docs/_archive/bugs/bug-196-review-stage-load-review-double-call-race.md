# BUG-196: Practice Session Review Stage loadReview Double-Call Race

**Status:** Fixed
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
1. `loadReview` is defined at [use-practice-session-review-stage-state.ts:50-97](../../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts#L50) — no semaphore, no request-sequence guard.
2. Called from `onEndSession` at line 122 (`void loadReview()`) and `onRetryReview` at line 129 (`void loadReview()`).
3. Both callers fire-and-forget with `void` — no way to prevent concurrent calls.
4. For non-exam mode (line 77-83), `loadReview` calls `input.finalizeSession()` — duplicate calls fire this twice.
5. Contrast with `usePracticeSessionMarkForReview` which uses `isMarkingRef.current` as a semaphore — the correct pattern exists in the same codebase.

## Fix

Implemented in `usePracticeSessionReviewStageState`:
- Added `isLoadingReviewRef` as a load semaphore.
- `loadReview` now exits early when a review load is already in flight.
- The semaphore is set before async work and reset in a `finally` block.
- This prevents duplicate concurrent `loadReview` calls and duplicate `finalizeSession()` calls from rapid user input.

## Verification

- [x] Unit test added — browser spec `use-practice-session-review-stage-state.browser.spec.tsx` verifies rapid end/retry only triggers one review-load/finalize path.
- [ ] Integration test added
- [ ] Manual verification
- [x] Code-level tracer-bullet verified (Audit #12, 2026-03-03)

## Related

- BUG-189 and BUG-194 cover the same class of missing concurrency guards in other hooks.
- `usePracticeSessionMarkForReview` has the correct semaphore pattern.
