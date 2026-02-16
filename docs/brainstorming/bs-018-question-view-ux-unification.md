# BS-018: Question View UX Unification — Navigation, State, and Action Bar Consistency

**Date:** 2026-02-16
**Triggered by:** Live UI audit (Chrome agent walkthrough) + codebase analysis across all 6 question-viewing contexts
**Scope:** The 6 question-viewing contexts have diverged in navigation placement, action bar composition, and state persistence — creating a disjointed UX that undermines the product's learning experience
**Related:** [Question Rendering Architecture](../practice-engine/question-rendering-architecture.md), [BUG-133](../_archive/bugs/bug-133-stale-closure-auto-advance.md), [BUG-134](../_archive/bugs/bug-134-mark-for-review-race-condition.md), SPEC-027, SPEC-028

---

## The Problem

Six distinct question-viewing contexts have been built feature-by-feature over time. Each works correctly in isolation, but they've diverged in three critical ways that make the product feel assembled rather than designed:

### Concern 1: Sequential Navigation Lives in Different Places

| Context | Where Previous/Next Lives | What Exists |
|---------|--------------------------|-------------|
| Tutor Mode (active) | Bottom action bar | "Next Question" only — **no Previous** |
| Exam Mode (active) | Bottom action bar | "Next Question" only — **no Previous** |
| Quick Practice (ad-hoc) | Bottom action bar | "Next Question" only — **no Previous** (and no navigator grid) |
| History Session Review | Inline row ABOVE question content | "← Previous / Question X of Y / Next →" |
| History Individual Review | Nowhere | No sequential nav (correct — no session context) |
| Exam Review Stage | N/A | Checklist UI, no sequential nav (correct) |

The user sees Previous/Next at the top in one context and at the bottom in another. In session-based active practice, Previous doesn't exist — the only way to go back is via the Question Navigator grid. In Quick Practice, there is no back navigation at all.

### Concern 2: Tutor Mode Loses Answered State on Revisit

**The core pedagogical bug.** In Tutor Mode (the learning-focused mode where "explanations shown after each answer"), when a user:

1. Answers Question 1 — sees correct/incorrect highlighting + explanation
2. Navigates to Question 2
3. Navigates back to Question 1

**Expected:** Full post-submission state (selected answer, highlighting, explanation)
**Actual:** Blank unanswered state — as if the question was never attempted

The Question Navigator's aria-labels correctly say "Question 1: Incorrect" — the state IS tracked internally. It just isn't rendered.

**Root cause:** `syncQuestionStateFromDraftOrSession()` restores `selectedChoiceId` and `isAnswered` from the `NextQuestion` response, but `submitResult` (which carries `correctChoiceId`, `explanationMd`, `choiceExplanations`) is cleared on navigation and never restored. The `NextQuestion` type lacks these fields entirely.

**Why History Review works:** It uses a completely different data path (`loadPreviousAttempt()`) that returns a full `SubmitAnswerOutput` with all fields populated.

**Why this matters for Tutor mode specifically:** Tutor mode exists for learning. The entire point is reviewing what you got wrong, seeing the correct answer, and reading the explanation. If that state vanishes on navigation, the user loses the ability to learn mid-session — which defeats the purpose of choosing Tutor mode.

### Concern 3: Action Bars Are Inconsistent Across Contexts

| Context | Bottom Action Bar |
|---------|-------------------|
| Practice (before submit) | [Submit] [Next Question] [Bookmark] |
| Practice (after submit, Tutor) | [Submit (disabled)] [Next Question] [Bookmark] |
| Practice (after submit, Exam) | [Submit (disabled)] [Next Question] [Bookmark] [Mark for review] |
| History Session Review | [Try Again] [Back to History] |
| History Individual Review | [Try Again] [Back to History] |
| Exam Review Stage | [Submit Exam] (with confirmation dialog) |
| Session Review (unanswered question; review fallback) | [Submit] only — no Try Again, no Back, no Next |

The session-review fallback case is particularly surprising: it shows a lone "Submit" button with no way to navigate to the next question or return to the history page from the bottom bar.

