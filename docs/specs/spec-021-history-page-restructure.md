# SPEC-021: History Page Restructure

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-10
**Depends On:** SPEC-013 (Practice Sessions), SPEC-014 (Review + Bookmarks), SPEC-019 (Practice UX Redesign), SPEC-020 (Practice Engine Completion)
**Brainstorming:** `docs/brainstorming/review-page-flow-audit.md`, `docs/brainstorming/review-consistency-audit.md`

---

## 1. Executive Summary

The review experience is scattered across three pages (Dashboard, Practice, Review), creating navigational confusion. Users finishing an exam have no canonical place to review results. The Review page only shows missed questions — too narrow for a nav item called "Review."

This spec consolidates all post-session review into a **History page** (`/app/history`) with two tabs: **Sessions** (all completed sessions with expandable breakdowns) and **Missed Questions** (the current Review page content). The Practice page loses its "Recent sessions" panel. The Dashboard replaces its verbose activity timeline with compact session summary cards.

This follows the UWorld/Amboss pattern: **Create → Do → Review**, where each step has its own page.

---

## 2. Decisions (No Optionality)

Every open question from the brainstorming docs is resolved here.

| Question | Decision | Rationale |
|----------|----------|-----------|
| Page name: "History" vs "Performance" vs "Results" | **History** | "Performance" implies analytics (charts, trends) we don't have yet. "Results" is ambiguous. "History" says "everything you've done" — sessions, questions, reattempts. Unambiguous. |
| Should Sessions tab auto-expand most recent session? | **No** | Clean list first. User clicks to expand. Auto-expanding pushes other sessions off-screen for users with many sessions. |
| Where do Quick Practice (ad-hoc) attempts appear? | **Missed Questions tab only** | Ad-hoc attempts have no session. They appear in Missed Questions if incorrect (already the case). The Sessions tab is for session-based practice only. Quick Practice is ephemeral by design. |
| Dashboard slim-down aggressiveness | **3 most recent sessions + 3 most recent missed questions** | Enough recency signal to answer "what did I do?" without becoming a shadow review page. Links to History for details. |
| Post-session redirect | **Stay on summary, add "View in History" link** | Redirecting away from summary is disorienting. The summary is useful on its own. A prominent link bridges to History without forcing navigation. |
| Route for History | **`/app/history`** (no session sub-routes for now) | Session detail stays as expandable in the tab, not a separate route. Less routing complexity. Can promote to `/app/history/[sessionId]` later if needed. |
| `/app/review` after rename | **permanent redirect to `/app/history?tab=missed`** | Bookmarked URLs and external links keep working. Redirect is in `next.config.ts`. |
| Tab URL persistence | **Query param: `/app/history?tab=sessions` or `/app/history?tab=missed`** | Default is `sessions`. URL-shareable, back button works, server-renderable. |
| `SessionBreakdownList` `from` origin | **Add `'history'` to `QuestionOrigin`** | Clean provenance tracking. "Back to History" on question detail page. |

---

## 3. Architecture

### 3.1 Route Structure

```
/app/history                    ← NEW page (default tab: sessions)
/app/history?tab=sessions       ← Sessions tab (explicit)
/app/history?tab=missed         ← Missed Questions tab
/app/review                     ← permanent redirect → /app/history?tab=missed
```

### 3.2 Page Component Architecture

```
app/(app)/app/history/
├── page.tsx                    ← Server component (data fetching)
├── history-page-client.tsx     ← Client component (tab switching, session expand)
├── history-search-params.ts    ← Search param parsing + href builders
├── loading.tsx                 ← Loading state
├── error.tsx                   ← Error boundary
├── components/
│   ├── history-sessions-tab.tsx       ← Sessions list with expandable breakdowns
│   ├── history-missed-tab.tsx         ← Missed questions list (extracted from current ReviewView)
│   └── history-tab-bar.tsx            ← Tab bar component (Sessions | Missed Questions)
└── hooks/
    └── use-history-sessions.ts        ← Client-side session expand/collapse state
```

### 3.3 Data Flow

