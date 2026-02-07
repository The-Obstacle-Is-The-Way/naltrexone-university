# BUG-081: Bookmark Message Timeout Fires After Component Unmount

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

The bookmark confirmation message ("Question bookmarked." / "Bookmark removed.") uses a `setTimeout` with a 2-second delay to clear the message. If the user navigates away or the component unmounts before the timeout fires, `setBookmarkMessage(null)` is called on an unmounted component.

**Observed:** React warning "Can't perform a React state update on an unmounted component" in dev mode. In production, the state update is silently swallowed but represents a resource leak.

**Expected:** Timeout should be cancelled when the component unmounts, or the callback should check mount status before updating state.

## Affected Files

1. `app/(app)/app/practice/hooks/use-practice-question-flow.ts:160-162` — Practice page bookmark timeout
2. `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:225-227` — Session page bookmark timeout

## Root Cause

Both files use the same pattern:

```typescript
bookmarkMessageTimeoutId.current = setTimeout(() => {
  setBookmarkMessage(null);  // ← No mount guard inside setTimeout callback
}, 2000);
```

The cleanup effect (lines 103-109 in question flow, lines 165-171 in session controller) only runs on final unmount. But the timeout is set inside a memoized callback — if the user triggers a bookmark toggle then immediately navigates away, the ref cleanup races with the setTimeout callback.

The `isMounted()` guard is used in the `toggleBookmarkForQuestion` async path but NOT in the `onBookmarkToggled` synchronous callback that sets up the timeout.

## Steps to Reproduce

1. Open a practice session (tutor or exam mode)
2. Click "Bookmark" on a question
3. Immediately navigate away (e.g., click "Back to Dashboard" or browser back) within 2 seconds
4. Observe React unmount warning in console (dev mode)

## Fix

Add `isMounted()` check inside the setTimeout callback:

```typescript
bookmarkMessageTimeoutId.current = setTimeout(() => {
  if (isMounted()) {
    setBookmarkMessage(null);
  }
}, 2000);
```

## Verification

- [ ] No React unmount warnings when navigating during bookmark message display
- [ ] Bookmark message still auto-clears after 2 seconds on mounted component
- [ ] Manual verification: bookmark → immediate navigate → no console warning

## Related

- `app/(app)/app/practice/practice-page-logic.ts` — `toggleBookmarkForQuestion` function
- `lib/use-is-mounted.ts` — Mount check hook
