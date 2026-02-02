# DEBT-066: No Success Toast for Bookmark Action

## Category: UX Feedback

## Summary
When a user successfully bookmarks or unbookmarks a question, the only feedback is the button text changing. There's no toast notification or other prominent confirmation.

## Location
- `app/(app)/app/practice/page.tsx:243-263`

## Current Behavior
1. User clicks "Bookmark"
2. Button shows loading state
3. Server responds successfully
4. Button text changes to "Bookmarked"
5. No other feedback

## Impact
- **Discoverability:** Users may not notice the text change
- **Confirmation uncertainty:** "Did it actually save?"
- **Error vs success:** Error shows via `setLoadState`, but success is silent

## Effort: Low

## Recommended Fix
Add a toast notification on successful bookmark:

```typescript
import { toast } from 'sonner';  // or your toast library

async function onToggleBookmark() {
  if (!question) return;
  const questionId = question.questionId;

  setBookmarkStatus('loading');

  const res = await toggleBookmark({ questionId });
  if (!res.ok) {
    setBookmarkStatus('error');
    setLoadState({ status: 'error', message: getErrorMessage(res) });
    toast.error('Failed to update bookmark');
    return;
  }

  setBookmarkedQuestionIds((prev) => {
    const next = new Set(prev);
    if (res.data.bookmarked) {
      next.add(questionId);
      toast.success('Question bookmarked');
    } else {
      next.delete(questionId);
      toast.success('Bookmark removed');
    }
    return next;
  });

  setBookmarkStatus('idle');
}
```

## Alternative
Use a more subtle confirmation:
- Brief animation on the bookmark icon
- Accessibility announcement via `aria-live` region
- Subtle color flash

## Related
- shadcn/ui toast component
- DEBT-068: Generic error page (related to feedback patterns)
