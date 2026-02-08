# BUG-112: Navigator Fetch Silently Swallows Errors with No Error State

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

The navigator fetch in `use-practice-session-review-stage.ts` uses a bare `catch {}` that discards the error and sets **no error state**. When `getPracticeSessionReview()` throws, the catch block silently returns — the navigator simply never appears. The user has no indication that something failed; the UI looks as though there's nothing to navigate.

This is worse than BUG-111 because at least that bug sets an error status. Here, the failure is completely invisible to both the user and operators.

**Observed:** If the server action throws, the question navigator silently disappears. No error state, no retry option, no logging.

**Expected:** The error should be captured and logged. An error state should be set so the UI can show a retry option or informative message.

## Steps to Reproduce

1. Start a practice session in session mode and answer at least one question
2. Trigger a failure in `getPracticeSessionReview` (network error, server 500)
3. Observe: the question navigator area is simply empty — no error indication, no loading state, just absent

## Root Cause

**File:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts:239-241`

```typescript
} catch {
  if (!mounted || !input.isMounted()) return;
  return;
}
```

Two problems:
1. **Bare catch** — error object is discarded, zero observability
2. **No error state transition** — the function just returns without updating any state. The `navigator` remains `null` as if there was simply no data, making the failure indistinguishable from "no navigator available"

Compare with the summary fetch in the same file (lines ~210-220) which has the same bare catch pattern but at least is for a less critical feature. The navigator is essential for session review — losing it silently breaks the user's ability to navigate between questions.

## Impact

- **Silent feature degradation** — navigator disappears with no explanation
- **Zero observability** — no logs, no telemetry, no error object preserved
- **No retry path** — user can't retry because they don't know something failed
- **Confusing UX** — looks like the feature doesn't exist rather than that it failed

## Fix

1. Capture the error object and log it
2. Add a navigator error state (e.g., `navigatorLoadError`) that the UI can use to show a retry option

```typescript
} catch (error) {
  if (!mounted || !input.isMounted()) return;
  console.error('Navigator fetch failed:', error);
  // Set an error state so UI can show retry
  setNavigatorError(true);
  return;
}
```

The component rendering the navigator should check for this error state and show a retry button or message.

## Verification

- [ ] `catch` block captures the error object
- [ ] Error is logged (at minimum `console.error`)
- [ ] An error state is set so the UI can distinguish "failed" from "no data"
- [ ] UI shows error/retry state when navigator fetch fails
- [ ] Unit test verifies error handling behavior
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
- BUG-111 — same bare-catch pattern in bookmark toggle
- BUG-094 — exam review error state (resolved)
