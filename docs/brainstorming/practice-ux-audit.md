# Practice UX Audit & Brainstorming

**Date:** 2026-02-09
**Triggered by:** Visual review of live app screenshots
**Scope:** Practice page and Quick Practice — scoped to these two pages only. Review/Dashboard/Bookmarks consistency is a separate follow-up.

---

## Decision: Quick Practice Is Done

Quick Practice (`/app/practice/quick`) works as intended:
- One random question at a time, no session tracking, just drill
- Submit → see feedback → Next Question → repeat
- Bookmark available, "Back to Practice" link works
- Has its own nav tab — fine, users can discover it there

**No changes needed to Quick Practice itself.**

---

## Practice Page — Current State

**Route:** `/app/practice`
**Component:** `PracticePageClient` in `practice-page-client.tsx`

### Layout (3 sections):

**Section 1 — Session Starter (left column):**
- Tutor/Exam mode toggle
- Question count input (default 20)
- Difficulty filter (Easy/Medium/Hard, multi-select)
- Tag filter accordions: Exam Section, Substance, Topic, Treatment (multi-select each)
- "Start session" button
- Shows `IncompleteSessionCard` if a session is in progress (Resume / Abandon)
- **Status: Works fine. No changes needed.**

**Section 2 — Quick Practice Card (right column):**
- Title: "Quick Practice"
- Description: "Answer one question at a time. No session tracking — just jump in and practice."
- Single CTA: "Quick Practice →" button linking to `/app/practice/quick`
- **Status: Redundant. Quick Practice already has its own nav tab. This card wastes half the page width for a single button.**

**Section 3 — Recent Sessions (below, full width):**
- Title: "Recent sessions" / "Review recent completed sessions and open question breakdown."
- Shows last 10 completed Tutor/Exam sessions
- Each row: `Tutor • 1/20 correct (100%) • 1m 20s` with `View breakdown` button
- Clicking `View breakdown` fetches `GetPracticeSessionReviewOutput` and renders question list inline
- **Status: Broken UX — see problems below.**

---

## Problems (Practice Page Only)

### Problem 1: Quick Practice Card Is Redundant

Quick Practice has its own nav tab. The card on the Practice page takes 50% of the page width to show a single link button. The Session Starter should use the full width.

**Fix:** Remove the Quick Practice card from the Practice page. The Session Starter takes full width.

**Files:**
- `app/(app)/app/practice/practice-page-client.tsx` — remove `QuickPracticeCard` and the 2-column grid layout, let session starter fill full width

### Problem 2: Breakdown Questions Are Not Clickable

Every other page in the app (Dashboard, Review, Bookmarks) lets you click a question to navigate to it. The Practice page's session breakdown renders questions as plain `<li>` text with no links. This is the most visible UX dead-end.

**Root cause:** `PracticeSessionReviewRow` (the backend data type) does NOT include `slug`. Every other data type does:
- `RecentActivityRow` (Dashboard) → has `slug` ✅
- `MissedQuestionRow` (Review) → has `slug` ✅
- `BookmarkRow` (Bookmarks) → has `slug` ✅
- `PracticeSessionReviewRow` (Practice/Summary) → **missing `slug`** ❌

**Fix (backend):** Add `slug: string` to `AvailablePracticeSessionReviewRow` type and populate it from the question entity in `GetPracticeSessionReviewUseCase`.

**Fix (frontend):** Wrap question stems in `<Link href={toQuestionRoute(row.slug, { from: 'practice' })}>` in both:
- `PracticeSessionHistoryPanel` (Recent Sessions on practice page)
- `SessionSummaryView` (after ending a session)

**Files:**
- `src/application/use-cases/get-practice-session-review.ts` — add `slug` to type + map
- `app/(app)/app/practice/components/practice-session-history-panel.tsx` — add `<Link>` to question rows
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` — add `<Link>` to question rows

### Problem 3: Breakdown Cannot Be Collapsed

Clicking "View breakdown" opens the question list. Clicking the same button again (now labeled "Refresh breakdown") just re-fetches the same data. There's no way to collapse/hide the breakdown once opened.

**Fix:** Toggle behavior — if the selected session is already open, clicking its button should collapse it (set `selectedSessionId = null`).

**Files:**
- `app/(app)/app/practice/hooks/use-practice-session-history.ts` — toggle logic in `onOpenSessionHistory`
- `app/(app)/app/practice/components/practice-session-history-panel.tsx` — button label: show "View breakdown" when collapsed, "Hide breakdown" when expanded

### Problem 4: Session History Panel and Session Summary View Are Copy-Pasted

These two components render **identical** JSX for the question breakdown list:

```
<li>
  <span>{order}.</span>
  <span>{stemPreview or '[Question no longer available]'}</span>
  <span>{isAnswered ? 'Answered' : 'Unanswered'}</span>
  <span>{isCorrect ? 'Correct' : 'Incorrect'}</span>
</li>
```

Both use `PracticeSessionReviewRow` data. Both are non-interactive. Both will need the same `<Link>` change in Problem 2.

**Fix:** Extract a shared `SessionBreakdownList` component that both can import. This component accepts `GetPracticeSessionReviewOutput` rows and renders the clickable question list.

**Files:**
- Create `app/(app)/app/practice/components/session-breakdown-list.tsx` (shared component)
- `app/(app)/app/practice/components/practice-session-history-panel.tsx` — import and use shared component
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` — import and use shared component

---

## Implementation Plan

### Phase 1: Backend — Add `slug` to PracticeSessionReviewRow

**TDD approach:**