```
                    Server Component (page.tsx)
                   ┌─────────────────────────────┐
                   │ Parse ?tab=, limit, offset  │
                   │ Parse missed filters (opt): │
                   │   difficulty, tag           │
                   │ Fetch initial data:         │
                   │   tab=sessions → getSessionHistory({ limit, offset })
                   │   tab=missed  → getMissedQuestions({ limit, offset })
                   │ Pass to client component    │
                   └──────────┬──────────────────┘
                              │
                   ┌──────────▼────────────────────────┐
                   │ Client Component                  │
                   │ (history-page-client.tsx)         │
                   │                                   │
                   │ Tab bar: Sessions | Missed        │
                   │                                   │
                   │ Sessions tab:                     │
                   │   - Render session rows           │
                   │   - On expand: call               │
                   │     getPracticeSessionReview()    │
                   │   - Render SessionBreakdownList   │
                   │                                   │
                   │ Missed tab:                       │
                   │   - Render missed question cards  │
                   │   - Client-side filtering         │
                   │   - Pagination via links          │
                   └───────────────────────────────────┘
```

### 3.4 Reuse Strategy

| Component | Source | Reuse approach |
|-----------|--------|----------------|
| `SessionBreakdownList` | `app/(app)/app/practice/components/session-breakdown-list.tsx` | **Move** to `app/(app)/app/shared/components/session-breakdown-list.tsx`. Update all imports. Add `from` prop (default `'practice'`). |
| Session row rendering | `practice-session-history-panel.tsx` | **Extract pattern** into `history-sessions-tab.tsx`. Not a shared component — the History version will have pagination and different layout. |
| Missed questions rendering | `app/(app)/app/review/page.tsx` (`ReviewView`) | **Move** `ReviewView` logic into `history-missed-tab.tsx`. Delete old Review page. |
| Filter form (difficulty/tag) | `app/(app)/app/review/page.tsx` | **Move** into `history-missed-tab.tsx`. |

---

## 4. Phase Plan

### Phase 1: Create History Page (Sessions Tab)

**Goal:** `/app/history` exists with a functional Sessions tab showing all completed sessions with expandable breakdowns.

#### 4.1.1 Route Constants

**File:** `lib/routes.ts`

```typescript
// Add to ROUTES object:
APP_HISTORY: '/app/history',

// Add to QuestionOrigin union:
export type QuestionOrigin = 'dashboard' | 'review' | 'bookmarks' | 'practice' | 'history';
```

#### 4.1.2 Nav Items

**File:** `components/app-nav-items.ts`

Replace:
```typescript
{ href: ROUTES.APP_REVIEW, label: 'Review' },
```
With:
```typescript
{ href: ROUTES.APP_HISTORY, label: 'History' },
```

#### 4.1.3 Move `SessionBreakdownList` to Shared Location

**From:** `app/(app)/app/practice/components/session-breakdown-list.tsx`
**To:** `app/(app)/app/shared/components/session-breakdown-list.tsx`

**Changes:**
- Add `from` prop: `{ rows: PracticeSessionReviewRow[]; from?: QuestionOrigin }` (default `'practice'`)
- Use `from` in `toQuestionRoute(row.slug, { from })`
- Update all existing imports (2 files):
  - `app/(app)/app/practice/components/practice-session-history-panel.tsx`
  - `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

**Move test file too:**
**From:** `app/(app)/app/practice/components/session-breakdown-list.test.tsx`
**To:** `app/(app)/app/shared/components/session-breakdown-list.test.tsx`

#### 4.1.4 History Page — Server Component

**File:** `app/(app)/app/history/page.tsx`

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'History' };

type HistorySearchParams = {
  tab?: string;
  limit?: string;
  offset?: string;
  difficulty?: string;
  tag?: string;
};

// Parse tab from search params (default: 'sessions')
// Parse pagination (default: limit=20, offset=0)
// Parse missed filters (difficulty, tag) for client-side filtering
// If tab === 'missed': fetch getMissedQuestions({ limit, offset })
// If tab === 'sessions': fetch getSessionHistory({ limit, offset })
// Pass results + parsed values to HistoryPageClient
```

