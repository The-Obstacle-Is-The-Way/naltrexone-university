# BUG-160: Dashboard "Recent Sessions" Cards All Link to Generic History Page

**Status:** Open
**Priority:** P3
**Date:** 2026-02-25

---

## Description

Every session card in the Dashboard "Recent sessions" list links to the same generic history URL (`/app/history?tab=sessions`). Clicking any specific session row navigates the user to the sessions list rather than deep-linking to that session's review. The data needed for deep-linking (`firstQuestionSlug`, `sessionId`) is already fetched and available — just unused.

**Expected behavior:** Clicking a specific session card navigates to that session's review (matching the behavior on the History page).

**Actual behavior:** All session cards go to the same `/app/history?tab=sessions` URL regardless of which session was clicked.

## Reachability in Production

**Reachable.** Every authenticated, entitled user sees the dashboard as their landing page. The "Recent sessions" section displays 1–3 completed sessions with clickable cards.

## Root Cause

`app/(app)/app/dashboard/page.tsx` line 146 uses a shared `historySessionsHref` variable for every row:

```tsx
// Line 45: Single URL for all rows
const historySessionsHref = `${ROUTES.APP_HISTORY}?tab=sessions`;

// Line 146: Every session card uses the same href
<Link href={historySessionsHref} ...>
```

The `GetSessionHistoryOutput` already includes `row.sessionId` and `row.firstQuestionSlug` per row. The History page at `app/(app)/app/history/components/history-sessions-tab.tsx:168–175` demonstrates the correct deep-link pattern:

```tsx
const sessionReviewHref = row.firstQuestionSlug
  ? toQuestionRoute(row.firstQuestionSlug, {
      from: 'history',
      mode: 'review',
      sessionId: row.sessionId,
      historyHref,
    })
  : null;
```

The dashboard does not replicate this pattern.

## Impact

- Users cannot navigate directly from the dashboard to review a specific session
- Clicking any session row feels broken — all cards lead to the same destination
- The History page already deep-links correctly, creating an inconsistency

## Suggested Fix

Replace the static `historySessionsHref` in each session `<Link>` with a per-row deep-link using `toQuestionRoute` (or fall back to the generic history URL when `firstQuestionSlug` is null):

```tsx
const sessionReviewHref = row.firstQuestionSlug
  ? toQuestionRoute(row.firstQuestionSlug, {
      from: 'dashboard',
      mode: 'review',
      sessionId: row.sessionId,
    })
  : historySessionsHref;
```

## Verification

- [ ] Unit test: DashboardView renders per-session deep-link hrefs (not generic history)
- [ ] Manual: Click a session card on dashboard → navigates to that session's review
- [ ] Regression: Sessions without `firstQuestionSlug` still link to history

## Tracer-Bullet Verification (2026-02-25)

Full vertical trace across 6 layers:

1. **DB layer** (`drizzle-practice-session-repository.ts:100–139`): `findCompletedByUserId` returns `PracticeSession` with `questionIds` array — `questionIds[0]` is the first question ID.
2. **Use case** (`get-session-history.ts:55–69`): Batch-resolves first question IDs to slugs via `findPublishedByIds`, populates `firstQuestionSlug` per row.
3. **Controller** (`practice-controller.ts:231–243`): Pass-through — `sessionId` and `firstQuestionSlug` flow unmodified.
4. **Dashboard rendering** (`page.tsx:143–176`): **BUG HERE** — uses static `historySessionsHref` for all rows, ignoring both `row.sessionId` and `row.firstQuestionSlug`.
5. **History page** (`history-sessions-tab.tsx:168–175`): **Correct reference** — uses `toQuestionRoute(row.firstQuestionSlug, { from: 'history', mode: 'review', sessionId })`.
6. **Test gap** (`page.test.tsx:60`): Provides `firstQuestionSlug: 'q-correct'` in fixture data but never asserts session card hrefs. Recent activity assertions (lines 93–110) DO verify per-row hrefs — the session section lacks equivalent coverage.

**Contrast within the same file:** The dashboard's "Recent activity" section (line 221) correctly uses `toQuestionRoute(row.slug, { from: 'dashboard', ... })`. The correct pattern exists 70 lines below the bug.

## Related

- `app/(app)/app/dashboard/page.tsx:45` — static `historySessionsHref` definition
- `app/(app)/app/dashboard/page.tsx:146` — bug location (all session `<Link>` hrefs)
- `app/(app)/app/dashboard/page.tsx:221` — correct pattern in same file (recent activity)
- `app/(app)/app/dashboard/page.test.tsx:60` — test fixture with unused `firstQuestionSlug`
- `app/(app)/app/history/components/history-sessions-tab.tsx:168–175` — correct reference implementation
- `lib/routes.ts:25–50` — `toQuestionRoute` helper
