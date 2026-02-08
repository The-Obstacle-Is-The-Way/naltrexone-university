# BUG-112: Navigator Fetch Silently Swallows Errors with No Error State

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

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

## Resolution

Implemented explicit navigator load-state handling in `usePracticeSessionReviewStage` and surfaced it in the page view:

1. Added `navigatorLoadState` (`idle` / `loading` / `ready` / `error`) and `onRetryNavigator()` to the hook output contract.
2. Navigator fetch now captures thrown errors, logs them, and sets `navigatorLoadState` to `{ status: 'error', message }`.
3. Non-OK action results also transition navigator state to explicit error (instead of silent return).
4. `PracticeSessionPageView` now renders a navigator error block with a `Retry navigator` action when navigator loading fails.

## Verification

- [x] Navigator fetch catch path captures and logs thrown errors
- [x] Hook exposes explicit navigator error state (`navigatorLoadState`)
- [x] UI displays navigator error with retry action instead of silently hiding navigator
- [x] Browser + hook contract tests cover failure and retry behavior
- [x] Full quality gates pass (`pnpm typecheck && pnpm lint && pnpm test --run`)

## Related

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
- BUG-111 — same bare-catch pattern in bookmark toggle
- BUG-094 — exam review error state (resolved)
