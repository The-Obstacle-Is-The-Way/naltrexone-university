# BUG-090: Practice Error State Has No Escape Hatch

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07

---

## Description

When question loading fails during an active practice session, the error UI shows only a "Try again" button. If retries continue to fail (e.g., network down, server error), the user has no way to end the session or navigate back to the practice landing page without using the browser's back button.

## Steps to Reproduce

1. Start a practice session
2. Simulate a network failure or server error on question load
3. Observe the error state UI — only "Try again" is available
4. If "Try again" also fails, user is stuck

## Root Cause

`app/(app)/app/practice/components/practice-view.tsx:82-94` — the error state block renders only a retry button with no alternative navigation:

```tsx
{props.loadState.status === 'error' ? (
  <div className="...">
    <div>{props.loadState.message}</div>
    <Button onClick={props.onTryAgain}>
      Try again
    </Button>
    {/* No "End Session" or "Back to Practice" option */}
  </div>
) : null}
```

## Impact

- User is trapped in error state with no UI escape
- Must use browser back button or manually type a URL
- Session remains incomplete (not ended), so it shows as resumable on next visit
- Poor UX during transient network issues

## Proposed Fix

Add an "End Session" or "Back to Practice" link/button alongside "Try again" in the error state block. The session should either be ended cleanly or the user should be able to navigate away.

## Verification

- [ ] Error state shows both "Try again" and an escape option
- [ ] Escape option either ends the session or navigates to practice landing
- [ ] Session state is consistent after using the escape option

## Related

- `app/(app)/app/practice/components/practice-view.tsx`
- SPEC-020 Phase 2 (session UX improvements)