**Implementation note:** Put all search-param parsing and href-building helpers in `app/(app)/app/history/history-search-params.ts` by extracting the existing helpers from `app/(app)/app/review/page.tsx`.

**Server actions used:**
- `getSessionHistory` from `src/adapters/controllers/practice-controller.ts`
- `getMissedQuestions` from `src/adapters/controllers/review-controller.ts`

#### 4.1.4.1 History Page — Loading + Error

**File:** `app/(app)/app/history/loading.tsx`

Add a simple loading UI consistent with other app pages (e.g., "Loading history…", `aria-live="polite"`).

**File:** `app/(app)/app/history/error.tsx`

Add an error boundary using `ErrorBoundaryPage`, with:
- Title: "History error"
- Description: "We couldn't load your history right now. Please try again."
- Links: at least `{ href: ROUTES.APP_DASHBOARD, label: 'Back to Dashboard' }`

#### 4.1.5 History Page — Client Component

**File:** `app/(app)/app/history/history-page-client.tsx`

```typescript
'use client';

export type HistoryPageClientProps = {
  activeTab: 'sessions' | 'missed';
  // Sessions data (when tab=sessions):
  sessionsResult?: ActionResult<GetSessionHistoryOutput>;
  // Missed data (when tab=missed):
  missedResult?: ActionResult<GetMissedQuestionsOutput>;
  missedFilters?: ReviewFilters;
};
```

- Renders `HistoryTabBar` with active tab state
- Tab switching: `<Link>` to `/app/history?tab=sessions` or `/app/history?tab=missed` (full page navigation, server re-renders with correct data)
- Conditionally renders `HistorySessionsTab` or `HistoryMissedTab`

#### 4.1.6 Tab Bar

**File:** `app/(app)/app/history/components/history-tab-bar.tsx`

Simple component: two `<Link>` elements styled as tabs. Active tab gets `aria-current="page"` and bold styling. Uses `ROUTES.APP_HISTORY` with query params.

```typescript
export function HistoryTabBar({ activeTab }: { activeTab: 'sessions' | 'missed' }) {
  // "Sessions" link → /app/history?tab=sessions
  // "Missed Questions" link → /app/history?tab=missed
}
```

#### 4.1.7 Sessions Tab

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx`

```typescript
'use client';

export type HistorySessionsTabProps = {
  result: ActionResult<GetSessionHistoryOutput>;
};
```

**Renders:**
- Error state: `<ErrorCard>` with message
- Empty state: "No completed sessions yet." with link to Practice
- Session list: Each row shows `Mode • X/Y correct (accuracy%) • duration • date` with "View breakdown" / "Hide breakdown" toggle button
- Expanded session: `<SessionBreakdownList rows={review.rows} from="history" />`
- Pagination: "Previous" / "Next" links using `limit` and `offset` query params appended to `/app/history?tab=sessions`

**Client state:** `useHistorySessions` hook manages:
- `selectedSessionId: string | null`
- `selectedReview: GetPracticeSessionReviewOutput | null`
- `reviewLoadState: AsyncLoadStateWithIdle` (import from `app/(app)/app/shared/load-state.ts`; alias locally if desired)
- `onOpenSession(sessionId: string)` — toggles, calls `getPracticeSessionReview({ sessionId })` on expand

**Implementation notes for `useHistorySessions`:**
- Import `getPracticeSessionReview` from `@/src/adapters/controllers/practice-controller`
- Mirror the `useIsMounted` guard pattern from `usePracticeSessionHistory` to prevent state updates after unmount
- Toggle logic: if `selectedSessionId === sessionId`, set to `null` (collapse); otherwise fetch and expand

**Pagination note:** `GetSessionHistoryOutput` uses field name `total` for the total count, while `GetMissedQuestionsOutput` uses `totalCount`. Watch for this asymmetry when building pagination UI.

#### 4.1.8 Missed Questions Tab

**File:** `app/(app)/app/history/components/history-missed-tab.tsx`

This is the current `ReviewView` from `app/(app)/app/review/page.tsx`, extracted with minimal changes:

- Same card layout, same filters, same pagination
- `toQuestionRoute(row.slug, { from: 'history' })` instead of `{ from: 'review' }`
- `buildReviewHref` becomes `buildMissedHref` pointing to `/app/history?tab=missed&...`
- Same `getSessionOriginLabel` helper
- All pagination links use `/app/history?tab=missed&offset=...&limit=...`

**Helpers to extract from `review/page.tsx`:** Move the existing helper functions into `app/(app)/app/history/history-search-params.ts` so they can be reused by both the History server component and the Missed tab:
- `ReviewFilters` type (rename to something History-scoped if desired, e.g. `MissedFilters`)
- `parseNonNegativeInt`, `parseLimit`, `parseDifficultyFilter`, `parseTagSlugFilter`
- `buildReviewHref` → replace with History-scoped href builders:
  - `buildHistorySessionsHref({ limit, offset })` → `/app/history?tab=sessions&...`
  - `buildHistoryMissedHref({ limit, offset, filters })` → `/app/history?tab=missed&...`
- `getSessionOriginLabel`

In `app/(app)/app/history/page.tsx`, call these parsers and pass the parsed `limit`, `offset`, and filters down as props.

#### 4.1.9 Question Detail — Origin Support

**Files:**
- `app/(app)/app/questions/[slug]/question-page-client.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
- `app/(app)/app/questions/[slug]/error.tsx`

