# BUG-261: Out-of-Range Session History Pages Show a False Empty-State Message

**Status:** Open
**Severity:** P4
**Date:** 2026-06-23
**Confirmed:** 2026-06-23
**Component:** History / Session Pagination / UI State

---

## Summary

`/app/history?tab=sessions` can receive a valid non-negative `offset` that is beyond the current number of completed sessions. The repository correctly returns `rows: []` with `total > 0`, but `HistorySessionsTab` checks `rows.length === 0` before reading `total`. The UI renders "No completed sessions yet." with only a "Go to Practice" button, even though the user does have completed sessions.

The questions history tab already handles the same pagination shape correctly with a "No more questions on this page" state and a "Back to first page" recovery link.

## Reachability

Reachable by an authenticated entitled user who opens a stale/bookmarked/manually edited sessions-history URL such as `/app/history?tab=sessions&offset=20&limit=20` when their matching completed-session count is below that offset. The route and controller accept offsets up to the configured maximum. The harm is recoverable UI misinformation, not data loss or security exposure, so this is P4.

## Reproduction

1. Have at least one completed practice session and fewer than `offset` matching completed sessions.
2. Visit `/app/history?tab=sessions&offset=20&limit=20`.
3. Observe the sessions tab.

Expected: the page should say there are no sessions on that page and offer a recovery link back to the first page.

Actual: the page says "No completed sessions yet." and offers only "Go to Practice."

## Root Cause

The page and controller allow a bounded but out-of-range offset to reach the session history query:

- [`history-search-params.ts`](<../../app/(app)/app/history/history-search-params.ts#L34>) parses any non-negative integer offset and returns it unchanged.
- [`history/page.tsx`](<../../app/(app)/app/history/page.tsx#L77>) reads search params.
- [`history/page.tsx`](<../../app/(app)/app/history/page.tsx#L129>) calls `getSessionHistory` with the parsed limit/offset.
- [`practice-schemas.ts`](../../src/adapters/controllers/practice-schemas.ts#L112) bounds `offset` with `MAX_PAGINATION_OFFSET`, but does not and cannot know the current `total`.
- [`practice-controller.ts`](../../src/adapters/controllers/practice-controller.ts#L389) forwards the valid offset to the use case.

The use case and repository preserve the pagination shape:

- [`get-session-history.ts`](../../src/application/use-cases/get-session-history.ts#L48) calls `findCompletedByUserId` with the requested offset.
- [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L125) clamps only invalid/negative offsets.
- [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L130) counts matching completed sessions.
- [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L140) applies the safe offset to the row query.
- [`get-session-history.ts`](../../src/application/use-cases/get-session-history.ts#L100) returns `rows`, `total`, `limit`, and `offset`.

The sessions UI loses the distinction:

- [`history-sessions-tab.tsx`](<../../app/(app)/app/history/components/history-sessions-tab.tsx#L95>) reads `rows`.
- [`history-sessions-tab.tsx`](<../../app/(app)/app/history/components/history-sessions-tab.tsx#L96>) immediately treats every empty page as the true empty-session state.
- [`history-sessions-tab.tsx`](<../../app/(app)/app/history/components/history-sessions-tab.tsx#L99>) renders "No completed sessions yet."
- [`history-sessions-tab.tsx`](<../../app/(app)/app/history/components/history-sessions-tab.tsx#L109>) reads `limit`, `offset`, and `total` only after that early return.

The sibling questions tab demonstrates the intended distinction:

- [`history-questions-tab.tsx`](<../../app/(app)/app/history/components/history-questions-tab.tsx#L417>) branches on empty rows.
- [`history-questions-tab.tsx`](<../../app/(app)/app/history/components/history-questions-tab.tsx#L440>) renders the out-of-range page state when `totalCount > 0`.
- [`history-questions-tab.test.tsx`](<../../app/(app)/app/history/components/history-questions-tab.test.tsx#L609>) covers a back-to-first-page link for an empty page with a nonzero total.
- [`history-sessions-tab.test.tsx`](<../../app/(app)/app/history/components/history-sessions-tab.test.tsx#L678>) covers only the true empty state (`total: 0`).

## Impact

A user with completed sessions can be told they have none, and the visible recovery action sends them to Practice rather than back to their existing history. This is misleading but recoverable by clearing the URL offset or navigating back to History.

## Proposed Fix

Update `HistorySessionsTab` to branch on `total` before rendering the empty state, mirroring `HistoryQuestionsTab`:

1. Read `limit`, `offset`, and `total` immediately after the successful result.
2. If `rows.length === 0 && total === 0`, keep the current "No completed sessions yet." state.
3. If `rows.length === 0 && total > 0`, render "No more sessions on this page." with a "Back to first page" link built by `buildHistorySessionsHref({ limit, offset: 0, mode: modeFilter })`.
4. Preserve `modeFilter` and `limit` in the recovery link.

Rejected alternatives:

- Clamp the offset in the repository or use case: the page still needs an explicit out-of-range UI state, and server-side clamping would make the response less transparent.
- Redirect from the page to offset 0: adds navigation behavior where a simple render branch is sufficient and consistent with the questions tab.
- Reuse the true-empty "Go to Practice" state: that is the current bug and gives the wrong recovery path.

## Failing Test Sketch

```tsx
it('renders an out-of-range empty page state when session total is nonzero', () => {
  const result: SessionHistoryResult = {
    ok: true,
    data: {
      rows: [],
      total: 21,
      limit: 20,
      offset: 20,
    },
  };

  const html = renderToStaticMarkup(
    <HistorySessionsTab result={result} modeFilter="exam" />,
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const backToFirstPageLink = Array.from(doc.querySelectorAll('a')).find(
    (anchor) => anchor.textContent?.trim() === 'Back to first page',
  );

  expect(html).toContain('No more sessions on this page.');
  expect(html).not.toContain('No completed sessions yet.');
  expect(backToFirstPageLink?.getAttribute('href')).toBe(
    '/app/history?tab=sessions&offset=0&limit=20&mode=exam',
  );
});
```

Today this fails because `HistorySessionsTab` returns the true-empty state before reading `total`.

## Prior Bug Cross-Refs

- BUG-162 fixed an unbounded attempted-questions offset. BUG-261 is not an unbounded-offset performance issue; the session offset is bounded, but the UI mislabels the valid empty page.
- BUG-253 was withdrawn as an unreachable session-history ordering tiebreaker. BUG-261 is unrelated to ordering and is reachable through the history URL.
- The questions-tab empty-page branch is the local precedent and should be mirrored for sessions.
