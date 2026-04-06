# BS-061: Review Surface Divergence Audit — Three Different "Review Your Answers" Experiences

**Date:** 2026-04-06
**Triggered by:** User walkthrough of the exam flow end-to-end. After submitting an exam, clicking "Review your answers" from the Session Summary leads to a different review experience than the pre-submit review flow, and both differ from the History page's review. The user described it as "sloppified" — subtly different button arrangements, bookmark placement, navigation options, and page headers across three surfaces that should feel like the same experience.
**Scope:** Audit all question-review surfaces, catalog their divergences, assess whether a page/surface registry would prevent future drift, and determine which inconsistencies are bugs vs intentional context differences.
**Related:** [BS-059](./bs-059-practice-session-action-bar-button-arrangement.md) (action bar button arrangement on question-page-client), [BS-052](./bs-052-bookmark-icon-toggle-replacement.md) (bookmark icon toggle), [DEBT-330 (archived)](../_archive/debt/debt-330-review-action-bar-bookmark-placement.md) (post-exam review bookmark placement, resolved), [BS-019 (archived)](../_archive/brainstorming/bs-019-action-bar-label-and-ordering-consistency.md) (action bar label consistency, resolved), [BS-006 (archived)](../_archive/brainstorming/bs-006-review-consistency-audit.md) (earlier review consistency audit, resolved)

---

## The Problem

There are **three distinct question-review experiences** in the app. A user who completes an exam encounters two of them within 30 seconds of each other. All three show the same kind of content (a question with answer choices, feedback, and a reference), but their chrome — action bars, navigation, headers, and bookmark placement — diverge in ways that feel accidental rather than intentional.

### Surface 1: Post-Exam Review (pre-submit → review, and post-submit "Review your answers")

**Route:** `/app/practice/[sessionId]` (stages: `post-exam-review`)
**Component:** `post-exam-review-view.tsx`
**Entry point:** After clicking "Finish exam" during exam mode, or clicking "Review your answers" on the Session Summary

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ [Question Navigator: color-coded pills at top]                   │
│ "Question X of Y"                                                │
│                                                                  │
│ [Question content + choices + feedback + reference]              │
│                                                                  │
│ [ Previous ]  [ Next / Finish review ]              [ Bookmark ] │
└──────────────────────────────────────────────────────────────────┘
```

**Key traits:**
- Previous / Next on the left, Bookmark on the far right (`sm:ml-auto`)
- "Finish review" replaces "Next" on the last question
- Question navigator at top with color-coded correctness pills
- Header includes "View Summary" link
- No "Back to Summary" in the action bar — it's in the header instead
- Bookmark placement matches DEBT-330 resolution (navigation-first, trailing bookmark)

### Surface 2: Session Summary → "Review your answers" (via question-page-client)

**Route:** `/app/questions/[slug]?from=summary&mode=review&sessionId=...`
**Component:** `question-page-client.tsx`
**Entry point:** Clicking "Review your answers" on the Session Summary → clicking a question in the breakdown list, OR sometimes the "Review your answers" button itself

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ "Question" heading                                               │
│ "Reviewing a question from your session."                        │
│ [Question Navigator: color-coded pills at top]                   │
│ "Question X of Y"                                                │
│                                                                  │
│ [Question content + choices + feedback + reference]              │
│                                                                  │
│ [ Previous ]  [ Bookmark ]  [ Next ]      Back to Summary        │
└──────────────────────────────────────────────────────────────────┘
```

**Key traits:**
- **Bookmark is sandwiched between Previous and Next** (the BS-059 / DEBT-330 problem, unresolved here)
- "Back to Summary" is a ghost link in the action bar (not in the header)
- Uses a different navigator component (`ReviewQuestionNavigator` from `review-question-navigator.tsx`)
- Page heading says "Question" with subtitle "Reviewing a question from your session."
- Different overall page wrapper and component tree

### Surface 3: History → Review