**`parseQuestionOrigin`** (question-page-client.tsx, ~line 15): Add `if (value === 'history') return value;` to handle the new origin.

**`getOriginUi`** (question-page-client.tsx, ~line 23): Add a `'history'` case:
```typescript
if (resolvedOrigin === 'history') {
  return {
    backHref: ROUTES.APP_HISTORY,
    backLabel: 'Back to History',
    subtitle: 'Reviewing a question from your history.',
  };
}
```

**`error.tsx`** (~line 20): Replace `{ href: ROUTES.APP_REVIEW, label: 'Back to Review' }` with `{ href: ROUTES.APP_HISTORY, label: 'Back to History' }`.

**Legacy `from=review` handling:** Keep the `'review'` case in `getOriginUi` but update its `backHref` from `ROUTES.APP_REVIEW` to `ROUTES.APP_HISTORY + '?tab=missed'` and label to `'Back to History'`. This avoids a redirect bounce when old `from=review` links are clicked.

**Test updates** (question-page-client.test.tsx): Add test for `from=history` rendering `'Back to History'` back link. Update existing `from=review` test to assert `'Back to History'` (since the label changes).

#### 4.1.10 Redirect

**File:** `next.config.ts`

Add redirect:
```typescript
async redirects() {
  return [
    {
      source: '/app/review',
      destination: '/app/history?tab=missed',
      permanent: true, // HTTP 308 (permanent redirect, equivalent to 301 for GET requests)
    },
  ];
},
```

**Order note:** Add this redirect only after `/app/history` (and the Missed tab) exists, otherwise `/app/review` will redirect to a 404 during incremental implementation/testing.

### Phase 2: Clean Up Practice Page

**Goal:** Remove "Recent sessions" panel from Practice page. Practice page becomes a pure session launcher.

#### 4.2.1 Remove from Practice Page Client

**File:** `app/(app)/app/practice/practice-page-client.tsx`

- Remove `PracticeSessionHistoryPanel` import and rendering
- Remove `sessionControls.sessionHistoryStatus`, `sessionControls.sessionHistoryRows`, `sessionControls.selectedHistorySessionId`, `sessionControls.selectedHistoryReview`, `sessionControls.historyReviewLoadState` usage

#### 4.2.2 Update Practice Route Exports

**File:** `app/(app)/app/practice/page.tsx`

Remove re-exports of `PracticeSessionHistoryPanel` and `PracticeSessionHistoryPanelProps`, since the history panel is deleted in this phase. (This file currently re-exports components/types from `./components`.)

#### 4.2.3 Remove Practice Session History Hook

