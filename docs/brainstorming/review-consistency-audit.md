# Cross-Page Review Consistency Audit

**Date:** 2026-02-09
**Scope:** Every place in the app where a user views/reviews questions they've interacted with
**Relationship:** Parallel rail to `practice-ux-audit.md` — this documents the consistency problems; Practice page fixes come first.

---

## Current State: 7 Question Display Locations

### Location 1: Dashboard — Single Question Rows

**File:** `app/(app)/app/dashboard/page.tsx` (lines 163-200)
**Container:** `<li>` → `<Link>` (compact clickable row, hover highlight)
**Data shown:**
- Stem preview: **100 chars**
- Difficulty: YES — title-case badge (`Easy`, `Medium`, `Hard`) in rounded pill
- Correct/Incorrect: YES — text label
- Date: NO
- Session origin: NO
- Order number: NO

**Actions:** Full row is a `<Link>` → `/app/questions/[slug]?from=dashboard`
**Unavailable:** Plain text `[Question no longer available]` + correct/incorrect, no link

### Location 2: Dashboard — Session-Grouped Question Rows

**File:** `app/(app)/app/dashboard/page.tsx` (lines 222-260)
**Container:** Same as Location 1 but nested inside a session group card
**Data shown:**
- Stem preview: **90 chars** (inconsistent with single question's 100)
- Difficulty: YES — same badge style as Location 1
- Correct/Incorrect: YES — text label
- Date: NO
- Session origin: Implicit (parent group shows "Tutor session" / "Exam session" header)
- Order number: NO

**Actions:** Full row is a `<Link>` → `/app/questions/[slug]?from=dashboard`
**Session header:** `<Link>` → `/app/practice/[sessionId]`
**Unavailable:** Same as Location 1

### Location 3: Review — Missed Question Cards

**File:** `app/(app)/app/review/page.tsx` (lines 254-345)
**Container:** `<li>` → `<Card>` (full card with padding, shadow)
**Data shown:**
- Stem preview: **80 chars** (title link)
- Full stem: YES — shown below title if > 80 chars
- Difficulty: YES — lowercase via `capitalize` CSS (`easy`, `medium`, `hard`)
- Correct/Incorrect: NO (all are incorrect by definition)
- Date: YES — `Missed {formatDate(lastAnsweredAt)}`
- Session origin: YES — "Tutor session" / "Exam session" / "Ad-hoc practice"
- Order number: NO

**Metadata line:** `{difficulty} • Missed {date} • {sessionOrigin}`
**Actions:** Stem title is `<Link>` + separate "Reattempt" `<Button>` → `/app/questions/[slug]?from=review`
**Unavailable:** `[Question no longer available]` + explanation text + metadata line with "Unavailable" + date + origin. No reattempt button.

### Location 4: Bookmarks — Bookmarked Question Cards

**File:** `app/(app)/app/bookmarks/page.tsx` (lines 133-254)
**Container:** `<li>` → `<Card>` (same card style as Review)
**Data shown:**
- Stem preview: **80 chars** (title link)
- Full stem: YES — shown below title if > 80 chars
- Difficulty: YES — lowercase via `capitalize` CSS
- Correct/Incorrect: NO
- Date: YES — `Bookmarked {formatDate(bookmarkedAt)}`
- Session origin: NO
- Order number: NO

**Metadata line:** `{difficulty} • Bookmarked {date}`
**Actions:** Stem title is `<Link>` + "Reattempt" `<Button>` + "Remove" `<Button>` (with AlertDialog) → `/app/questions/[slug]?from=bookmarks`
**Unavailable:** Same pattern as Review but no session origin. Remove button still available.

### Location 5: Practice — Recent Sessions Breakdown (UPDATED after PR #83)

**File:** `app/(app)/app/practice/components/practice-session-history-panel.tsx` → delegates to `session-breakdown-list.tsx`
**Container:** `<li>` → `<Link>` (clickable row via shared `SessionBreakdownList`)
**Data shown:**
- Stem preview: **80 chars**
- Difficulty: NO
- Correct/Incorrect: YES — "Correct" / "Incorrect" text (only if answered)
- Answered/Unanswered: YES
- Date: NO (session row now shows date — **Problem 6 DONE, dd51513**)
- Session origin: Implicit (parent session row shows mode)
- Order number: YES — `{order}.`

**Actions:** Full question row is a `<Link>` → `/app/questions/[slug]?from=practice` (added in PR #83)
**Unavailable:** `[Question no longer available]` text, no link
**Known issues:** All resolved.
- ~~Breakdown renders below ALL sessions~~ — **Problem 5 DONE (dd51513)**
- ~~Status labels unstyled~~ — **Problem 7 DONE (dd51513)**

### Location 6: Practice — Session Summary Breakdown (Post-Session) (UPDATED after PR #83)

**File:** `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` → delegates to `session-breakdown-list.tsx`
**Container:** Same as Location 5 — shared `SessionBreakdownList`
**Data shown:** IDENTICAL to Location 5
**Actions:** Same as Location 5 — clickable links via shared component (added in PR #83)
**Unavailable:** Same as Location 5

### Location 7: Practice — Exam Review (Pre-Submit)

**File:** `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` (lines 119-167)
**Container:** `<li>` → `<Card>` (card style, similar to Review/Bookmarks)
**Data shown:**
- Stem preview: **96 chars** (unique length)
- Difficulty: NO
- Correct/Incorrect: YES (only if answered AND tutor mode reveals it)
- Answered/Unanswered: YES
- Marked for review: YES — "Marked for review" / "Not marked"
- Date: NO
- Order number: YES — `{order}.`

**Metadata line:** `{answered} • {marked} [• {correct/incorrect}]`
**Actions:** "Open question" `<Button>` (onClick, not Link — navigates within session)
**Unavailable:** Text + order preserved, button hidden

---

## Divergence Matrix

| Property | Dashboard Single | Dashboard Session | Review | Bookmarks | Practice Breakdown | Session Summary | Exam Review |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Stem chars | 100 | 90 | 80 | 80 | 80 | 80 | 96 |
| Full stem below | - | - | YES | YES | - | - | - |
| Difficulty | Badge (title) | Badge (title) | Text (lower) | Text (lower) | - | - | - |
| Correct/Incorrect | YES | YES | - | - | YES | YES | Conditional |
| Date | - | - | Missed date | Bookmark date | - | - | - |
| Session origin | - | Implicit | YES | - | Implicit | - | - |
| Order # | - | - | - | - | YES | YES | YES |
| Marked | - | - | - | - | - | - | YES |
| Container | Link row | Link row | Card | Card | Link row | Link row | Card |
| Clickable | YES | YES | YES (2 paths) | YES (2 paths) | YES (PR #83) | YES (PR #83) | YES (button) |

---

## Identified Inconsistencies

### I1: Stem Preview Length Is Arbitrary

Five different stem lengths across 7 locations: 100, 90, 80, 96, 80. No rationale for the variation.

**Recommendation:** Standardize to **80 chars** everywhere. It's the most common value and works for both compact rows and cards. Exception: ExamReviewView at 96 is fine (different context, wider cards during active exam).

### I2: Difficulty Display Format Differs

- Dashboard: Title-case in a rounded pill badge (`Easy`, `Medium`, `Hard`)
- Review/Bookmarks: Lowercase with CSS `capitalize` → renders as `Easy` but source is `easy`
- Practice breakdowns: NOT shown at all

**Recommendation:** When difficulty is shown, use the same display approach everywhere. The Dashboard badge pattern is more scannable. But this is cosmetic — not blocking.

### ~~I3: Practice Breakdowns Are Non-Interactive Dead Ends~~ — FIXED (PR #83)

Questions in breakdowns are now clickable `<Link>` elements via shared `SessionBreakdownList`. Both Practice history panel and Session summary view use the shared component. Remaining issues: breakdown placement (Problem 5), date display (Problem 6), label styling (Problem 7) — tracked in `practice-ux-audit.md`.

### I4: Question Page Is a Single-Question Dead End

After navigating to `/app/questions/[slug]?from=X`:
- You see the question, submit an answer, see feedback
- You can "Try Again" (same question, reset state)
- You can go "Back to [Origin]"
- **There is NO "Next Question" capability**

If you came from Review and want to work through all your missed questions, you must: answer → back to Review → click next question → answer → back to Review → repeat. Each round trip reloads the full Review page.

**This isn't broken per se, but it's clunky for power users.**

**Recommendation (future):** Consider a "Next missed question" button on the question page when `from=review`, or a "Next bookmarked question" when `from=bookmarks`. Out of scope for Practice page fixes.

### I5: Session Context Is Lost on Question Detail Page

When clicking a question from the Dashboard's session group:
- The question link uses `from=dashboard`, NOT `from=practice`
- The session ID is NOT carried to the question page
- The question page has no concept of "you're reviewing question 3 of 20 from Tutor session X"

**Recommendation (future):** If we want session-aware review, the question page would need `sessionId` + `questionIndex` params. This is a larger feature. Out of scope.

### I6: Review and Bookmarks Card Patterns Are 70% Identical

Review cards:
```
[Title link (80 chars)]
[Full stem if > 80 chars]
[difficulty • Missed {date} • {sessionOrigin}]     [Reattempt button]
```

Bookmarks cards:
```
[Title link (80 chars)]
[Full stem if > 80 chars]
[difficulty • Bookmarked {date}]                    [Reattempt] [Remove]
```

The structure is the same: title → optional body → metadata line → action buttons. Only the metadata fields and action buttons differ.

**Recommendation:** Extract a shared `QuestionListCard` component that accepts:
- `title` (stem preview)
- `body` (full stem, optional)
- `metadata` (array of `{ label: string }` segments joined by bullets)
- `href` (link target for title and reattempt)
- `actions` (slot for additional buttons like Remove)
- `unavailable` variant

This would DRY up Review and Bookmarks. The Dashboard's compact row pattern is different enough (no card, no body text) that it shouldn't use this component.

### I7: Unavailable Question Handling Varies

- Dashboard: `[Question no longer available]` + correct/incorrect label, no link
- Review: `[Question no longer available]` + explanation + full metadata line + no reattempt button
- Bookmarks: Same as Review but Remove button stays
- Practice breakdowns: `[Question no longer available]` text only
- Exam Review: Order number preserved, button hidden

**Recommendation:** The variation is acceptable — each context shows what's relevant. No change needed.

---

## What Should Be Done (And When)

### ~~Now (Practice Page Fix — Phase 1)~~ — DONE (PR #83)

All 5 items completed:

1. ~~Remove Quick Practice card from Practice page~~ DONE
2. ~~Add `slug` to `PracticeSessionReviewRow` (backend)~~ DONE
3. ~~Extract `SessionBreakdownList` shared component (Practice + Summary)~~ DONE
4. ~~Make breakdown questions clickable (`<Link>`)~~ DONE
5. ~~Toggle breakdown collapse~~ DONE

### ~~Now (Practice Page Fix — Phase 2)~~ — DONE (dd51513)

All three items completed:

1. ~~Move breakdown inline under selected session~~ DONE
2. ~~Add date to session rows~~ DONE
3. ~~Style breakdown status labels~~ DONE

### Later (Cross-Page Consistency — this doc):

These are improvements that can be done after Practice is fixed:

| Priority | Fix | Pages Affected | Effort |
|----------|-----|---------------|--------|
| P1 | Standardize stem preview to 80 chars | Dashboard (100→80, 90→80) | Small |
| P2 | Extract shared `QuestionListCard` for Review + Bookmarks | Review, Bookmarks | Medium |
| P3 | Standardize difficulty display format | Dashboard, Review, Bookmarks | Small |
| P4 | Add "Next question" to question detail page for Review/Bookmarks flows | Question page, Review, Bookmarks | Medium |
| P5 | Carry session context to question detail page from Dashboard | Dashboard, Question page | Medium |

**P1-P3 are cosmetic polish.** They reduce divergence but don't fix broken functionality.
**P4-P5 are UX improvements.** They reduce round-trips but aren't blocking.

---

## Guard Rails for Practice Page Work

When implementing the Practice page fixes from `practice-ux-audit.md`, these rules prevent creating new inconsistencies:

1. **`SessionBreakdownList` should use 80-char stem previews** — matches Review/Bookmarks
2. **Links should use `from: 'practice'` origin** — the origin type already supports it
3. **Unavailable questions should show `[Question no longer available]` with no link** — matches existing pattern
4. **Do NOT add difficulty badges to the breakdown** — the parent session row already shows the mode; adding difficulty per-question is noise in this context
5. **Do NOT add date metadata to the breakdown** — the parent session row already shows duration and timing
6. **Do NOT refactor Review or Bookmarks in this pass** — that's the separate rail documented here

---

## Relationship to Existing Specs

- **SPEC-019** (Practice & Navigation UX Redesign): Marked as "Implemented" — the Practice page fixes are a post-implementation polish pass, not a new spec
- **SPEC-020** (Practice Engine Completion): Marked as "Implemented" — same, these are refinements
- **GH #80**: Server-side review filtering — separate concern, not blocked by this work
- **GH #81**: E2E tests for Phase 3 — should cover the new breakdown behavior after Practice fixes

**Recommendation:** These Practice page fixes should be tracked as a new GitHub issue (not a new spec). The cross-page consistency improvements documented here can become their own issue when we're ready to tackle them.
