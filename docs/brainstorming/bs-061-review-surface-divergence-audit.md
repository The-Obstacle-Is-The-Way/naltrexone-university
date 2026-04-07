# BS-061: Review Surface Divergence Audit — Three Different "Review Your Answers" Experiences

**Date:** 2026-04-06
**Triggered by:** User walkthrough of the exam flow end-to-end. After submitting an exam, clicking "Review your answers" from the Session Summary leads to a different review experience than the pre-submit review flow, and both differ from the History page's review. The user described it as "sloppified" — subtly different button arrangements, bookmark placement, navigation options, and page headers across three surfaces that should feel like the same experience.
**Scope:** Audit the exam-flow review surfaces — from pre-submit review through post-exam review, session summary, and the summary "Review your answers" handoff — and catalog where the experience breaks consistency.
**Related:** [BS-059](./bs-059-practice-session-action-bar-button-arrangement.md) (action bar button arrangement on question-page-client), [BS-052](./bs-052-bookmark-icon-toggle-replacement.md) (bookmark icon toggle), [DEBT-330 (archived)](../_archive/debt/debt-330-review-action-bar-bookmark-placement.md) (post-exam review bookmark placement, resolved), [BS-019 (archived)](../_archive/brainstorming/bs-019-action-bar-label-and-ordering-consistency.md) (action bar label consistency, resolved), [BS-006 (archived)](../_archive/brainstorming/bs-006-review-consistency-audit.md) (earlier review consistency audit, resolved)

**Boundary with BS-059:** BS-059 owns the standalone `question-page-client.tsx` action bar layout question (button count, grouping, bookmark placement). Fixes to `question-page-client.tsx`'s action bar should be tracked in BS-059. BS-061 owns the cross-surface exam-flow divergence: why `PostExamReviewView` and `question-page-client.tsx` feel different when the user transitions from post-exam review to summary review.

---

## The Problem

There are **three distinct question-review experiences** relevant to this audit. A user who completes an exam encounters two of them within 30 seconds of each other. All three show the same kind of content (a question with answer choices, feedback, and a reference), but their chrome — action bars, navigation, headers, and bookmark placement — diverge in ways that feel accidental rather than intentional.

### Surface 1: Post-Exam Review (immediately after final submit, before Session Summary)

**Route:** `/app/practice/[sessionId]` (stages: `post-exam-review`)
**Component:** `post-exam-review-view.tsx`
**Entry point:** After clicking "Finish exam" during exam mode

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
- Header includes a "View Summary" ghost button (`onViewSummary`), which performs an in-memory state transition rather than a route navigation
- No "Back to Summary" in the action bar — it's in the header instead
- Bookmark placement matches DEBT-330 resolution (navigation-first, trailing bookmark)

### Surface 2: Session Summary → "Review your answers" (via question-page-client)

**Route:** `/app/questions/[slug]?from=summary&mode=review&sessionId=...`
**Component:** `question-page-client.tsx`
**Entry point:** Clicking "Review your answers" on the Session Summary, or clicking a question in the summary breakdown list

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ "Question" heading                                               │
│ "Reviewing a question from your session summary."                │
│ top utility link: Back to Summary                                │
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
- Has both a top "Back to Summary" utility link and a bottom ghost "Back to Summary" action-bar link
- Uses a different navigator component (`ReviewQuestionNavigator` from `review-question-navigator.tsx`)
- Page heading says "Question" with subtitle "Reviewing a question from your session summary."
- Different overall page wrapper and component tree
- The layout shown above is the review-mode-with-session-nav state; the `question-page-client.tsx` action bar is stateful and can also render `Submit`, `Try Again` / `Practice Again`, and spacer spans in other states

### Surface 3: History → Review

**Route:** `/app/questions/[slug]?from=history&mode=review&sessionId=...`
**Component:** `question-page-client.tsx` (same component as Surface 2, different origin)
**Entry point:** History page → clicking a session → clicking a question

**Why it's included here:** History review is comparison context, not part of the primary exam flow. It is included because it uses the same standalone `question-page-client.tsx` review surface, which makes the shared divergence easier to see.

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

## Out-of-Scope Surfaces (Future Work)

BS-061 focuses on the exam flow:

`ExamReviewView` → `PostExamReviewView` → `SessionSummaryView` → summary review on `question-page-client.tsx`

The following origins also route into `question-page-client.tsx` and therefore inherit some of the same standalone-surface divergences, but they are separate future work rather than the primary focus of this doc:

