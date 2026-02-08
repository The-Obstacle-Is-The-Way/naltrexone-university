# DEBT-166: Practice View Missing Focus Management After Error Recovery

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07

---

## Description

When a practice session error occurs and the user clicks "Try again", focus does not automatically move to the error message or loading indicator. This violates WCAG 2.1 Level A focus management expectations — keyboard and screen reader users aren't guided to the result of their action.

```tsx
{props.loadState.status === 'error' ? (
  <ErrorCard className="p-6">
    <div>{props.loadState.message}</div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" onClick={props.onTryAgain}>
        Try again
      </Button>
    </div>
  </ErrorCard>
) : null}
```

## Impact

- Screen reader users won't be notified of retry results
- Keyboard-only users must manually navigate to find the new state
- WCAG 2.1 Level A compliance gap
- Low severity: sighted mouse users are unaffected

## Resolution

After "Try again" is clicked, set focus to the loading indicator or error card when the result arrives (using `useRef` + `useEffect`).

## Verification

- [ ] Focus moves to result after retry
- [ ] Screen reader announces new state
- [ ] Browser spec test for focus management

## Related

- `app/(app)/app/practice/components/practice-view.tsx:102-114`
- DEBT-148 (minimal ARIA accessibility in app pages)