**Route:** `/app/questions/[slug]?from=history&mode=review&sessionId=...`
**Component:** `question-page-client.tsx` (same component as Surface 2, different origin)
**Entry point:** History page → clicking a session → clicking a question

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ "Question" heading                                               │
│ "Reviewing a question from your history."                        │
│ [Question Navigator: color-coded pills at top]                   │
│ "Question X of Y"                                                │
│                                                                  │
│ [Question content + choices + feedback + reference]              │
│                                                                  │
│ [ Previous ]  [ Bookmark ]  [ Next ]      Back to History        │
└──────────────────────────────────────────────────────────────────┘
```

**Key traits:**
- Same component as Surface 2, so same bookmark-sandwiched layout
- "Back to History" ghost link instead of "Back to Summary"
- Same `ReviewQuestionNavigator` at top
- Same "Question" heading

---

## The Divergences (What the User Sees)

### D1: Bookmark placement

| Surface | Bookmark position |
|---------|------------------|
| Post-exam review | Far right, separated from nav via `ml-auto` |
| Summary review | Between Previous and Next (no separation) |
| History review | Between Previous and Next (no separation) |

**Why it matters:** The user navigates from Post-exam review (bookmark on right) → Session Summary → Review your answers (bookmark in the middle). The shift is jarring within the same session flow.

**Root cause:** DEBT-330 fixed the post-exam review surface (`post-exam-review-view.tsx`) but the same fix was never applied to `question-page-client.tsx`. BS-059 documents this gap but it remains unresolved.

### D2: "Back to..." placement and style

| Surface | Back link | Location |
|---------|-----------|----------|
| Post-exam review | "View Summary" | Header (top of page) |
| Summary review | "Back to Summary" | Ghost link in action bar (bottom) |
| History review | "Back to History" | Ghost link in action bar (bottom) |

**Why it matters:** Different mental models for how to exit. On one surface you look up, on others you look down.

### D3: Page heading and framing

| Surface | Heading | Subtitle |
|---------|---------|----------|
| Post-exam review | (none — integrated into session flow) | Score indicator at top |
| Summary review | "Question" | "Reviewing a question from your session." |
| History review | "Question" | "Reviewing a question from your history." |

**Why it matters:** Post-exam review feels like a continuation of the exam. Summary/History review feels like a standalone page with a different information hierarchy.

### D4: Component tree divergence

| Surface | Component | Navigator |
|---------|-----------|-----------|
| Post-exam review | `PostExamReviewView` | `QuestionNavigator` (from `exam-review-view.tsx`) |
| Summary review | `QuestionView` (in `question-page-client.tsx`) | `ReviewQuestionNavigator` (from `review-question-navigator.tsx`) |
| History review | `QuestionView` (same) | `ReviewQuestionNavigator` (same) |

Two separate navigator components with similar but not identical behavior. Two separate page components with similar but not identical layouts. This is the structural root of the visual divergence.

### D5: "Review & Submit" page — "Open question" button redundancy

The pre-submit review page (`exam-review-view.tsx`) lists each question with an "Open question" button on the right side. The entire card should be clickable (consistent with how the app handles clickable rows on History, Bookmarks, and Dashboard). The dedicated button adds a click target that feels redundant when the card content is already descriptive enough.

### D6: "Not marked" label on Review & Submit

Each question on the Review & Submit page shows "Not marked" if the user didn't mark it for review. This creates visual noise — the absence of a mark should be the default state (no label needed). A positive indicator when marked (e.g., a badge or icon) with no indicator when not marked would be cleaner.

---

## Root Cause Analysis

### Why do we have two separate review components?

1. **Post-exam review** (`PostExamReviewView`) was built as part of the exam session flow. It lives inside the `[sessionId]` route and is a stage of the `PracticeSessionPageView` orchestrator. It has access to the full session state in memory.

2. **Question detail review** (`question-page-client.tsx`) was built as a general-purpose question page that handles many origins (history, bookmarks, summary, dashboard, practice). It reconstructs session context from URL parameters and fetches data independently.

These two components evolved separately because they serve different entry points, but when the user navigates from Session Summary → "Review your answers," they land on the question-page-client version, which has a different layout than the post-exam review they just came from seconds ago.

### Why hasn't this been unified?

- `PostExamReviewView` is tightly coupled to the session orchestrator's in-memory state
- `question-page-client.tsx` is a standalone page that must work without session context
- Unifying them would require either making the question page work within the session orchestrator, or extracting a shared review layout component that both can use

---

## Severity Assessment

**Medium.** This is not broken functionality — all three surfaces work correctly. But the inconsistency is noticeable to engaged users who navigate between them in quick succession (which is the normal exam flow). The bookmark placement shift (D1) is the most jarring divergence. The "Open question" button redundancy (D5) is friction on every exam review.

---

## Would a Page/Surface Registry Help?

The existing **Pattern Registry** (`docs/frontend/pattern-registry.md`) catalogs visual patterns (tokens, components, interaction styles). It does NOT catalog **pages/surfaces** — the specific screens a user encounters and their layouts.

A **Surface Registry** would catalog:
- Every distinct screen/page the user can reach
- What components render on each
- The action bar layout for each
- Entry points (how the user gets there)
- Exit points (where "back" goes)

### Pros
- Makes divergences like D1-D4 immediately visible in documentation
- Forces explicit decisions when adding new surfaces ("which pattern does this follow?")
- Helps onboarding — a developer can see all the surfaces at a glance
- Prevents accidental drift when one surface gets updated but siblings don't

### Cons
- Maintenance burden — must stay in sync with code
- The pattern registry already covers component-level consistency
- Routes are already discoverable from the `app/` directory structure
- Risk of becoming stale if not treated as a living document

### Recommendation

A lightweight **surface map** as a section within the existing pattern registry (not a separate document) would be the right scope. It would list each user-facing surface, its route, its action bar pattern ID, and its entry/exit points. This makes cross-surface consistency auditable without creating a new document to maintain.

---

## Proposed Fix Directions

### Direction A: Unify action bar layout across all review surfaces

Apply the DEBT-330 pattern (navigation-first, trailing bookmark) to `question-page-client.tsx`. This is essentially what BS-059 proposes. It would close D1 (bookmark placement) and partially address the "feels different" problem.

**Effort:** Small — mostly CSS/layout changes in one file.

### Direction B: Extract a shared `ReviewActionBar` component

Create a single `ReviewActionBar` component used by both `PostExamReviewView` and `question-page-client.tsx`. This component would enforce:
- Previous / Next (or Finish review) on the left
- Bookmark on the far right
- "Back to..." as a ghost link, always in the action bar (not the header)

**Effort:** Medium — requires abstracting the action bar from two different component trees.

### Direction C: Make "Review your answers" from Session Summary stay in the session flow

Instead of navigating to `/app/questions/[slug]?from=summary`, keep the user in the `PostExamReviewView` component. The Session Summary's "Review your answers" button would return to the post-exam review stage instead of opening the question-page-client.

**Effort:** Medium — requires the session orchestrator to support re-entering the review stage from the summary stage.

### Direction D: Full unification — single review renderer

Long-term: extract the question-review rendering (question card + feedback + navigator + action bar) into a single composable component that all three surfaces use. Each surface provides its own back-link and data source, but the layout, bookmark position, and navigation are identical.

**Effort:** Large — significant refactor touching the session orchestrator and the standalone question page.

### Direction E: Fix the Review & Submit page affordances (D5, D6)

- Make question rows on the Review & Submit page clickable (whole-row link wrapping the card content), removing the "Open question" button
- Replace "Not marked" with no indicator; show a "Marked" badge/icon only when marked

**Effort:** Small — isolated to `exam-review-view.tsx`.

---

## Suggested Sequencing

1. **Direction E** (Review & Submit affordances) — quick win, fixes D5 and D6
2. **Direction A** (action bar unification via BS-059) — fixes D1, the most jarring divergence
3. **Direction B or C** (shared action bar or session flow continuity) — fixes D2 and D3
4. **Surface map section in pattern registry** — prevents future drift
5. **Direction D** (full unification) — only if the divergence keeps recurring after A+B/C

---

## Open Questions

1. **Should "Review your answers" from Session Summary navigate to the question-page-client (current) or stay in the session orchestrator (Direction C)?** Direction C is more seamless but couples the summary to the session flow.

2. **Should the two `QuestionNavigator` components be merged?** They serve similar roles but have different data sources and slightly different rendering (retry dots, marked-for-review dots). A shared component with configuration props could work.

3. **Is Direction D worth the refactor cost?** The divergence has been noticed multiple times (BS-006, BS-018, BS-019, BS-059, now BS-061). Each time, a targeted fix resolves one piece but the surfaces continue to drift. A structural unification might be the only way to prevent recurrence.

4. **Should the "Back to..." link always be in the action bar, always in the header, or configurable?** Consistency matters more than which choice is made.

5. **How does BS-052 (bookmark icon toggle) interact?** If bookmark becomes an icon, its visual weight changes and the placement question becomes less critical. Should BS-052 land first?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-06 | Created BS-061 | User walkthrough revealed three divergent review surfaces with inconsistent bookmark placement, "back" link location, page headers, and component trees. The divergence is noticeable when navigating between them in the normal exam flow. |
| 2026-04-06 | Scope is broader than BS-059 | BS-059 focuses narrowly on the `question-page-client.tsx` action bar button count/grouping. BS-061 covers the cross-surface divergence holistically, including the Review & Submit page affordances, the page heading/framing differences, and the structural question of why two separate component trees exist. |
| 2026-04-06 | Recommended against a standalone surface registry | A lightweight surface map as a section in the existing pattern registry is sufficient. A separate document would create maintenance burden. |