**File:** `app/(app)/app/practice/hooks/use-practice-session-history.ts` — **DELETE**
**File:** `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx` — **DELETE**
**File:** `app/(app)/app/practice/hooks/use-practice-session-history.browser.spec.tsx` — **DELETE**

#### 4.2.4 Remove Practice Session History Panel

**File:** `app/(app)/app/practice/components/practice-session-history-panel.tsx` — **DELETE**
**File:** `app/(app)/app/practice/components/practice-session-history-panel.browser.spec.tsx` — **DELETE**

**File:** `app/(app)/app/practice/page.test.tsx`

Remove (or move) the unit tests that directly render `PracticeSessionHistoryPanel`. Equivalent behavior will be covered by the History sessions tab tests.

#### 4.2.5 Update `usePracticeSessionControls`

**File:** `app/(app)/app/practice/hooks/use-practice-session-controls.ts`

Remove the `usePracticeSessionHistory` composition and its return values.

#### 4.2.6 Update Components Barrel

**File:** `app/(app)/app/practice/components/index.ts`

Remove `PracticeSessionHistoryPanel` export. This barrel file exists and currently exports `PracticeSessionHistoryPanel` — it must be updated to avoid a broken import in `practice-page-client.tsx` (which imports from `'./components'`).

#### 4.2.7 Add "View History" Link to Session Summary

**File:** `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Add a third action button:
```typescript
<Button asChild variant="outline" className="rounded-full">
  <Link href={ROUTES.APP_HISTORY}>View in History</Link>
