# DEBT-166: Practice View Missing Focus Management After Error Recovery

**Status:** Resolved
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

Implemented explicit error-recovery focus state in `usePracticeQuestionFlow`:

- Track whether the UI is recovering from an error (`pendingFocus`)
- Preserve that state through `error -> loading -> ready`
- Focus the question area when ready is reached after an error recovery

This closes the original half-measure that only handled direct `error -> ready` transitions.

## Verification

- [x] Transition state machine covers `error -> loading -> ready`
- [x] Unit test added for focus-recovery transition behavior
- [x] `pnpm test --run` passes

## Related

- `app/(app)/app/practice/hooks/use-practice-question-flow.ts`
- `app/(app)/app/practice/hooks/use-practice-question-flow.test.tsx`
- DEBT-148 (minimal ARIA accessibility in app pages)
