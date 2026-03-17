# DEBT-320: useEffect Audit — Problematic Patterns and Missing Data-Fetching Abstraction

**Priority:** P2
**Created:** 2026-03-17
**Status:** Open

---

## Summary

An audit of all `useEffect` usage across the codebase found **30 calls in production code** (plus a few in test helpers). Most are well-structured, but two specific anti-patterns and one systemic gap warrant attention.

---

## Inventory

| # | File | Line | Category | Risk |
|---|------|------|----------|------|
| 1 | `app/global-error.tsx` | 15 | Error logging | OK |
| 2 | `components/error-boundary-page.tsx` | 32 | Error logging | OK |
| 3 | `app/(app)/app/bookmarks/bookmarks-toast.tsx` | 25 | URL-driven toast | OK |
| 4 | `app/(app)/app/practice/[sessionId]/practice-session-toast.tsx` | 35 | URL-driven toast | OK |
| 5 | `components/theme-toggle.tsx` | 12 | SSR hydration guard | OK |
| 6 | `components/mobile-nav.tsx` | 99 | Focus on open | OK (minor) |
| 7 | `components/ui/notification-provider.tsx` | 109 | Cleanup timers | OK |
| 8 | `app/(app)/app/practice/components/practice-view.tsx` | 121 | Bookmark notification | OK (minor) |
| 9 | `app/(app)/app/practice/components/practice-view.tsx` | 140 | Scroll to feedback | OK |
| 10 | `app/(app)/app/practice/shared/use-question-flow-core.ts` | 81 | Ref sync | OK |
| 11 | `use-question-page-controller.ts` | 192 | Data fetch | Fetch |
| 12 | `use-question-page-controller.ts` | 194 | Reset state on slug | Key pattern |
| 13 | `use-question-page-controller.ts` | 199 | Dev-only warning | OK |
| 14 | `use-question-page-controller.ts` | 218 | Data fetch (session nav) | Fetch (complex) |
| 15 | **`use-question-page-controller.ts`** | **347** | **Derived state via effect** | **Problem** |
| 16 | `use-question-page-controller.ts` | 358 | Data fetch (prev attempt) | Fetch (complex) |
| 17 | `use-question-page-controller.ts` | 423 | Data fetch (bookmarks) | Fetch |
| 18 | **`use-question-page-controller.ts`** | **686** | **Flag → effect → reset flag** | **Problem** |
| 19 | `use-practice-question-answer-flow.ts` | 124 | Data fetch (auto-load) | Fetch |
| 20 | `use-practice-question-answer-flow.ts` | 128 | Focus recovery | OK |
| 21 | `use-quick-practice-status-counts.ts` | 140 | Data fetch | Fetch |
| 22 | `use-practice-session-question-flow.ts` | 140 | Data fetch (auto-load) | Fetch |
| 23 | `use-practice-session-summary-review.ts` | 39 | Data fetch | Fetch |
| 24 | `use-practice-session-navigator.ts` | 46 | Data fetch | Fetch |
| 25 | `use-practice-question-bookmarks.ts` | 45 | Data fetch | Fetch |
| 26 | `use-practice-question-bookmarks.ts` | 61 | Cleanup timeout | OK |
| 27 | `use-practice-session-page-controller.ts` | 113 | Data fetch (bootstrap) | Fetch |
| 28 | `use-practice-session-tags.ts` | 20 | Data fetch (mount) | Fetch |
| 29 | `use-practice-available-questions-count.ts` | 34 | Data fetch | Fetch |
| 30 | `use-practice-incomplete-session.ts` | 38 | Data fetch (mount) | Fetch |

---

## Problem 1: Derived State via Effect (Line 347)

**File:** `app/(app)/app/questions/[slug]/use-question-page-controller.ts:347`

```ts
useEffect(() => {
  if (input.mode === 'review') {
    setIsLoadingPreviousAttempt(true);
    setReviewHydrationState('no_prior_attempt');
    return;
  }
  setIsLoadingPreviousAttempt(false);
  setReviewHydrationState(null);
}, [input.mode]);
```

This sets `isLoadingPreviousAttempt` and `reviewHydrationState` based solely on `input.mode`. That is derived state — it should be computed inline, not synced via an extra render cycle. The effect causes a stale-then-correct flash: first render uses the old values, then the effect fires and triggers a second render with the correct ones.

**Fix:** Compute these values inline or initialize them from `input.mode` in the state initializer and reset them at the point where `input.mode` actually changes (the URL navigation event handler).

---

## Problem 2: Flag → Effect → Reset Flag (Line 686)

**File:** `app/(app)/app/questions/[slug]/use-question-page-controller.ts:686`

