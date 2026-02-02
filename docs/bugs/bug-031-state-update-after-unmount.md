# BUG-031: State Update After Component Unmount

## Severity: P2 - Medium

## Summary
The practice page's bookmark loading effect has no cleanup function and doesn't check if the component is mounted before setting state. If the component unmounts while `getBookmarks` is pending, state will be set on an unmounted component.

## Location
- `app/(app)/app/practice/page.tsx:199-211`

## Current Behavior
```typescript
useEffect(() => {
  void (async () => {
    const res = await getBookmarks({});
    if (!res.ok) {
      setBookmarkStatus('error');  // No unmount check
      return;
    }
    setBookmarkedQuestionIds(       // No unmount check
      new Set(res.data.rows.map((row) => row.questionId)),
    );
    setBookmarkStatus('idle');      // No unmount check
  })();
}, []);
```

## Impact
- **React warning:** "Can't perform a React state update on an unmounted component"
- **Memory leak:** State updates keep component in memory
- **Undefined behavior:** State changes on unmounted component

## Scenario
1. User navigates to practice page
2. `getBookmarks()` request starts
3. User quickly navigates away (dashboard, billing, etc.)
4. Component unmounts
5. `getBookmarks()` response arrives
6. `setBookmarkStatus()` called on unmounted component → Warning

## Recommended Fix
**Option A:** Add mounted ref:
```typescript
useEffect(() => {
  let mounted = true;

  void (async () => {
    const res = await getBookmarks({});
    if (!mounted) return;  // Check before any state update

    if (!res.ok) {
      setBookmarkStatus('error');
      return;
    }
    setBookmarkedQuestionIds(
      new Set(res.data.rows.map((row) => row.questionId)),
    );
    setBookmarkStatus('idle');
  })();

  return () => {
    mounted = false;
  };
}, []);
```

**Option B:** Use AbortController (if server action supports it):
```typescript
useEffect(() => {
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await getBookmarks({}, { signal: controller.signal });
      // ... handle response
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
  })();

  return () => controller.abort();
}, []);
```

## Related
- BUG-032: Stale closure in onToggleBookmark
- React docs on cleanup: https://react.dev/learn/synchronizing-with-effects#fetching-data
