# BUG-094: Exam Review Error State — Misleading "Try Again" Ends Session

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07

---

## Description

When exam review data fails to load (after answering all questions but before the review screen renders), the error UI shows a "Try again" button that actually calls `onEndSession`, which ends the practice session entirely. The user expects to retry loading the review, but instead their session is terminated.

## Steps to Reproduce

1. Start an exam-mode practice session
2. Answer all questions
3. Simulate a network failure when `getPracticeSessionReview` is called for the review stage
4. Observe the error state — "Try again" button is shown
5. Click "Try again"
6. Session is ended (calls `onEndSession`), not retried

## Root Cause

`app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:68-78`:

```tsx
if (reviewLoadState.status === 'error' && !review) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive shadow-sm">
        {reviewLoadState.message}
      </div>
      <Button type="button" variant="outline" onClick={props.onEndSession}>
        Try again
      </Button>
    </div>
  );
}
```

The button text says "Try again" but the `onClick` handler is `props.onEndSession`, which ends the session and navigates to the summary screen. There is no actual retry mechanism for the review load.

## Impact

- User loses their exam review opportunity — session is ended instead of review being retried
- Semantically misleading — "Try again" implies retry, not termination
- In exam mode, the review stage is where users check their answers before finalizing — losing this is pedagogically significant
- No data corruption — the session is cleanly ended, just prematurely

## Proposed Fix

Either:
1. Wire the button to actually retry the review load (call `getPracticeSessionReview` again), or
2. Rename the button to "End Session" and add a separate "Retry" button that re-triggers the review fetch

Option 1 is preferred — keep "Try again" label but make it retry the review load.

## Verification

- [ ] Error state button retries the review load, not ends the session
- [ ] If retry succeeds, review screen renders correctly
- [ ] If retry fails repeatedly, user still has an option to end the session
- [ ] No regressions in normal exam review flow

## Related

- BUG-090 (error state escape hatch pattern)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
