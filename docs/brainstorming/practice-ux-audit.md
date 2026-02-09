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

### ~~Problem 1: Quick Practice Card Is Redundant~~ — DONE (PR #83)

> Implemented: Quick Practice card removed, session starter fills full width.

Quick Practice has its own nav tab. The card on the Practice page takes 50% of the page width to show a single link button. The Session Starter should use the full width.

**Fix:** Remove the Quick Practice card from the Practice page. The Session Starter takes full width.

**Files:**
- `app/(app)/app/practice/practice-page-client.tsx` — remove `QuickPracticeCard` and the 2-column grid layout, let session starter fill full width

### ~~Problem 2: Breakdown Questions Are Not Clickable~~ — DONE (PR #83)

> Implemented: `slug` added to `PracticeSessionReviewRow`, questions now render as `<Link>` via shared `SessionBreakdownList`.

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

### ~~Problem 3: Breakdown Cannot Be Collapsed~~ — DONE (PR #83)

> Implemented: Toggle behavior added. Button shows "View breakdown" / "Hide breakdown".

Clicking "View breakdown" opens the question list. Clicking the same button again (now labeled "Refresh breakdown") just re-fetches the same data. There's no way to collapse/hide the breakdown once opened.

**Fix:** Toggle behavior — if the selected session is already open, clicking its button should collapse it (set `selectedSessionId = null`).

**Files:**
- `app/(app)/app/practice/hooks/use-practice-session-history.ts` — toggle logic in `onOpenSessionHistory`
- `app/(app)/app/practice/components/practice-session-history-panel.tsx` — button label: show "View breakdown" when collapsed, "Hide breakdown" when expanded

### ~~Problem 4: Session History Panel and Session Summary View Are Copy-Pasted~~ — DONE (PR #83)

> Implemented: Shared `SessionBreakdownList` extracted. Both `PracticeSessionHistoryPanel` and `SessionSummaryView` use it.

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

### ~~Problem 5: Breakdown Renders Below ALL Sessions (Not Inline)~~ — DONE (dd51513)

> Implemented: Breakdown now renders inline inside the selected session's `<li>`. "Session breakdown" heading removed.

The "Session breakdown" section (lines 108-130 of `practice-session-history-panel.tsx`) renders **outside** the session list `<ul>`. When you click "View breakdown" on the first session, the breakdown list appears at the bottom of the entire card, below all 4 sessions. It should render **inside** the `<li>` of the selected session, directly beneath the session row you clicked.

**Current structure (broken):**
```
<ul>
  <li>Exam session row [Hide breakdown]</li>
  <li>Tutor session row [View breakdown]</li>
  <li>Tutor session row [View breakdown]</li>
  <li>Tutor session row [View breakdown]</li>
</ul>
<div>Session breakdown</div>   ← always at the bottom
<SessionBreakdownList />       ← disconnected from clicked session
```

**Target structure (fixed):**
```
<ul>
  <li>
    Exam session row [Hide breakdown]
    <SessionBreakdownList />   ← directly beneath this session
  </li>
  <li>Tutor session row [View breakdown]</li>
  <li>Tutor session row [View breakdown]</li>
  <li>Tutor session row [View breakdown]</li>
</ul>
```

**Files:**
- `app/(app)/app/practice/components/practice-session-history-panel.tsx` — move breakdown rendering inside the `.map()` loop, conditionally render when `selectedSessionId === row.sessionId`

### ~~Problem 6: Session Rows Have No Date~~ — DONE (dd51513)

> Implemented: `formatDate(row.endedAt)` added as fourth bullet segment on every session row. Aria-label updated.

`SessionHistoryRow` has `startedAt` and `endedAt` (ISO strings from backend) but neither is displayed. Users see `Exam • 0/20 correct (0%) • 1m 2s` with no indication of *when* the session occurred. For a history panel, this is critical context.

**Current:** `Exam • 0/20 correct (0%) • 1m 2s`
**Target:** `Exam • 0/20 correct (0%) • 1m 2s • Feb 9, 2026`

**Files:**
- `app/(app)/app/practice/components/practice-session-history-panel.tsx` — add formatted date from `row.endedAt`
- May need a `formatDate` utility (check if one already exists in `lib/`)

### ~~Problem 7: Breakdown Status Labels Are Unstyled and Flat~~ — DONE (dd51513)