1. **Test:** In `get-practice-session-review.test.ts`, assert that the available row includes `slug` matching the question's slug
2. **Type:** Add `slug: string` to `AvailablePracticeSessionReviewRow` in `get-practice-session-review.ts`
3. **Map:** Populate `slug: question.slug` in the `available()` enrichment function

**Blast radius:** The `GetPracticeSessionReviewOutput` type flows to:
- `PracticeSessionHistoryPanel` (practice page)
- `SessionSummaryView` (session summary)
- `ExamReviewView` (exam review — already has interactive buttons via `questionId`, this adds slug for free)
- `usePracticeSessionHistory` hook
- `usePracticeSessionSummaryReview` hook
- Controller: `getPracticeSessionReview` server action

All consumers already handle the available/unavailable discriminated union. Adding `slug` to the available variant is additive — zero breaking changes.

### Phase 2: Frontend — Extract SharedSessionBreakdownList component

**TDD approach:**

1. **Test:** Write `session-breakdown-list.test.tsx` — renders question order, stem preview, answered/unanswered status, correct/incorrect label, clickable links for available questions, "[Question no longer available]" for unavailable
2. **Component:** Create `SessionBreakdownList` accepting `{ rows: PracticeSessionReviewRow[] }`
3. **Each available row:** `<Link href={toQuestionRoute(slug, { from: 'practice' })}>`
4. **Each unavailable row:** Plain text "[Question no longer available]"

### Phase 3: Frontend — Wire Up Practice Page

**Changes:**

1. **Remove Quick Practice card:**
   - Remove `QuickPracticeCard` from `practice-page-client.tsx`
   - Remove the 2-column grid — session starter fills full width
   - Keep the Quick Practice nav tab in `app-nav-items.ts` (unchanged)

2. **Use `SessionBreakdownList` in `PracticeSessionHistoryPanel`:**
   - Replace inline `<ul>` breakdown rendering with `<SessionBreakdownList rows={...} />`
   - Questions become clickable links

3. **Toggle breakdown collapse:**
   - In `usePracticeSessionHistory.ts`: if `selectedSessionId === sessionId`, set to `null` (collapse)
   - Update button label: "View breakdown" (collapsed) / "Hide breakdown" (expanded)

4. **Use `SessionBreakdownList` in `SessionSummaryView`:**
   - Replace inline `<ul>` breakdown rendering with `<SessionBreakdownList rows={...} />`
   - Questions become clickable links

### Phase 4: Tests

- Update `practice-session-history-panel.browser.spec.tsx` — verify clickable links, toggle behavior
- Update `session-summary-view.browser.spec.tsx` — verify clickable links
- Update `get-practice-session-review.test.ts` — verify `slug` field
- New `session-breakdown-list.test.tsx` — shared component tests

---

## File Change Summary

| File | Change |
|------|--------|
| `src/application/use-cases/get-practice-session-review.ts` | Add `slug` to type + enrichment |
| `app/(app)/app/practice/components/session-breakdown-list.tsx` | **NEW** — shared breakdown component |
| `app/(app)/app/practice/components/session-breakdown-list.test.tsx` | **NEW** — tests |
| `app/(app)/app/practice/components/practice-session-history-panel.tsx` | Use shared component, update button labels |
| `app/(app)/app/practice/hooks/use-practice-session-history.ts` | Toggle logic |
| `app/(app)/app/practice/practice-page-client.tsx` | Remove Quick Practice card, full-width starter |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | Use shared component |
| Existing test files | Update assertions for new behavior |

---

## Scope Boundary

**In scope (this work):**
- Practice page layout (remove QP card, full-width starter)
- Clickable breakdown questions (backend + frontend)
- Breakdown toggle collapse
- Shared `SessionBreakdownList` component
- Tests for all changes

**Out of scope (future work):**
- Review page consistency (GH #80 server-side filtering, etc.)
- Dashboard ↔ Practice session linking improvements
- Breakdown color coding for correct/incorrect
- Pagination of recent sessions
- Quick Practice page changes (confirmed working as-is)
- Renaming the Review nav tab

---

## Post-Implementation Cleanup Checklist

After Phase 4 is implemented, verify NO vestigial slop remains:

- [ ] `QuickPracticeCard` component file is deleted (not just unused)
- [ ] No imports of `QuickPracticeCard` remain anywhere
- [ ] The 2-column grid layout (`grid-cols-2` or similar) is removed from `practice-page-client.tsx`
- [ ] `usePracticeSessionControls` or parent hooks don't wire up Quick Practice state that's no longer consumed
- [ ] Tests that asserted Quick Practice card renders on the practice page are removed/updated
- [ ] The inline breakdown JSX in `practice-session-history-panel.tsx` is fully replaced by `SessionBreakdownList` (not duplicated alongside it)
- [ ] The inline breakdown JSX in `session-summary-view.tsx` is fully replaced by `SessionBreakdownList` (not duplicated alongside it)
- [ ] No orphaned imports (`getStemPreview` in files that now delegate to the shared component, etc.)
- [ ] `pnpm lint` catches any unused imports/variables (Biome enforces this)
- [ ] `pnpm typecheck` catches any type mismatches from the `slug` addition

---

## Open Questions (Deferred)

1. Should breakdown show green/red color coding for correct/incorrect? (UX polish, can add later)
2. Should Recent Sessions show more than 10 sessions or add "Load more"? (Low priority)
3. Should the shared `SessionBreakdownList` also be used in ExamReviewView? (Different enough — has "Open question" button + marked-for-review, so probably not)