### Concern 4: Redundancy Between Navigator Grid and Inline Previous/Next

In History Session Review, the user has TWO mechanisms for moving between questions:
1. The Question Navigator grid (random-access: click any question number)
2. The inline "← Previous / Next →" row immediately below the grid

These serve different purposes (random-access vs sequential), but placing them adjacent at the top creates visual noise and forces the user to scroll back up after reading a long explanation to advance.

### Concern 5: No Previous Button in Active Practice

Active practice has "Next Question" in the bottom bar but no "Previous Question." In session-based practice, the only way to revisit a question is via the Question Navigator grid. In Quick Practice, there is no way to go back at all (no session context, no navigator grid, no previous button).

No explicit rationale for omitting a bottom-bar Previous button is documented in specs as of 2026-02-16.

**Open question:** Should Previous be added to Tutor mode only? Or to both modes? Exam mode has a legitimate reason to discourage backtracking (simulating real exam conditions), but Tutor mode's purpose is exploration and learning.

---

## Root Cause Analysis

The divergence happened because each context was built as a separate feature with its own spec:

- Active Practice (SPEC-013, SPEC-020) — built first around a forward-only bottom bar; later gained a navigator grid but still lacks sequential Previous
- History Session Review (SPEC-027) — built later, added Previous/Next as inline row
- Exam Review Stage — built for exam-specific checklist review
- Individual Question Review — minimal view, no session context
- Quick Practice — later ad-hoc path that reuses `PracticeView` but has no session navigation context

No single spec ever unified the navigation and action bar patterns across all contexts. Each spec solved its own problem correctly but didn't reconcile with the others. This is a textbook example of **convergence debt** — the features work individually but haven't been reconciled into a cohesive system.

---

## Severity Assessment

| Concern | Severity | Who's Affected | How Often |
|---------|----------|----------------|-----------|
| Tutor state persistence bug | **High** | Every Tutor mode user who revisits a question | Every session |
| Navigation placement inconsistency | Medium | Users who use both Practice and History Review | Frequent |
| Missing Previous in active practice | Medium | Tutor mode users who want to re-read an explanation | Frequent |
| Session review fallback incomplete action bar | Low | Users reviewing unanswered session questions | Only when unanswered |
| Navigator/inline nav redundancy | Low | History Session Review users | Every review |

---

## Proposed Design Direction

### Principle: Two Navigation Zones, Non-Overlapping

**Zone 1 — Top: Question Navigator grid + status line.** Random-access jump tool. Non-interactive "Question X of Y" status. No clickable Previous/Next here.

**Zone 2 — Bottom: Action Bar.** All sequential navigation AND context actions. This is where the user's eyes land after reading the question + explanation.

### Unified Bottom Action Bar by Context

| Context | Bottom Action Bar (left → right) |
|---------|----------------------------------|
| Practice — Tutor/Exam, before submit | [← Previous] [Submit] [Next →] [Bookmark] |
| Practice — Tutor, after submit | [← Previous] [Next →] [Bookmark] |
| Practice — Exam, after submit | [← Previous] [Next →] [Bookmark] |
| Quick Practice (ad-hoc) | [Submit] [Next →] [Bookmark] (no Previous; no session context) |
| History Session Review | [← Previous] [Next →] [Try Again] [Back to History] |
| History Individual Review | [Try Again] [Back to History] |
| Exam Review Stage | [Submit Exam] (unchanged) |

### Key Changes from Current State

1. **Add Previous to session-based Practice bottom bar** (Tutor + Exam)
2. **Remove inline "← Previous / Next →" row from History Session Review** — move to bottom bar
3. **Keep "Question X of Y"** as a non-interactive status label near the heading
4. **Fix Tutor state persistence** — answered questions must render their full post-submission state on revisit
5. **Complete unanswered session review action bar (review fallback)** — add Back to History and sequential nav

### Tutor State Persistence Fix Direction

Three approaches documented in the architecture doc:

