# BUG-230: Post-Exam Review Retry Race Can Reapply Stale Error or Stale Success

**Status:** Resolved
**Priority:** P3
**Date:** 2026-03-21
**Confirmed:** 2026-03-21
**Resolved:** 2026-03-21 — [PR #246](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/246)

## Summary

`usePracticeSessionReviewStage()` loads post-exam review data through `loadPostExamReview(...)`, but that path has no request-sequencing guard and no in-flight semaphore.

After an exam is finalized, if post-exam review loading fails and the user clicks `Retry review` multiple times under slow or unstable network conditions, multiple concurrent review loads can race. Because the hook checks only `isMounted()`, whichever request settles last wins, even if it was started earlier.

Result:

- a stale late failure can overwrite a successful retry and put the page back into error state
- a stale late success can overwrite a newer failure with outdated review data

This is the same stale-async-commit family previously fixed in:

- BUG-190 (`useHistorySessions` request sequencing)
- BUG-196 (`usePracticeSessionReviewStageState` load semaphore)

## Steps to Reproduce

1. Finalize an exam so the app enters the post-exam review loading path.
2. Make the first `getCompletedSessionQuestionsWithFeedback` attempt fail.
3. While the error state is shown, click `Retry review` twice quickly on a slow network.
4. Let request B resolve successfully first, then let request A reject afterward.
5. Observe the UI flip from successful post-exam review back to an error state, even though the latest retry already succeeded.

The inverse ordering is also possible: an older successful response can overwrite the newest error state.

## Root Cause

Tracer-bullet path:

1. `loadPostExamReview(...)` in `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` starts an async fetch and commits results directly into `postExamReview`, `postExamReviewCurrentQuestionId`, and `postExamReviewLoadState`.
2. That function has no request token (`requestId`) and no semaphore (`isLoading...Ref`).
3. `onRetryPostExamReview` calls `void loadPostExamReview(pendingExamSummary)`, so repeated retry clicks can launch overlapping calls.
4. The only commit guard inside `loadPostExamReview(...)` is `input.isMounted()`, which does not distinguish newer requests from older ones.
5. By contrast, adjacent audited paths already use the correct patterns:
   - `app/(app)/app/history/hooks/use-history-sessions.ts` uses `latestRequestId`
   - `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts` uses `isLoadingReviewRef`

## Expected Behavior

- only the latest post-exam review load should be allowed to commit state
- repeated retry clicks should not let stale responses overwrite newer results
- the retry surface should behave deterministically under slow or failing network conditions

## Recommended Fix

Add a stale-request guard to `loadPostExamReview(...)`.

Good implementation options:

1. Add a monotonic `latestPostExamReviewRequestId` ref and ignore any result whose request id is not current.
2. Optionally also add an in-flight semaphore or disable the retry button while loading as defense in depth.

The request-id guard is the more important correctness fix because it protects against out-of-order settlement, not just duplicate clicks.

Current branch verification implements option 1: `loadPostExamReview(...)` now increments a monotonic `latestPostExamReviewRequestIdRef` before the async call and returns early from every post-await state commit when the request id is stale.

## Verification

- [x] Browser-spec regression test where retry request B succeeds before stale request A fails, and the hook remains in `ready`
- [x] Browser-spec regression test where stale request A succeeds after newer request B fails, and the hook preserves the latest `error` state
- [x] BUG-230 fix verified on branch: `loadPostExamReview(...)` now uses `latestPostExamReviewRequestIdRef` to drop stale thrown-error and result-commit paths
- [x] Full branch verification passed on 2026-03-21: `pnpm test:browser`, `pnpm typecheck`, `pnpm lint`, `pnpm test --run`
- [ ] Manual verification under throttled network

## Related

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.browser.spec.tsx`
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
- `docs/_archive/bugs/bug-190-history-session-reopen-race-applies-stale-result.md`
- `docs/_archive/bugs/bug-196-review-stage-load-review-double-call-race.md`