- Bookmarks review (`bookmarks/page.tsx`)
- Dashboard recent sessions review (`dashboard/page.tsx`)
- Dashboard recent activity review (`dashboard/page.tsx`)
- Generic practice origin (`question-page-client.tsx`)

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
| Post-exam review | "View Summary" | Header utility button only |
| Summary review | "Back to Summary" | Header utility link plus bottom ghost action-bar link |
| History review | "Back to History" | Ghost link in action bar (bottom) |

**Why it matters:** Exit affordances shift between header-only, duplicated header+action-bar, and action-bar-only patterns. The user has to relearn where the escape hatch lives even though the underlying task is the same.

### D3: Page heading and framing

| Surface | Heading | Subtitle |
|---------|---------|----------|
| Post-exam review | (none — integrated into session flow) | Score indicator at top |
| Summary review | "Question" | "Reviewing a question from your session summary." |
| History review | "Question" | "Reviewing a question from your history." |

**Why it matters:** Post-exam review feels like a continuation of the exam. Summary/History review feels like a standalone page with a different information hierarchy.

### D4: Component tree divergence

| Surface | Component | Navigator |
|---------|-----------|-----------|
| Post-exam review | `PostExamReviewView` | `QuestionNavigator` (from `exam-review-view.tsx`) |
| Summary review | `QuestionView` (in `question-page-client.tsx`) | `ReviewQuestionNavigator` (from `review-question-navigator.tsx`) |
| History review | `QuestionView` (same) | `ReviewQuestionNavigator` (same) |

Two separate navigator components with similar but not identical behavior. The difference is not just cosmetic: `QuestionNavigator` is callback-based and navigates within in-memory session state, while `ReviewQuestionNavigator` is `Link`-based and navigates by route transitions. They also annotate different secondary states (`markedForReview` vs `wasRetried`). Two separate page components with similar but not identical layouts. This is the structural root of the visual divergence.

### D5: "Review & Submit" page — "Open question" button redundancy

The pre-submit review page (`exam-review-view.tsx`) lists each question with an "Open question" button on the right side. The entire card should be clickable (consistent with how the app handles clickable rows on History, Bookmarks, and Dashboard). The dedicated button adds a click target that feels redundant when the card content is already descriptive enough.

### D6: "Not marked" label on Review & Submit

Each question on the Review & Submit page shows "Not marked" if the user didn't mark it for review. This creates visual noise — the absence of a mark should be the default state (no label needed). A positive indicator when marked (e.g., a badge or icon) with no indicator when not marked would be cleaner.

### D7: Focus-ring artifact on Post-Exam Review load

The user reported a transient "barrier" / box appearing when review pages load. This is likely the focus-visible ring on `PostExamReviewView`, not a random device artifact:

- `useEffect` calls `panelRef.current?.focus({ focusVisible: true })` on every reviewed-question change
- The review panel section has `focus-visible:ring-ring/50 focus-visible:ring-[3px]`

This is not a cross-surface divergence like D1-D4, but it is a real visual artifact the user noticed during the exam flow and should be tracked alongside the broader cleanup.

---

## Root Cause Analysis

### Why do we have two separate review components?

1. **Post-exam review** (`PostExamReviewView`) was built as part of the exam session flow. It lives inside the `[sessionId]` route and is a stage of the `PracticeSessionPageView` orchestrator. It has access to the full session state in memory.

2. **Question detail review** (`question-page-client.tsx`) was built as a general-purpose question page that handles many origins (history, bookmarks, summary, dashboard, practice). It reconstructs session context from URL parameters and fetches data independently.

These two components evolved separately because they serve different entry points, but when the user navigates from Session Summary → "Review your answers," they land on the question-page-client version, which has a different layout than the post-exam review they just came from seconds ago.

### Why hasn't this been unified?

- `PostExamReviewView` is tightly coupled to the session orchestrator's in-memory state
- `question-page-client.tsx` is a standalone page that must work without session context
- The session route uses a one-way stage machine (`use-practice-session-review-stage.ts`). When `onViewSummary()` runs, it promotes the pending summary and explicitly clears the post-exam review state (`setPostExamReview(null)`, `setPostExamReviewCurrentQuestionId(null)`, `setPostExamReviewLoadState({ status: 'idle' })`)
- Because that post-exam review state is deliberately discarded when the user enters the summary stage, the orchestrator cannot currently re-enter post-exam review from the summary without rebuilding that state
- Unifying them would require either making the question page work within the session orchestrator, or changing the stage machine so summary review can stay in-session instead of routing to `question-page-client.tsx`

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

### Direction C: Make "Review your answers" from Session Summary stay in the session flow (DECIDED)