```ts
useEffect(() => {
  if (!submitResult || !pendingRetryProvenance) return;
  // ... update session navigation ...
  setPendingRetryProvenance(null);  // reset the flag
}, [submitResult, pendingRetryProvenance, normalizedSessionId]);
```

This is the "set state flag → effect sees it → does work → clears flag" anti-pattern. `pendingRetryProvenance` is set in `onReattempt`, then this effect fires on the next render to update session navigation and clear the flag. The work should happen directly inside `onReattempt` (or its submit callback) rather than through this indirect effect relay.

**Risk:** The indirection makes control flow hard to trace and creates a window where the flag is set but the effect hasn't fired yet. If another state update interleaves, the effect could fire with unexpected combinations of `submitResult` and `pendingRetryProvenance`.

**Fix:** Move the session navigation update into the submit success callback or directly into `onReattempt`, eliminating the need for `pendingRetryProvenance` as a state flag.

---

## Problem 3: 8 Effects in One Hook

**File:** `app/(app)/app/questions/[slug]/use-question-page-controller.ts`

This single hook has **8 `useEffect` calls** with complex, overlapping dependency arrays. The effects at lines 218 and 358 each have 6–7 dependencies and manually manage stale-request tracking via refs. This is the highest-risk file in the codebase for effect-related regressions.

The hook mixes concerns:
- Question loading
- Previous attempt hydration
- Session navigation
- Bookmark state
- Retry provenance tracking
- Dev-mode warnings

**Fix (decomposition):** Split into smaller, focused hooks analogous to the practice-session pattern (which already uses `usePracticeSessionQuestionFlow`, `usePracticeQuestionBookmarks`, `usePracticeSessionNavigator`, etc.). The question page controller should compose these rather than inlining all logic.

---

## Systemic Gap: No Data-Fetching Abstraction

**14 of 30 effects** are data-fetching patterns that manually handle:
- Stale-request cancellation via ref counters
- `isMounted()` guards
- Error reporting
- Loading states

The codebase does not use React Query, SWR, or any data-fetching library. Each fetch-effect reimplements the same concerns. This is mitigated by the well-factored `createXxxEffect` factory functions (e.g., `createBookmarksEffect`, `createSummaryReviewEffect`, `createNavigatorEffect`), which centralize logic per use case. But the underlying pattern — "useEffect + fetch + setState + cleanup" — remains.

### Why this matters
- **Race conditions:** Manual stale tracking works but is fragile. A single missed check = stale data rendered.
- **No caching:** Each page mount re-fetches everything. Navigation between pages discards and re-fetches data.
- **Duplication:** The "start loading, fetch, check stale, set state, handle error" ceremony repeats across 14 hooks.

### What's NOT recommended right now
Adopting React Query / SWR is a large migration. Many of the existing factory functions (`createXxxEffect`) are well-tested and encapsulate their logic cleanly. This is not an urgent fix but a long-term architectural direction to consider if fetch-related bugs increase.

---

## What's Fine

The remaining ~15 effects are idiomatic and low-risk:

- **Error boundary logging** (2) — React error boundaries provide `error` as a prop; logging it on mount/change is the intended pattern.
- **URL-driven toasts** (2) — One-time effects with dedup guards; correctly clean up the URL after firing.
- **SSR hydration guard** (1) — Standard `next-themes` pattern.
- **DOM interactions** (3) — Focus management, scroll-into-view. Legitimate external system sync.
- **Cleanup** (3) — Timer cleanup on unmount. Idiomatic.
- **Ref sync** (1) — Keeping a ref up-to-date with a callback prop.
- **Dev-only warning** (1) — Harmless.
- **Well-factored fetch effects** (multiple) — The practice hooks use factory functions with cleanup returns. These are the best-structured effects in the codebase.

---

## Recommended Paydown Order

1. **P2 — Fix Problem 2 (flag → effect → reset)** — Highest risk of subtle interleaving bugs. Move the session navigation update into the event handler path.
2. **P2 — Fix Problem 1 (derived state)** — Eliminates an unnecessary render cycle and makes the state derivation explicit.
3. **P3 — Decompose `use-question-page-controller.ts`** — Break the 8-effect monolith into focused hooks. Reduces cognitive load and regression risk.
4. **P4 — Evaluate data-fetching abstraction** — Monitor fetch-related bug count. If it climbs, introduce a library for the highest-traffic hooks first.

---

## No Infinite Loops or Active Race Conditions Found

Despite the structural concerns above, no current `useEffect` in the codebase creates an infinite loop or active race condition. The manual stale-tracking via refs is correctly implemented in all cases reviewed. The concerns are about **fragility and maintainability**, not current bugs.
