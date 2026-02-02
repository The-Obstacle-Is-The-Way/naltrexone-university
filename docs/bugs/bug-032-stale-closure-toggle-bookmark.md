# BUG-032: Stale Closure in onToggleBookmark

## Severity: P2 - Medium

## Summary
The `onToggleBookmark` function captures `question` from the closure. If the question changes (via `loadNext()`) between the initial check and the state updater callback, the wrong question will be bookmarked/unbookmarked.

## Location
- `app/(app)/app/practice/page.tsx:243-263`

## Current Behavior
```typescript
async function onToggleBookmark() {
  if (!question) return;  // question checked here

  setBookmarkStatus('loading');

  const res = await toggleBookmark({ questionId: question.questionId });
  if (!res.ok) {
    setBookmarkStatus('error');
    setLoadState({ status: 'error', message: getErrorMessage(res) });
    return;
  }

  setBookmarkedQuestionIds((prev) => {
    const next = new Set(prev);
    if (res.data.bookmarked) next.add(question.questionId);  // BUG: stale closure
    else next.delete(question.questionId);  // BUG: stale closure
    return next;
  });

  setBookmarkStatus('idle');
}
```

## Race Condition Scenario
1. User clicks bookmark on Question A
2. `toggleBookmark({ questionId: 'question-a' })` sent to server
3. While waiting, user clicks "Next Question"
4. Question B loads, `question` state now points to Question B
5. Server responds with `bookmarked: true` for Question A
6. State updater runs: `next.add(question.questionId)`
7. **Bug:** `question.questionId` is now Question B's ID, not Question A's

## Impact
- **Wrong question bookmarked:** User bookmarks A, but B gets added to set
- **Inconsistent UI:** Bookmark icon doesn't match actual bookmark state
- **User confusion:** "I bookmarked that question but it's not in my list"

## Recommended Fix
Extract the questionId before the async operation:
```typescript
async function onToggleBookmark() {
  if (!question) return;

  const questionId = question.questionId;  // Capture before async

  setBookmarkStatus('loading');

  const res = await toggleBookmark({ questionId });
  if (!res.ok) {
    setBookmarkStatus('error');
    setLoadState({ status: 'error', message: getErrorMessage(res) });
    return;
  }

  setBookmarkedQuestionIds((prev) => {
    const next = new Set(prev);
    if (res.data.bookmarked) next.add(questionId);  // Use captured value
    else next.delete(questionId);  // Use captured value
    return next;
  });

  setBookmarkStatus('idle');
}
```

## Related
- BUG-031: State update after unmount
- React docs on closures: https://react.dev/learn/state-as-a-snapshot