Instead of navigating to `/app/questions/[slug]?from=summary`, keep the user in the `PostExamReviewView` component. The Session Summary's "Review your answers" button returns to the post-exam review stage instead of opening the question-page-client. The stage machine modification is straightforward: either preserve `postExamReview` state when entering summary (don't null it in `onViewSummary`), or re-fetch it via `loadPostExamReview` on re-entry. This is 5 lines of state management, not a rewrite.

**Effort:** Small-medium — modify `onViewSummary` to preserve/restore state, add a "back to review" handler on SessionSummaryView, wire the button.
**Fixes:** D1, D2, D3, D4 for the entire exam flow in one move.

### Direction D: Full unification — single review renderer

Long-term: extract the question-review rendering (question card + feedback + navigator + action bar) into a single composable component that all three surfaces use. Each surface provides its own back-link and data source, but the layout, bookmark position, and navigation are identical.

**Effort:** Large — significant refactor touching the session orchestrator and the standalone question page.

### Direction E: Fix the Review & Submit page affordances (D5, D6)

- Make question rows on the Review & Submit page a whole-card clickable target (via the existing `onOpenQuestion` callback), removing the "Open question" button
- Replace "Not marked" with no indicator; show a "Marked" badge/icon only when marked

**Effort:** Small — isolated to `exam-review-view.tsx`.

---

## Implementation Plan

1. **Direction E** (Review & Submit affordances) — quick win, fixes D5 and D6
2. **Direction C** (session-flow continuity) — decided: "Review your answers" stays in the session orchestrator. The stage machine modification is straightforward: either preserve `postExamReview` state when entering summary (don't clear it in `onViewSummary`), or re-fetch it via `loadPostExamReview` on re-entry. This eliminates D1, D2, D3, and D4 for the exam flow in one move.
3. **Direction A** (action bar unification via BS-059) — follow-up cleanup for the standalone `question-page-client.tsx` surface. This fixes D1 for History, Bookmarks, Dashboard, and all other non-exam origins that still route through the standalone page. Not blocked by Direction C.
4. **Direction D7 fix** — change `panelRef.current?.focus({ focusVisible: true })` to `.focus()` (or suppress the visible ring) so the focus-ring flash disappears.
5. **Surface map section in pattern registry** — prevents future drift across all surfaces.
6. **Direction B** (shared action bar) and **Direction D** (full unification) are deprioritized. Direction C makes B unnecessary for the exam flow, and D is only worth revisiting if non-exam origins continue to drift after A lands.

---

## Decided Questions

1. **Should "Review your answers" stay in the session orchestrator?** Yes. Direction C is the right answer. Ejecting the user to a different page mid-session violates spatial consistency. The stage machine change is small (preserve or re-fetch post-exam review state).

2. **Should the two `QuestionNavigator` components be merged?** No. They serve architecturally different purposes (callback-based in-memory nav vs Link-based route nav). Merging would create a component with too many conditional branches. They should stay separate, each correct for its context.

## Remaining Open Questions

1. **Stage machine implementation detail:** Preserve existing state in `onViewSummary` (simpler, but holds memory) vs re-fetch via `loadPostExamReview` on re-entry (cleaner, but adds a network round-trip)? Decide during implementation.

2. **How does BS-052 (bookmark icon toggle) interact?** If bookmark becomes an icon, its visual weight changes. BS-052 can land before or after BS-061 — they're independent.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-06 | Created BS-061 | User walkthrough revealed three divergent review surfaces with inconsistent bookmark placement, "back" link location, page headers, and component trees. The divergence is noticeable when navigating between them in the normal exam flow. |
| 2026-04-06 | Scope is distinct from BS-059 | BS-059 focuses on the standalone `question-page-client.tsx` action bar layout. BS-061 focuses on the exam-flow divergence: why post-exam review, session summary, and summary review do not feel like one continuous experience. |
| 2026-04-06 | Recommended against a standalone surface registry | A lightweight surface map as a section in the existing pattern registry is sufficient. A separate document would create maintenance burden. |
| 2026-04-06 | Adversarial review applied | Fixed factual errors (subtitle text, back-link placement, Direction E wording), sharpened scope to exam flow, added focus-ring finding, deepened root cause with stage-machine detail, clarified BS-059 boundary, and resequenced Directions to prioritize C (session-flow continuity) as the key decision point. |
| 2026-04-07 | Direction C decided, no hedging | "Review your answers" from Session Summary will stay in the session orchestrator. The stage machine change is straightforward (5 lines of state to preserve or re-fetch). Ejecting the user to a different page mid-session violates UX first principles. Navigator merge rejected — architecturally different components should stay separate. Sequencing converted from "suggested" to "implementation plan." |
