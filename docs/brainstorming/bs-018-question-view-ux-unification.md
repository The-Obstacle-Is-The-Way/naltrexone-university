# BS-018: Question View UX Unification — Navigation, State, and Action Bar Consistency

**Date:** 2026-02-16
**Triggered by:** Live UI audit (Chrome agent walkthrough) + codebase analysis across all 5 question-viewing contexts
**Scope:** The 5 question-viewing contexts have diverged in navigation placement, action bar composition, and state persistence — creating a disjointed UX that undermines the product's learning experience
**Related:** [Question Rendering Architecture](../practice-engine/question-rendering-architecture.md), [BUG-133](../_archive/bugs/bug-133-stale-closure-auto-advance.md), [BUG-134](../_archive/bugs/bug-134-mark-for-review-race-condition.md), SPEC-027, SPEC-028

---

## The Problem

Five distinct question-viewing contexts have been built feature-by-feature over time. Each works correctly in isolation, but they've diverged in three critical ways that make the product feel assembled rather than designed:

### Concern 1: Sequential Navigation Lives in Different Places

| Context | Where Previous/Next Lives | What Exists |
|---------|--------------------------|-------------|
| Tutor Mode (active) | Bottom action bar | "Next Question" only — **no Previous** |
| Exam Mode (active) | Bottom action bar | "Next Question" only — **no Previous** |
| History Session Review | Inline row ABOVE question content | "← Previous / Question X of Y / Next →" |
| History Individual Review | Nowhere | No sequential nav (correct — no session context) |
| Exam Review Stage | N/A | Checklist UI, no sequential nav (correct) |

The user sees Previous/Next at the top in one context and at the bottom in another. In active practice, Previous doesn't exist at all — the only way to go back is via the Question Navigator grid.

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
| Practice (after submit, Tutor) | [Next Question] [Bookmark] (Submit disabled) |
| History Session Review | [Try Again] [Back to History] |
| History Individual Review | [Try Again] [Back to History] |
| Exam Review Stage | [Submit Exam] (with confirmation dialog) |
| Exam History Review (unanswered Q) | [Submit] only — no Try Again, no Back, no Next |

The Exam History Review case is particularly surprising: it shows a lone "Submit" button with no way to navigate to the next question or return to the history page from the bottom bar.

### Concern 4: Redundancy Between Navigator Grid and Inline Previous/Next

In History Session Review, the user has TWO mechanisms for moving between questions:
1. The Question Navigator grid (random-access: click any question number)
2. The inline "← Previous / Next →" row immediately below the grid

These serve different purposes (random-access vs sequential), but placing them adjacent at the top creates visual noise and forces the user to scroll back up after reading a long explanation to advance.

### Concern 5: No Previous Button in Active Practice

Active practice has "Next Question" in the bottom bar but no "Previous Question." The only way to revisit a question is via the Question Navigator grid. This is documented as intentional in SPEC-020 ("answer linearly, don't second-guess"), but the rationale may not hold for Tutor mode where the point is learning, not testing.

**Open question:** Should Previous be added to Tutor mode only? Or to both modes? Exam mode has a legitimate reason to discourage backtracking (simulating real exam conditions), but Tutor mode's purpose is exploration and learning.

---

## Root Cause Analysis

The divergence happened because each context was built as a separate feature with its own spec:

- Active Practice (SPEC-013, SPEC-020) — built first, focused on forward-only flow
- History Session Review (SPEC-027) — built later, added Previous/Next as inline row
- Exam Review Stage — built for exam-specific checklist review
- Individual Question Review — minimal view, no session context

No single spec ever unified the navigation and action bar patterns across all contexts. Each spec solved its own problem correctly but didn't reconcile with the others. This is a textbook example of **convergence debt** — the features work individually but haven't been reconciled into a cohesive system.

---

## Severity Assessment

| Concern | Severity | Who's Affected | How Often |
|---------|----------|----------------|-----------|
| Tutor state persistence bug | **High** | Every Tutor mode user who revisits a question | Every session |
| Navigation placement inconsistency | Medium | Users who use both Practice and History Review | Frequent |
| Missing Previous in active practice | Medium | Tutor mode users who want to re-read an explanation | Frequent |
| Exam History Review incomplete action bar | Low | Users reviewing unanswered exam questions | Rare |
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
| History Session Review | [← Previous] [Next →] [Try Again] [Back to History] |
| History Individual Review | [Try Again] [Back to History] |
| Exam Review Stage | [Submit Exam] (unchanged) |

### Key Changes from Current State

1. **Add Previous to active Practice bottom bar** (both Tutor and Exam)
2. **Remove inline "← Previous / Next →" row from History Session Review** — move to bottom bar
3. **Keep "Question X of Y"** as a non-interactive status label near the heading
4. **Fix Tutor state persistence** — answered questions must render their full post-submission state on revisit
5. **Complete Exam History Review action bar** — add Back to History and sequential nav

### Tutor State Persistence Fix Direction

Two approaches documented in the architecture doc:

1. **Backend enhancement:** Extend `NextQuestion` response to include `correctChoiceId`, `explanationMd`, `choiceExplanations` when the question was previously answered in the session. Authoritative and survives page refresh.
2. **Client-side cache:** Store `submitResult` per-questionId in a `Map<string, SubmitAnswerOutput>` ref, restore from cache on revisit. Frontend-only, faster to implement, but doesn't survive page refresh.

**Recommendation:** Approach 1 (backend enhancement) is cleaner and aligns with how History Review already works. The data exists server-side; we just need to include it in the response.

---

## Open Questions

1. **Should Previous be added to Exam mode?** Exam mode simulates real test conditions. Real exams (USMLE, bar exam) allow going back. But SPEC-020 explicitly chose forward-only for pedagogical reasons. Does the Question Navigator grid provide sufficient backward navigation for Exam mode?

2. **Should the inline "← Previous / Next →" row be removed entirely from History Review, or kept as a secondary affordance?** Removing it is cleaner but requires users to scroll to the bottom after reading explanations. The Question Navigator grid at the top already provides random-access.

3. **Should we extract a shared `QuestionActionBar` component?** Currently, each context renders its own buttons inline (4 different implementations). A shared component with mode/context props would prevent future drift. But the button sets differ enough that the abstraction might add more complexity than it saves.

4. **Should this be one spec or multiple?** The Tutor state persistence bug is a clear standalone fix. The navigation/action bar unification could be a separate spec. Or they could be combined since they both touch the same files.

5. **Does adding Previous to Practice break any existing tests or specs?** SPEC-020 explicitly documents the no-Previous decision. Any change needs to update that spec's rationale.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-16 | Document created | Live UI audit revealed 5 concerns across all question-viewing contexts |
| 2026-02-16 | Tutor state persistence identified as highest priority | Core pedagogical bug that defeats the purpose of Tutor mode |
| 2026-02-16 | Bottom-bar-only navigation proposed | Reduces redundancy, aligns with where user attention lands after reading content |

---

## Related Documentation

- [Question Rendering Architecture](../practice-engine/question-rendering-architecture.md) — canonical reference for all 5 contexts
- SPEC-020 — Practice Session UX (documents intentional no-Previous decision)
- SPEC-027 — Session Review Navigation (added the inline Previous/Next row)
- SPEC-028 — Review Question Navigator (the color-coded grid)
- [BS-014](./bs-014-practice-starter-question-count-ux.md) — Practice Starter truncation (unrelated but active)