</Button>
```

Button order: "Back to Dashboard" (primary), "View in History" (outline), "Start another session" (outline).

### Phase 3: Slim Down Dashboard

**Goal:** Replace verbose "Recent activity" timeline with compact summary cards pointing to History.

#### 4.3.1 Data Fetching (No New Backend Code)

**Decision:** Do **not** add a new application-layer use case just to reshape dashboard data. Compose existing server actions in the Dashboard server component (outermost layer) to keep the change surface small and avoid new container wiring.

Use these existing server actions:
- `getUserStats({})` from `src/adapters/controllers/stats-controller.ts` (stats cards)
- `getSessionHistory({ limit: 3, offset: 0 })` from `src/adapters/controllers/practice-controller.ts` (recent sessions)
- `getMissedQuestions({ limit: 3, offset: 0 })` from `src/adapters/controllers/review-controller.ts` (recent missed)

Implementation note: call them in `Promise.all` to minimize total latency.

#### 4.3.2 Dashboard Page Update

**File:** `app/(app)/app/dashboard/page.tsx`

**Remove:**
- `groupRecentActivity` function
- All `RecentActivityGroup` / `RecentActivityRow` types
- The `<Card>` section rendering "Recent activity" with individual question rows

**Replace with:**
- "Recent sessions" section: 3 compact session cards (mode pill, score, date). Cards (or a "View all sessions" link) navigate to `/app/history?tab=sessions`.
- "Recent missed" section: 3 compact question cards (stem preview, difficulty badge, missed date). Each available row links to `toQuestionRoute(slug, { from: 'dashboard' })`. Unavailable rows render `[Question no longer available]` with no link. "View all missed" link → `/app/history?tab=missed`.

**Data source:** Keep `getUserStats` for stats cards; add calls to `getSessionHistory` and `getMissedQuestions` for the new compact sections.

---

## 5. Delete Old Review Page

After Phase 1 is complete:

**DELETE:** `app/(app)/app/review/page.tsx`
**DELETE:** `app/(app)/app/review/` directory

The redirect in `next.config.ts` handles any lingering URLs.

---

## 6. Files Summary

### New Files

| File | Purpose |
|------|---------|
| `app/(app)/app/history/page.tsx` | History server component |
| `app/(app)/app/history/history-page-client.tsx` | History client component |
| `app/(app)/app/history/history-search-params.ts` | Shared search-param parsing + href builders for History |
| `app/(app)/app/history/loading.tsx` | History loading state |
| `app/(app)/app/history/error.tsx` | History error boundary |
| `app/(app)/app/history/components/history-tab-bar.tsx` | Tab bar |
| `app/(app)/app/history/components/history-sessions-tab.tsx` | Sessions tab |
| `app/(app)/app/history/components/history-missed-tab.tsx` | Missed questions tab |
| `app/(app)/app/history/hooks/use-history-sessions.ts` | Session expand/collapse state |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | Moved + enhanced shared component |
| `app/(app)/app/shared/components/session-breakdown-list.test.tsx` | Moved test |

### Modified Files

| File | Change |
|------|--------|
| `lib/routes.ts` | Add `APP_HISTORY`, add `'history'` to `QuestionOrigin` |
| `components/app-nav-items.ts` | Replace Review → History |
| `components/app-nav-items.test.ts` | Update nav assertions for History |
| `next.config.ts` | Add `/app/review` → `/app/history?tab=missed` redirect |
| `app/(app)/app/practice/practice-page-client.tsx` | Remove history panel |
| `app/(app)/app/practice/page.tsx` | Remove history panel re-exports |
| `app/(app)/app/practice/page.test.tsx` | Remove history panel unit tests |
| `app/(app)/app/practice/hooks/use-practice-session-controls.ts` | Remove history hook composition |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | Add "View in History" link |
| `app/(app)/app/practice/components/practice-session-history-panel.tsx` | Import path update for `SessionBreakdownList` (temporary — deleted in Phase 2) |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | Import path update for `SessionBreakdownList` |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Add `'history'` to `parseQuestionOrigin` + `getOriginUi` (back link, subtitle) |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Add test for `from=history` back link |
| `app/(app)/app/questions/[slug]/error.tsx` | Update `ROUTES.APP_REVIEW` → `ROUTES.APP_HISTORY` |
| `app/(app)/app/dashboard/page.tsx` | Replace Recent Activity with compact cards |
| `app/(app)/app/dashboard/page.test.tsx` | Update for compact dashboard sections |
| `app/(app)/app/layout-shell.test.tsx` | Update nav href assertions (History) |
| `app/error-heading-styles.test.tsx` | Replace Review error coverage with History |

### Deleted Files

| File | Phase |
|------|-------|
| `app/(app)/app/review/` | Phase 1 (after History page is live) |
| `app/(app)/app/practice/components/practice-session-history-panel.tsx` | Phase 2 |
| `app/(app)/app/practice/components/practice-session-history-panel.browser.spec.tsx` | Phase 2 |
| `app/(app)/app/practice/hooks/use-practice-session-history.ts` | Phase 2 |
| `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx` | Phase 2 |
| `app/(app)/app/practice/hooks/use-practice-session-history.browser.spec.tsx` | Phase 2 |

---

## 7. Test Plan

### 7.1 Unit Tests (Vitest)

#### History Page — Server Component

**File:** `app/(app)/app/history/page.test.tsx`

```
// @vitest-environment jsdom
- renders Sessions tab heading when tab=sessions (default)
- renders Missed Questions tab heading when tab=missed
- passes session data to client component when tab=sessions
- passes missed data to client component when tab=missed
- renders error state when session history fetch fails
- renders error state when missed questions fetch fails
```

#### History Tab Bar

**File:** `app/(app)/app/history/components/history-tab-bar.test.tsx`

```
// @vitest-environment jsdom
- renders Sessions tab as active when activeTab=sessions
- renders Missed Questions tab as active when activeTab=missed
- Sessions link points to /app/history?tab=sessions
- Missed link points to /app/history?tab=missed
```

#### History Sessions Tab

**File:** `app/(app)/app/history/components/history-sessions-tab.test.tsx`

```
// @vitest-environment jsdom
- renders session rows with mode, score, accuracy, duration, date
- renders empty state when no sessions
- renders error card when result is error
- View breakdown button is visible for each session
```

#### History Missed Tab

**File:** `app/(app)/app/history/components/history-missed-tab.test.tsx`

```
// @vitest-environment jsdom
- renders missed question cards with stem preview, difficulty, date, session origin
- renders Reattempt link for each question pointing to /app/questions/{slug}?from=history
- renders difficulty and tag filter dropdowns
- renders empty state when no missed questions
- renders pagination links when totalCount > limit
- renders unavailable question placeholder when isAvailable=false
```

#### Session Breakdown List (moved)

**File:** `app/(app)/app/shared/components/session-breakdown-list.test.tsx`

Update existing tests:
```
- links use from='practice' by default
- links use from='history' when from prop is 'history'
```

#### Dashboard Page

**File:** `app/(app)/app/dashboard/page.test.tsx`

```
// @vitest-environment jsdom
- renders compact session summary cards (max 3)
- renders compact missed question cards (max 3)
- renders "View all sessions" link pointing to /app/history?tab=sessions
- renders "View all missed" link pointing to /app/history?tab=missed
- does not render individual question attempt rows
```

#### Navigation + Layout

**File:** `components/app-nav-items.test.ts`

- Update expected route order to include `ROUTES.APP_HISTORY` instead of `ROUTES.APP_REVIEW`
- Update `getActiveAppNavItemHref` assertions for `/app/history`

**File:** `app/(app)/app/layout-shell.test.tsx`

- Update nav href assertions to include `href="/app/history"` and remove `href="/app/review"`

**File:** `app/error-heading-styles.test.tsx`

- Replace `ReviewError` import/expectations with `HistoryError` (new file: `app/(app)/app/history/error.tsx`)

#### Practice Page Cleanup (Unit/Browser Specs)

When removing the Practice "Recent sessions" panel, delete/update the tests that target it:
- Delete: `app/(app)/app/practice/components/practice-session-history-panel.browser.spec.tsx`
- Delete: `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx`
- Delete: `app/(app)/app/practice/hooks/use-practice-session-history.browser.spec.tsx`
- Update: `app/(app)/app/practice/page.test.tsx` (remove `PracticeSessionHistoryPanel` render tests)

### 7.2 Browser Spec Tests (vitest-browser-react)

#### History Sessions Tab — Interactive

**File:** `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx`

```
- clicking View breakdown calls getPracticeSessionReview and shows breakdown
- clicking Hide breakdown collapses the breakdown
- clicking a different session collapses the previous one
```

### 7.3 E2E Tests (Playwright)

#### Update Existing

**File:** `tests/e2e/review.spec.ts` → rename to `tests/e2e/history.spec.ts`

```
- navigating to /app/review redirects to /app/history?tab=missed
- History page shows Sessions tab by default
- clicking Missed Questions tab shows missed questions
- missed questions show Reattempt link that works
- reattempting removes question from missed list after correct answer
- Sessions tab shows completed sessions
- expanding a session shows question breakdown with Correct/Incorrect/Unanswered
- clicking a question in breakdown navigates to question detail with from=history
```

**File:** `tests/e2e/core-app-pages.spec.ts`

Update the review page test:
- Navigate to `/app/history` instead of `/app/review`
- Update heading assertion from `'Review'` to `'History'`
- Update any `a[href*="review"]` selectors to `a[href*="history"]`
- Add assertion for `'Recent activity'` section removal from Dashboard (if the Dashboard test asserts its presence)

**File:** `tests/e2e/practice.spec.ts`

- Verify Practice page does NOT show "Recent sessions" section
- Verify session summary shows "View in History" link

---

## 8. Implementation Order

```
Phase 1A: Shared Infrastructure
  1. Add APP_HISTORY to lib/routes.ts + 'history' to QuestionOrigin
  2. Move SessionBreakdownList to app/(app)/app/shared/components, add 'from' prop
  3. Update SessionBreakdownList imports + moved test file

