# BUG-081: Bookmark Message Timeout Fires After Component Unmount

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-07

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

Extracted shared timeout handling to `app/(app)/app/practice/hooks/bookmark-message-timeout.ts` and wired both practice hooks to use it:

- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts`

The helper enforces mount checks inside the timeout callback before `setBookmarkMessage(null)`.

## Verification

- [x] No React unmount warnings path remains guarded in timeout callback
- [x] Bookmark message still auto-clears after 2 seconds on mounted component
- [x] Unit coverage added in `app/(app)/app/practice/hooks/bookmark-message-timeout.test.ts`

## Related

- `app/(app)/app/practice/practice-page-logic.ts` — `toggleBookmarkForQuestion` function
- `lib/use-is-mounted.ts` — Mount check hook
- `app/(app)/app/practice/hooks/bookmark-message-timeout.ts`
