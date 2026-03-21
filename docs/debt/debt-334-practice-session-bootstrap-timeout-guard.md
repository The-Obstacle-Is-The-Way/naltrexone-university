# DEBT-334: Practice Session Bootstrap Summary Bypasses Client Timeout Guard

**Priority:** P3
**Created:** 2026-03-21
**Source:** Repo-wide async/await audit prompted by DEBT-333 / PR #244
**Related:** [DEBT-333](./debt-333-browser-test-flakiness-audit.md), [use-practice-session-page-controller.ts](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts), [with-timeout.ts](../../lib/with-timeout.ts), [timeout-tiers](../../app/(app)/app/shared/timeout-tiers.ts)

---

## Problem

`usePracticeSessionPageController()` bootstraps the session page by calling `getPracticeSessionSummary({ sessionId })` inside a fire-and-forget promise chain:

```ts
void getPracticeSessionSummary({ sessionId })
  .then(...)
  .catch(...);
```

That promise is not unhandled, so this is **not** the same bug family as raw floating rejections. The gap is narrower:

- the bootstrap read does **not** use `withTimeout(...)`
- the hook sets `loadState` to `loading` before the call starts
- `shouldRetryBootstrap` only flips to `true` when the promise resolves with an error result or rejects
- a hung request therefore leaves the page pinned in `loading` indefinitely with no retry affordance

Every comparable client-side controller read audited in this sweep already applies a timeout boundary before mutating UI state:

- `useQuestionPageBookmarks()` wraps `getBookmarks()` with `withTimeout(...)`
- `useQuestionPageSessionNavigation()` wraps `getPracticeSessionReview()` with `withTimeout(...)`
- `useHistorySessions()` wraps `getPracticeSessionReview()` with `withTimeout(...)`
- `usePracticeSessionReviewStageState()` wraps `getPracticeSessionReviewFn(...)` with `withTimeout(...)`
- `usePracticeSessionReviewStage()` wraps `getCompletedSessionQuestionsWithFeedbackFn(...)` with `withTimeout(...)`

This makes the bootstrap summary path the outlier in the current production audit.

## Verified Current Behavior

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` is the only audited client controller read in this family that bypasses `withTimeout(...)`
- stale-result protection already exists via `bootstrapRequestIdRef`, so late resolution is handled correctly
- rejection handling already exists via `.catch(...)`, so unhandled rejection leakage is **not** the issue
- the missing guard is specifically a settlement bound for the initial summary bootstrap
- the existing browser spec already demonstrates that the page waits on the unresolved bootstrap promise before it loads questions:
  - `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`
  - test: `loads active session questions only after summary bootstrap reports an active session`
  - current coverage proves sequencing, but does not prove timeout fallback

## Expected Behavior

- initial summary bootstrap should use the same read-timeout policy as adjacent client fetches
- when the bootstrap read times out, the hook should:
  - report the error
  - transition `loadState` to `error`
  - set `shouldRetryBootstrap` so `Try again` retries the bootstrap path instead of the question loader
- stale-request invalidation must remain intact so earlier bootstrap attempts cannot overwrite newer state

## Scope

- **Production file:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`
- **Likely fix shape:** wrap `getPracticeSessionSummary({ sessionId })` in `withTimeout(..., STANDARD_READ_TIMEOUT_MS)` or a local bootstrap-specific read timeout constant
- **Tests:** extend `use-practice-session-page-controller.browser.spec.tsx`
  - add explicit coverage for timeout/error fallback on bootstrap
  - preserve current sequencing coverage for active-session bootstrap vs question load

## Notes

- This debt came out of the async/await audit, but it is **not** evidence of a broader unawaited-promise problem in the codebase
- The repo's main async patterns are already well-defended: stale-request guards, `isMounted()` checks, `fireAndForget()`, and timeout-wrapped controller reads
- The reason to track this separately is that the bootstrap path is a real exception to that otherwise consistent pattern