Phase 1B: History Page (Keep /app/review working while building)
  4. Create app/(app)/app/history/history-search-params.ts (extract helpers from Review page)
  5. Create history-tab-bar.tsx (test first)
  6. Create use-history-sessions.ts hook
  7. Create history-sessions-tab.tsx (test first)
  8. Create history-missed-tab.tsx (extract from ReviewView, test first)
  9. Create history-page-client.tsx
  10. Create history/page.tsx (server component)
  11. Create history/loading.tsx + history/error.tsx

Phase 1C: Rename + Redirect + Delete Review
  12. Update nav items (Review → History) + update components/app-nav-items.test.ts and app/(app)/app/layout-shell.test.tsx
  13. Update question detail origin UI for history + update app/(app)/app/questions/[slug]/question-page-client.test.tsx and app/(app)/app/questions/[slug]/error.tsx
  14. Add /app/review redirect in next.config.ts (after /app/history exists)
  15. Delete app/(app)/app/review/ directory + update app/error-heading-styles.test.tsx (Review → History)

Phase 2: Clean Practice Page
  16. Remove PracticeSessionHistoryPanel from practice-page-client.tsx
  17. Update app/(app)/app/practice/page.tsx exports
  18. Update usePracticeSessionControls to drop history state
  19. Update app/(app)/app/practice/components/index.ts exports
  20. Delete practice-session-history-panel.tsx + browser spec
  21. Delete use-practice-session-history.ts + its tests
  22. Update app/(app)/app/practice/page.test.tsx (remove history panel tests)
  23. Add "View in History" link to SessionSummaryView

