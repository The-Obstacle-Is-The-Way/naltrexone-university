# BS-061: Review Surface Divergence Audit — Three Different "Review Your Answers" Experiences

**Date:** 2026-04-06
**Triggered by:** User walkthrough of the exam flow end-to-end. After submitting an exam, clicking "Review your answers" from the Session Summary leads to a different review experience than the pre-submit review flow, and both differ from the History page's review. The user described it as "sloppified" — subtly different button arrangements, bookmark placement, navigation options, and page headers across three surfaces that should feel like the same experience.
**Scope:** Audit the exam-flow review surfaces — from pre-submit review through post-exam review, session summary, and the summary "Review your answers" handoff — and catalog where the experience breaks consistency.
**Related:** [BS-059](../../brainstorming/bs-059-practice-session-action-bar-button-arrangement.md) (standalone question-page action bar), [BS-052](../../brainstorming/bs-052-bookmark-icon-toggle-replacement.md) (bookmark icon toggle), [DEBT-350](../debt/debt-350-exam-results-session-continuity.md) (session-orchestrator continuity), [DEBT-351](../debt/debt-351-exam-review-submit-affordance-cleanup.md) (Review & Submit row affordance cleanup), [DEBT-352](../debt/debt-352-post-exam-review-focus-ring-flash.md) (post-exam focus-ring flash), [DEBT-330 (archived)](../debt/debt-330-review-action-bar-bookmark-placement.md) (post-exam review bookmark placement, resolved), [BS-019 (archived)](./bs-019-action-bar-label-and-ordering-consistency.md) (action bar label consistency, resolved), [BS-006 (archived)](./bs-006-review-consistency-audit.md) (earlier review consistency audit, resolved)

**Boundary with BS-059:** BS-059 owns the standalone `question-page-client.tsx` action bar layout question (button count, grouping, bookmark placement). Fixes to `question-page-client.tsx`'s action bar should be tracked in BS-059. BS-061 owns the cross-surface exam-flow divergence: why `PostExamReviewView` and `question-page-client.tsx` feel different when the user transitions from post-exam review to summary review.

---

## The Problem

There are **three distinct question-review experiences** relevant to this audit. A user who completes an exam encounters two of them within 30 seconds of each other. All three show the same kind of content (a question with answer choices, feedback, and a reference), but their chrome — action bars, navigation, headers, and bookmark placement — diverge in ways that feel accidental rather than intentional.

### Surface 1: Post-Exam Review (immediately after final submit, before Session Summary)

**Route:** `/app/practice/[sessionId]` (stages: `post-exam-review`)
**Component:** `post-exam-review-view.tsx`
**Entry point:** After confirming final submit on `ExamReviewView` ("Review & Submit")

**Layout:**

```text

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

```text

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