1. **Backend enhancement:** Extend `NextQuestion` response to include `correctChoiceId`, `explanationMd`, `choiceExplanations` when the question was previously answered in the session. Authoritative and survives page refresh.
2. **Client-side cache:** Store `submitResult` per-questionId in a `Map<string, SubmitAnswerOutput>` ref, restore from cache on revisit. Frontend-only, faster to implement, but doesn't survive page refresh.
3. **Tutor-only hydration on revisit:** When revisiting a previously-answered question and `NextQuestion.session.latestSelectedChoiceId` exists but `submitResult` is null, call `getPreviousAttempt({ sessionId, questionId })` and hydrate `submitResult` (must be gated to Tutor to avoid exam answer leaks).

**Recommendation:** Approach 1 (backend enhancement) is cleaner and aligns with how History Review already works. The data exists server-side; we just need to include it in the response.

---

## Open Questions

1. **Should Previous be added to Exam mode?** Exam mode simulates real test conditions. Real exams (USMLE, bar exam) allow going back. Today, the navigator grid provides back/jump, but there is no sequential Previous button in the bottom bar. Is that the desired exam UX?

2. **Should the inline "← Previous / Next →" row be removed entirely from History Review, or kept as a secondary affordance?** Removing it is cleaner but requires users to scroll to the bottom after reading explanations. The Question Navigator grid at the top already provides random-access.

3. **Should we extract a shared `QuestionActionBar` component?** Currently, each context renders its own buttons inline (4 different implementations). A shared component with mode/context props would prevent future drift. But the button sets differ enough that the abstraction might add more complexity than it saves.

4. **Should this be one spec or multiple?** The Tutor state persistence bug is a clear standalone fix. The navigation/action bar unification could be a separate spec. Or they could be combined since they both touch the same files.

5. **Does adding Previous to Practice break any existing tests or specs?** Specs and docs should be updated to reflect the new navigation standard (bottom bar as the single sequential nav zone).

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-16 | Document created | Live UI audit revealed 5 concerns across all question-viewing contexts |
| 2026-02-16 | Tutor state persistence identified as highest priority | Core pedagogical bug that defeats the purpose of Tutor mode |
| 2026-02-16 | Bottom-bar-only navigation proposed | Reduces redundancy, aligns with where user attention lands after reading content |
| 2026-02-16 | Code verification completed | File paths + line numbers verified against codebase. Architecture doc updated for accuracy. Verified code paths added here for spec readiness. |

---

## Verified Code Paths (Spec-Ready)

All file paths and line numbers verified against codebase on 2026-02-16.

### Concern 1 & 4: Navigation Placement — Files to Change

| What | File | Lines | Current Behavior |
|------|------|-------|------------------|
| Inline Previous/Next row (to remove) | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 98-156 (`SessionNavigationBar`) | Renders "← Previous / Question X of Y / Next →" via `<Link>` elements when `sessionNavigation` is non-null |
| History Review renders it here | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 200-210 | `<SessionNavigationBar navigation={...} />` rendered between navigator grid and question content |
| "Question X of Y" status label | Same component | Line 135-137 | Rendered inside the nav row — needs to be extracted to heading area if row is removed |

### Concern 2: Tutor State Persistence — Files to Change

| What | File | Lines | Detail |
|------|------|-------|--------|
| State cleared on navigation | `app/(app)/app/practice/shared/question-flow-actions.ts` | 46-50 | `setSelectedChoiceId(null)`, `setSubmitResult(null)`, `setSubmitIdempotencyKey(null)`, `setQuestionLoadedAt(null)` |
| Partial restore (bug site) | `app/(app)/app/practice/shared/use-question-flow-core.ts` | 133-144 | `syncQuestionStateFromDraftOrSession()` restores `selectedChoiceId` and `isAnswered` but NOT `submitResult` |
| `NextQuestion` type (missing fields) | `src/application/use-cases/get-next-question.ts` | 26-41 | `session` includes `latestSelectedChoiceId` and `latestIsCorrect` but NOT `correctChoiceId`, `explanationMd`, `choiceExplanations` |
| How History Review works (reference) | `app/(app)/app/questions/[slug]/question-page-logic.ts` | 216-259 | `loadPreviousAttempt()` returns full `SubmitAnswerOutput` with ALL fields — sets both `selectedChoiceId` AND `submitResult` |
| `SubmitAnswerOutput` type | `src/application/use-cases/submit-answer.ts` | (output type) | Contains `attemptId`, `isCorrect`, `correctChoiceId`, `explanationMd`, `choiceExplanations` |

