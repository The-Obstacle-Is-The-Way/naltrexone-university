# BUG-276: Quick Practice Status-Count Badges Go Stale After a Single Answer or Bookmark

**Status:** Open
**Severity:** P3
**Date:** 2026-06-30
**Confirmed:** 2026-06-30
**Component:** Practice / Quick Practice / UI State

---

## Summary

The Quick Practice mode picker shows segmented-control labels like "Unanswered (12)" / "Incorrect (3)" / "Bookmarked (5)" from `useQuickPracticeStatusCounts`. The hook's fetch effect only re-runs when the selected tags/difficulty filters change — never when a question is answered or bookmarked. The counts shown are accurate at page load and become stale after the very next status-changing action, for the remainder of that visit.

## Reachability

Reachable by any signed-in entitled user on `/app/practice/quick` (the default Quick Practice route, no special params required) who answers **or bookmarks** even a single question in a visit — the segmented control renders persistently alongside the question view, so the stale badge is visible on the very next glance, not just after multiple questions.

## Reproduction

1. Visit `/app/practice/quick`. Note the status badge counts (e.g. "Unanswered (12)").
2. Answer (or bookmark) one question.
3. Observe the status badges without reloading the page.

Expected: counts reflect the user's progress (e.g. "Unanswered" decreasing, "Incorrect"/"Bookmarked" increasing as applicable).

Actual: the badges keep showing the stale numbers captured at initial mount. Only a full reload/remount re-fetches them. The underlying question-selection logic itself is unaffected — the next question served still correctly respects live status — only the displayed count is wrong.

## Root Cause

- [`use-quick-practice-status-counts.ts`](<../../app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts#L132-L138>): `serverFilters` is a `useMemo` derived only from `input.filters.tagSlugs` and `input.filters.difficulty`.
- [`use-quick-practice-status-counts.ts`](<../../app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts#L140-L152>): the `useEffect` that fetches counts depends only on `[serverFilters]` — nothing in this hook's dependency array changes as a result of answering or bookmarking, so the effect never re-runs mid-visit.
- There are exactly three status categories, not five: [`question-progress-status.ts`](../../src/domain/value-objects/question-progress-status.ts#L1) defines `AllQuestionProgressStatuses = ['unanswered', 'incorrect', 'bookmarked'] as const`, independently confirmed by the existing test `use-quick-practice-status-counts.test.ts#L42` (`toHaveBeenCalledTimes(3)`).

## Impact

Display-only inaccuracy. No functional harm to question selection, scoring, or data integrity — a user who trusts the badge may be mildly confused about their remaining unanswered count, recoverable by reloading the page.

## Proposed Fix

Re-run (or otherwise invalidate) the status-count fetch whenever a question in the active filter set changes status — e.g. accept a refresh signal/dependency from the surrounding Quick Practice flow (such as a counter that increments on each successful answer/bookmark commit) and include it in the effect's dependency array, or expose an explicit `refetch()` from the hook that the question-flow's `onSuccess` callback invokes after each commit. No existing "counts that live-refresh on progress" pattern exists elsewhere in this codebase to point to instead (dashboard stats are plain server-rendered with no client refresh; bookmarks use `revalidatePath`, a page-level mechanism that doesn't apply to this client hook) — this is genuinely new ground, not a case of missing an established convention.

**Cost note:** `createQuickPracticeStatusCountsEffect` fetches all three statuses via `Promise.all` — three parallel server-action round trips per fetch cycle. Naively firing this refresh after every single answer/bookmark commit (roughly once per question, i.e. every ~10-30s of active use) is a meaningful increase over today's filter-change-only cadence, and would partly undercut the rationale for rejecting polling below. Consider coalescing the three per-status calls into one combined count query, or debouncing bursts of rapid commits, rather than firing the full three-call cycle unconditionally on every commit.

Rejected alternatives:
- **Poll on an interval.** Adds unnecessary load and latency for a UI element that only needs to change in response to the user's own actions, not external state — though see the cost note above, since a naive per-commit refetch has its own, different cost profile worth designing around.
- **Derive counts purely client-side from in-memory session state.** The counts must reflect the user's full historical status across all matching questions (not just ones touched this visit), which requires a server query; the fix should trigger that existing query more often, not replace it.

## Failing Test Sketch

Place this in a `.browser.spec.tsx` file using this repo's `vitest-browser-react` hook pattern (`await renderHook(...)`, `await harness.rerender(...)`, and `expect.poll(...)` for effect-driven calls), not a synchronous Testing Library-style `renderHook`.

```tsx
import { expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import * as practiceController from '@/src/adapters/controllers/practice-controller';
import { ok } from '@/tests/test-helpers/ok';
import type { PracticeFilters } from '../practice-page-logic';
import { useQuickPracticeStatusCounts } from './use-quick-practice-status-counts';

vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });

it('refetches status counts after a question is answered', async () => {
  const baseFilters = {
    tagSlugs: [],
    difficulty: null,
    status: 'unanswered',
  } satisfies PracticeFilters;
  const countAvailableQuestions = vi.mocked(
    practiceController.countAvailableQuestions,
  );
  countAvailableQuestions.mockResolvedValue(ok({ count: 1 }));

  const harness = await renderHook(
    (props: { filters: PracticeFilters; refreshSignal: number }) =>
      useQuickPracticeStatusCounts(props),
    { initialProps: { filters: baseFilters, refreshSignal: 0 } },
  );
  await expect.poll(() => countAvailableQuestions.mock.calls.length).toBe(3);

  await harness.rerender({ filters: baseFilters, refreshSignal: 1 });
  await expect.poll(() => countAvailableQuestions.mock.calls.length).toBe(6);
});
```

Today this fails because `useQuickPracticeStatusCounts` accepts only `filters`, so there is no `refreshSignal` input to rerender with and the effect's dependency array has no signal tied to in-session progress.

## Related

- The structurally identical sibling `use-practice-available-questions-count.ts` has the same `useMemo`/`useEffect` shape and the same staleness gap, but it is used only pre-session (not in an answer loop), so the gap is not user-visibly exploitable there. Not a duplicate of this bug; noted for whoever implements the fix, since the same fix approach may apply to both.
- No prior bug or debt entry covers Quick Practice's status-count refresh behavior.