```text

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
- The current `PracticeSessionPageView` branch order (`if (summary) return ...`) also matters. Preserving `postExamReview` state alone is insufficient because `summary` currently short-circuits the render tree before `PostExamReviewView` can render again
- Direction C therefore requires an explicit exam-results substage inside the session orchestrator. This is not a full renderer rewrite, but it is more than "don't clear five fields"

---

## Severity Assessment

**Medium.** This is not broken functionality — all three surfaces work correctly. But the inconsistency is noticeable to engaged users who navigate between them in quick succession (which is the normal exam flow). The bookmark placement shift (D1) is the most jarring divergence. The "Open question" button redundancy (D5) is friction on every exam review.

---

## Surface Map Contract

The lightweight surface map is no longer optional.

- **Location:** `docs/frontend/pattern-registry.md`
- **Scope:** review-related surfaces only
- **Minimum columns:** surface ID/name, route/origin, primary renderer, navigator family, exit model, owner doc
- **Maintenance rule:** any PR that adds a review surface, changes a review-surface entry/exit path, or swaps the renderer/navigator family must update the surface map in the same PR

This keeps the registry lightweight while still making cross-surface drift auditable.

## Implementation Tracking

- [DEBT-350](../debt/debt-350-exam-results-session-continuity.md) owns Direction C as one inseparable change set: results-substage state, summary CTA re-entry, and summary breakdown callback mode.
- [DEBT-351](../debt/debt-351-exam-review-submit-affordance-cleanup.md) owns Direction E.
- [DEBT-352](../debt/debt-352-post-exam-review-focus-ring-flash.md) owns D7.
- Direction A remains in [BS-059](../../brainstorming/bs-059-practice-session-action-bar-button-arrangement.md). It is not promoted here because the standalone `question-page-client.tsx` action-bar contract across its multiple states is still broader than the now-locked BS-061 exam-flow scope.

---

## Decided Directions

### Direction E: Review & Submit affordance cleanup

- Make each available row on `ExamReviewView` a single whole-card clickable target using the existing `onOpenQuestion(questionId)` callback
- Remove the dedicated "Open question" button
- Remove the default "Not marked" label; only render a positive marked indicator when `markedForReview === true`

### Direction C: Session Summary review stays in the session orchestrator

- The exam-flow path is: `ExamReviewView` → `PostExamReviewView` → `SessionSummaryView` → back into `PostExamReviewView`
- Session Summary no longer ejects to `/app/questions/[slug]?from=summary` for the primary exam flow
- `PostExamReviewView` remains the review renderer for exam completion; do not add a summary-specific variant and do not merge the navigator components

### Direction A: Standalone `question-page-client.tsx` cleanup remains separate

- BS-059 still owns the standalone review action bar layout on `question-page-client.tsx`
- This includes History, Bookmarks, Dashboard, generic practice origins, and any residual direct visits to the summary-origin route
- Direction A is independent of Direction C

### Direction D7: Remove the post-exam focus-ring flash without deleting focus management

- Keep the programmatic focus handoff to the reviewed-question panel
- Remove the forced visible-ring behavior that produces the transient box/flash for pointer users

---

## Direction C Implementation Contract

### 1. State model

Direction C requires an explicit **exam-results substage** inside `usePracticeSessionReviewStage`.

- The session route must distinguish at least two results substages:
  - `post_exam_review`
  - `session_summary`
- Do **not** infer the rendered surface solely from whether `summary` or `postExamReview` is null
- The current `PracticeSessionPageView` short-circuit (`if (summary) return ...`) must be treated as a migration point, not as the target architecture

### 2. State that must persist

The session orchestrator must preserve the following exam-results state while the user moves between post-exam review and summary:

- finalized exam summary payload
- completed post-exam review payload
- post-exam review load state
- current reviewed question ID

`pendingExamSummary` is a misleading name once summary becomes re-enterable. The implementation should represent a persistent exam-results payload, not a disposable "pending" payload that gets nulled on summary entry.

### 3. Review cursor resolution

Whenever exam review opens or reopens, resolve the current question in this order:

1. A specifically requested question ID from a Session Summary breakdown click
2. The persisted `postExamReviewCurrentQuestionId`, if it still exists in the review payload and is available
3. The first available review row
4. The first review row only when no available rows exist

This rule applies to:

- the initial post-exam review entry after final submit
- summary CTA re-entry
- summary breakdown row re-entry
- lazy rehydration after refresh/direct revisit

This avoids the current hidden trap where `rows[0]` can be unavailable and the review opens on a disabled/current navigator pill.

### 4. Entry behavior

**Initial exam completion**

- `onFinalizeReview()` finalizes the exam, loads the completed-feedback payload, seeds the review cursor via the resolution rules above, and lands in `post_exam_review`

**Session Summary primary CTA**

- `Review your answers` is an in-session state transition, not a route link
- The current `SessionSummaryView` `firstReviewableSlug` + `<Link>` implementation is a migration point, not the target contract
- After Direction C, the primary CTA becomes a `Button` that calls the session substage transition
- CTA visibility should be gated by whether completed-feedback review is available now or can be hydrated in-session, not by whether an available-row `slug` exists
- If completed-feedback data is already present, reopen `PostExamReviewView` immediately
- If completed-feedback data is missing because the session route was refreshed or revisited later, lazy-load `getCompletedSessionQuestionsWithFeedback`, then enter `post_exam_review`
- CTA entry reuses the persisted cursor when possible; otherwise it falls back via the resolution rules above

**Session Summary breakdown rows**

- Available rows open the exact clicked `questionId` in-session
- Unavailable rows remain static/non-interactive
- Breakdown re-entry uses `questionId`, not `slug`, because the session orchestrator is question-ID-driven
- `SessionBreakdownList` should gain an optional callback mode for Session Summary rather than forking a summary-only list component

### 5. Exit behavior

**From `PostExamReviewView`**

- `View Summary` in the header switches the substage to `session_summary`
- `Finish review` on the last question does the same transition
- Neither action clears the completed-feedback payload or the current reviewed question ID

**From `SessionSummaryView`**

- `Back to Practice` and `View in History` remain route navigation
- `Review your answers` and clickable breakdown rows are in-session state changes

### 6. Refresh/direct-entry behavior

- A hard refresh or direct revisit of `/app/practice/[sessionId]` after exam completion lands on **Session Summary**
- The app does **not** encode the last reviewed question in the URL
- Last-reviewed-question restoration is therefore an in-memory convenience for the current mounted session only
- After refresh/direct revisit, the first summary CTA uses the cursor-resolution rules above after lazy-loading the completed-feedback payload

### 7. Loading/error behavior for summary re-entry

When the user is on Session Summary and post-exam review must be hydrated on demand:

- keep the user inside the session route
- keep Session Summary as the fallback/stable surface
- disable repeat review-entry actions while hydration is pending
- surface hydration errors on the summary surface with an explicit retry path

The user should not be ejected to `question-page-client.tsx`, and summary re-entry should not rely on a route-level interstitial to recover from lazy-load failures.

### 8. Reuse and non-goals

- Reuse `PostExamReviewView` directly; do not add a parallel "summary re-entry review" component
- Keep `QuestionNavigator` and `ReviewQuestionNavigator` separate; the callback-vs-Link split is architectural, not accidental
- Do not merge review renderers in this pass
- Do not move standalone History/Bookmarks/Dashboard review into the session orchestrator

### 9. Copy constraint

`PostExamReviewView`'s helper copy must no longer imply a one-way trip ("before moving to your session summary"). After Direction C, the copy needs to read correctly both on first arrival and on summary re-entry.

---

## Direction E Implementation Contract

- Each available exam-review row becomes exactly one semantic `button` target for the whole card
- Do not keep a nested "Open question" button inside the row
- Do not simulate clickability with `onClick` on a non-focusable `div`
- The whole-card target must be keyboard-focusable, Enter/Space activatable, and visibly focused
- Unavailable questions remain non-interactive static cards
- The metadata line renders only positive states:
  - `Answered` / `Unanswered`
  - `Marked for review` only when true
  - `Correct` / `Incorrect` only when available from answered data
- Separator bullets must collapse cleanly when the marked state is absent

---

## Direction A Boundary Contract

Direction A remains tracked by BS-059.

- It fixes the standalone `question-page-client.tsx` bookmark placement for History, Bookmarks, Dashboard, practice-origin review, and any residual summary-origin route visits
- It does **not** own the exam-flow handoff anymore once Direction C lands
- BS-061 owns the session-orchestrator continuity problem; BS-059 owns the standalone action-bar layout problem

---

## D7 Focus Strategy Contract

- Keep `PostExamReviewView` focus management: the reviewed-question panel should still receive programmatic focus when the current reviewed question changes
- Remove `focus({ focusVisible: true })`; rely on standard focus modality instead
- Keep the panel focus target itself (`tabIndex={-1}`) and the `focus-visible:*` classes so keyboard/screen-reader users still have a perceivable target when modality warrants it
- The fix is to remove the forced visible ring, not to remove focus transfer entirely

---

## Implementation Sequence

1. **Direction E** — whole-card Review & Submit rows, no "Not marked" noise
2. **Direction C** — explicit exam-results substage, summary re-entry stays in-session
3. **Direction A / BS-059** — standalone `question-page-client.tsx` action-bar cleanup
4. **Direction D7** — remove forced visible-ring flash while keeping focus management
5. **Surface map** — keep the review-surface registry updated with any routing/rendering changes from steps 2-4

There is no fallback branch in this sequence. Direction C is the exam-flow decision.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-06 | Created BS-061 | User walkthrough revealed three divergent review surfaces with inconsistent bookmark placement, "back" link location, page headers, and component trees. The divergence is noticeable when navigating between them in the normal exam flow. |
| 2026-04-06 | Scope is distinct from BS-059 | BS-059 focuses on the standalone `question-page-client.tsx` action bar layout. BS-061 focuses on the exam-flow divergence: why post-exam review, session summary, and summary review do not feel like one continuous experience. |
| 2026-04-06 | Recommended against a standalone surface registry | A lightweight surface map as a section in the existing pattern registry is sufficient. A separate document would create maintenance burden. |
| 2026-04-06 | Adversarial review applied | Fixed factual errors (subtitle text, back-link placement, Direction E wording), sharpened scope to exam flow, added focus-ring finding, deepened root cause with stage-machine detail, clarified BS-059 boundary, and resequenced Directions to prioritize C (session-flow continuity) as the key decision point. |
| 2026-04-07 | Direction C decided, no hedging | "Review your answers" from Session Summary will stay in the session orchestrator. Ejecting the user to a different page mid-session violates UX first principles. Navigator merge rejected — architecturally different components should stay separate. Sequencing converted from "suggested" to "implementation plan." |
| 2026-04-07 | Implementation contract hardened | Removed remaining fallback language, replaced "5 lines" hand-waving with an explicit exam-results substage contract, specified cursor resolution and summary callback behavior, documented refresh/rehydration limits, locked Direction E accessibility semantics, and defined the surface-map maintenance rule. |
| 2026-04-07 | Implementation tracking decomposed into debt docs | Direction C promoted to DEBT-350, Direction E promoted to DEBT-351, and D7 promoted to DEBT-352. Direction A intentionally remains in BS-059 until the standalone `question-page-client.tsx` action-bar contract is settled. |