**Backend fix path:** Modify `get-next-question.ts` use case to include `correctChoiceId` + `explanationMd` + `choiceExplanations` in the `NextQuestion.session` type when the question was previously answered. Then update `syncQuestionStateFromDraftOrSession()` to construct and set `submitResult` from these fields.

### Concern 3: Action Bar Inconsistency — Files to Change

| Context | File | Lines | Current Buttons |
|---------|------|-------|-----------------|
| Active Practice (Tutor/Exam) | `app/(app)/app/practice/components/practice-view.tsx` | 245-290 | [Submit] [Next Question] [Bookmark] [Mark for review (exam)] |
| Exam Review Stage | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | 183-232 | [Submit exam] with AlertDialog |
| Session Summary | `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | 92-102 | [Back to Dashboard] [View in History] [Start another] |
| Question Review (all origins) | `app/(app)/app/questions/[slug]/question-page-client.tsx` | 262-294 | [Submit] (pre-answer) or [Try Again] [Back to X] (post-answer) |

### Concern 5: No Previous in Active Practice — Files to Change

| What | File | Lines | Detail |
|------|------|-------|--------|
| Action bar (add Previous here) | `app/(app)/app/practice/components/practice-view.tsx` | 245-290 | Currently: Submit, Next Question, Bookmark. Needs: ← Previous added |
| Navigation handler (needs new callback) | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` | hook output | Currently exports `onNextQuestion` and `onNavigateQuestion`. Needs: `onPreviousQuestion` or reuse `onNavigateQuestion` with prev question ID |
| Session info (needs prev question context) | `src/application/use-cases/get-next-question.ts` | 26-41 | `NextQuestion.session` has `index` and `total` but no `previousQuestionId`. Controller would need to derive previous from navigator data or session state |

### Shared Component Verification

| Component | File | Shared? | Notes |
|-----------|------|---------|-------|
| `QuestionCard` | `components/question/question-card.tsx` | Yes — all contexts | Props: `correctChoiceId`, `disabled`, `onSelectChoice` |
| `ChoiceButton` | `components/question/choice-button.tsx` | Yes — all contexts | Radio-style, uses `type="radio"` input |
| `Feedback` | `components/question/feedback.tsx` | Yes — all contexts | `isCorrect`, `explanationMd`, `choiceExplanations` |
| `QuestionNavigator` | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:24-85` | Active session only | Callback-based (`onNavigateQuestion`) |
| `ReviewQuestionNavigator` | `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` | Review pages only | Link-based (`<Link href={toQuestionRoute(...)}>`) |
| Action bars | 4 separate inline implementations | **Not shared** | Each context renders its own buttons inline |

### Two Navigator Implementations (Context for Unification)

| Aspect | `QuestionNavigator` | `ReviewQuestionNavigator` |
|--------|---------------------|---------------------------|
| Navigation | Callback: `onNavigateQuestion(questionId)` | Link: `<Link href={toQuestionRoute(...)}>` |
| Color coding | default/secondary/outline (answered status) | success/destructive/outline (correctness) |
| `aria-label` | "Question N: Current, Marked for review, Answered" | "Question N: Correct/Incorrect/Unanswered, Current" |
| `aria-current` | Not used | `aria-current="step"` on current question |

---

## Related Documentation

- [Question Rendering Architecture](../practice-engine/question-rendering-architecture.md) — canonical reference for all 6 contexts (verified accurate 2026-02-16)
- SPEC-020 — Practice Engine Completion (historical context; documents missing in-run navigation as a gap, not an intentional no-Previous decision)
- SPEC-027 — Session Review Navigation (added the inline Previous/Next row)
- SPEC-028 — Review Question Navigator (the color-coded grid)
- [BS-014](./bs-014-practice-starter-question-count-ux.md) — Practice Starter truncation (unrelated but active)