Phase 3: Slim Dashboard (No backend additions)
  24. Update app/(app)/app/dashboard/page.tsx to render compact sections and call getSessionHistory/getMissedQuestions
  25. Update app/(app)/app/dashboard/page.test.tsx (remove Recent activity assertions)

Phase 4: E2E
  26. Update review.spec.ts → history.spec.ts
  27. Update core-app-pages.spec.ts
  28. Update practice.spec.ts
  29. Run full suite: pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:e2e
```

---

## 9. Acceptance Criteria

- [ ] `/app/history` loads with Sessions tab showing all completed sessions
- [ ] Clicking "View breakdown" expands a session inline showing question breakdown
- [ ] Clicking "Missed Questions" tab shows missed questions with filters and pagination
- [ ] `/app/review` permanently redirects (HTTP 308) to `/app/history?tab=missed`
- [ ] Nav sidebar shows "History" instead of "Review"
- [ ] Practice page has NO "Recent sessions" section
- [ ] Session summary view has "View in History" link
- [ ] Dashboard shows 3 compact session cards + 3 compact missed question cards
- [ ] Dashboard session cards link to `/app/history?tab=sessions`
- [ ] Dashboard missed cards link to individual question pages
- [ ] All question links from History use `?from=history`
- [ ] Question detail page "Back to History" link works
- [ ] `SessionBreakdownList` is in shared location and used by History breakdowns and the Practice session summary view
- [ ] All existing E2E tests pass (with updates for new routes)
- [ ] New E2E tests cover the History page flow
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:e2e` all pass

---

## 10. Non-Goals (Explicitly Out of Scope)

- **Session replay page** (`/app/history/[sessionId]`) — deferred to future spec. Session detail stays inline in the Sessions tab.
- **"Next question" on question detail page** — deferred (see `review-consistency-audit.md` I4).
- **Server-side filtering for missed questions** — deferred (GH #80). Client-side filtering works for now.
- **Analytics/performance charts** — deferred until we have enough data to justify a separate Analytics page.
- **Standardizing stem preview lengths** — deferred cosmetic fix (see `review-consistency-audit.md` I1).
- **Shared `QuestionListCard` component** — deferred (see `review-consistency-audit.md` I6). The Missed tab and Bookmarks page are similar but not identical enough to justify extraction in this pass.

---

## 11. Related

- **SPEC-014** (Review + Bookmarks) — The original Review page spec. This spec supersedes the Review page portion. Bookmarks page is unchanged.
- **SPEC-019** (Practice UX Redesign) — Phase 3 cross-page IA improvements are partially addressed here. Phase 4 practice page polish is complete.
- **Brainstorming:** `review-page-flow-audit.md` (vision), `review-consistency-audit.md` (inventory), `practice-engine-state-audit.md` (engine bugs — orthogonal to this spec)
- **BUG-129, BUG-130, BUG-131** — E2E selector fixes (committed, not related to this spec)
