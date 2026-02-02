# BUG-032: State Update After Component Unmount

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary

The practice page's bookmark loading effect has no cleanup function and doesn't check if the component is mounted before setting state. If the component unmounts while `getBookmarks` is pending, state will be set on an unmounted component.

## Location

- `app/(app)/app/practice/page.tsx:208-238`

## Root Cause

Missing mounted flag check before state updates in async effect.

## Fix

Added mounted flag pattern to the bookmark loading effect:

```typescript
useEffect(() => {
  let mounted = true;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  void (async () => {
    const res = await getBookmarks({});
    if (!mounted) return;  // Early exit if unmounted

    if (!res.ok) {
      console.error('Failed to load bookmarks', res.error);
      setBookmarkStatus('error');

      if (bookmarkRetryCount < 2) {
        timeoutId = setTimeout(
          () => {
            if (mounted) {  // Check before retry
              setBookmarkRetryCount((prev) => prev + 1);
            }
          },
          1000 * (bookmarkRetryCount + 1),
        );
      }
      return;
    }

    setBookmarkedQuestionIds(
      new Set(res.data.rows.map((row) => row.questionId)),
    );
    setBookmarkStatus('idle');
  })();

  return () => {
    mounted = false;
    if (timeoutId) clearTimeout(timeoutId);
  };
}, [bookmarkRetryCount]);
```

## Verification

- [x] Code review verified pattern correctness
- [x] TypeScript compilation passes
- [x] Build succeeds
- [x] No React warnings in console during navigation

## Related

- BUG-033: Stale closure in onToggleBookmark
- [React Effects Documentation](https://react.dev/learn/synchronizing-with-effects#fetching-data)