> Implemented: "Answered" label dropped. Correct=`text-emerald-500`, Incorrect=`text-destructive`, Unanswered=`text-muted-foreground/60`. Propagates to SessionSummaryView for free.

The breakdown list shows `Answered Incorrect` or `Unanswered` as plain gray text inline with the question stem. There's no visual differentiation — correct and incorrect look the same. The labels blend into the stem text rather than standing out as status indicators.

**Current:** `1. In the COMBINE study, patients who received only a specialist behavioral inte... Answered Incorrect`
**Target:** Status labels should be visually distinct from stem text — consider subtle color or badge treatment for Correct (green) vs Incorrect (red/destructive) vs Unanswered (muted).

**Files:**
- `app/(app)/app/practice/components/session-breakdown-list.tsx` — add color/style differentiation to status labels

---

## Status Summary

| Problem | Status | PR |
|---------|--------|-----|
| 1. Quick Practice card redundant | DONE | #83 |
| 2. Breakdown questions not clickable | DONE | #83 |
| 3. Breakdown can't be collapsed | DONE | #83 |
| 4. Copy-pasted breakdown JSX | DONE | #83 |
| 5. Breakdown below all sessions | DONE | dd51513 |
| 6. No date on session rows | DONE | dd51513 |
| 7. Breakdown labels unstyled | DONE | dd51513 |

---

## Implementation Plan (Phase 1-4: DONE)

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

### ~~Problem 8: Active Session View Has Vestigial Quick Practice Copy and Scattered Layout~~ — DONE

> Implemented: All 5 sub-problems resolved.

The active session page (`/app/practice/[sessionId]`) had vestigial Quick Practice defaults and scattered button layout.

**Full analysis:** See `session-view-layout-audit.md`

**Sub-problems (all resolved):**
- ~~A. "Practice" / "Answer one question at a time" copy shown in exam/tutor sessions~~ — DONE. Title now "Tutor Session" / "Exam Session". Description integrates progress: "Question 2 of 20 — Explanations shown after each answer."
- ~~B. Mark for Review + Bookmark buttons floating above question~~ — DONE. Moved to bottom action bar alongside Submit/Next Question.
- ~~C. "Review answers" and "Back to Dashboard" both visible~~ — DONE. "Back to Dashboard" hidden when session is active; only "End session" / "Review answers" shows.
- ~~D. "Session: exam • 6/20" text is tiny and low-contrast~~ — DONE. Removed; progress integrated into description at normal text size.
- ~~E. Question navigator doesn't distinguish answered vs unanswered~~ — DONE. Answered questions use `secondary` variant (filled), unanswered use `outline`.

**Files:** `practice-view.tsx`, `practice-session-page-view.tsx`, `exam-review-view.tsx`

---

## Status Summary (Updated)

| Problem | Status | PR | Scope |
|---------|--------|-----|-------|
| 1. Quick Practice card redundant | DONE | #83 | Practice page |
| 2. Breakdown questions not clickable | DONE | #83 | Practice page |
| 3. Breakdown can't be collapsed | DONE | #83 | Practice page |
| 4. Copy-pasted breakdown JSX | DONE | #83 | Practice page |
| 5. Breakdown below all sessions | DONE | dd51513 | Recent sessions panel |
| 6. No date on session rows | DONE | dd51513 | Recent sessions panel |
| 7. Breakdown labels unstyled | DONE | dd51513 | SessionBreakdownList |
| 8. Session view layout/copy | DONE | — | Active session page |

---

## Open Questions (Deferred)

1. ~~Should breakdown show green/red color coding for correct/incorrect?~~ → Promoted to Problem 7 (TODO)
2. Should Recent Sessions show more than 10 sessions or add "Load more"? (Low priority)
3. Should the shared `SessionBreakdownList` also be used in ExamReviewView? (Different enough — has "Open question" button + marked-for-review, so probably not)
4. **Session Review Mode:** Should clicking a session breakdown open a "session replay" page that mirrors the tutor/exam experience but in review mode — showing all questions in context with navigation, rather than linking to individual question pages one at a time? This would be a new route like `/app/practice/[sessionId]/review` that shows each question in sequence with the user's original answer and the explanation. This is a larger feature that would require a new page and data flow, but it's the natural evolution of the breakdown panel. (See also `review-consistency-audit.md` I5: Session Context Is Lost on Question Detail Page.)
