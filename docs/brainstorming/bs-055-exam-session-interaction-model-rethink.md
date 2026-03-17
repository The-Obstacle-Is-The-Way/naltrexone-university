# BS-055: Exam Session Interaction Model — Submit Redundancy and Button Bar Inconsistency

**Date:** 2026-03-17
**Triggered by:** Manual walkthrough of exam mode. The select → submit → auto-advance flow requires too many clicks when no feedback is shown, and the bottom action bar mutates unpredictably between questions.
**Scope:** Exam mode's interaction model (click count, button presence, and navigation consistency) needs a first-principles rethink relative to tutor mode.
**Related:** [BS-054](../_archive/brainstorming/bs-054-session-end-ux-simplification.md) (session end UX), [BS-053](./bs-053-bookmark-vs-mark-for-review-collision.md) (bookmark/mark-for-review collision — resolved), [BS-037](../_archive/brainstorming/bs-037-navigation-button-ux-audit.md) (navigation button UX)

---

## The Problem

### Problem 1: Submit is redundant in exam mode

In **tutor mode**, the Submit button serves a clear purpose:

```
Select answer → Click Submit → See immediate feedback (explanation, correct/incorrect, clinical pearl)
```

The user is choosing when to reveal the answer. Submit is a deliberate "I'm ready to see if I'm right" gate. This makes sense.

In **exam mode**, Submit does almost nothing visible:

```
Select answer → Click Submit → No feedback shown → Auto-advance to next question
```

The user selects an answer, then clicks Submit, and... nothing happens except the exam moves forward. There is no feedback, no explanation, no visual payoff. Submit is a vestigial gate from tutor mode that adds a click without adding value. The auto-advance behavior (which already exists for non-last questions) proves the system knows Submit is a formality — it immediately moves past it.

**Current click count per question (exam mode):**
- Select answer: 1 click
- Click Submit: 1 click (redundant — no feedback shown)
- Auto-advance (non-last) or manual Next: 0-1 clicks
- **Total: 2-3 clicks per question**

**Ideal click count per question (exam mode):**
- Select answer: 1 click
- Click Next (or auto-advance): 0-1 clicks
- **Total: 1-2 clicks per question**

For a 25-question exam, that's 25 unnecessary clicks. Under time pressure, this friction compounds.

### Problem 2: The bottom action bar is unpredictable

The button bar mutates across four different states depending on question position and submission status:

**Q1 (not yet submitted):**
```
[ Submit ]  [ Next ]  [ Mark for review ]
```

**Q1 (submitted, auto-advances to Q2):**
User never sees this state — auto-advance fires immediately.

**Last question (not yet submitted):**
```
[ Previous ]  [ Submit ]  [ Mark for review ]
```
No Next button. No Review Answers. Submit is now in the middle.

**Last question (submitted):**
```
[ Previous ]  [ Review answers ]  [ Unmark review ]
```
Submit disappears. Review Answers appears. Mark for review becomes Unmark review.

Meanwhile, "Review answers" ALSO exists as a persistent button in the top-right corner of the page header — available on every question, at all times.

**Problems with this:**
1. The button bar shifts layout between questions — buttons appear, disappear, and change position
2. "Review answers" exists in two places (top-right header, bottom bar on last question) with identical function
3. The user can't predict what buttons will be where without looking
4. On the last question, Submit becomes a gate to seeing Review Answers — you have to submit before you can review, even though the top-right Review Answers was available all along

### Problem 3: The mental model gap between modes

Tutor and exam modes share the same underlying component (`PracticeView`) but serve fundamentally different mental models:

| Aspect | Tutor Mode | Exam Mode |
|--------|-----------|-----------|
| **Mindset** | Learning — "show me if I'm right" | Assessment — "record my answer, move on" |
| **Feedback** | Immediate — explanation, correct/incorrect | Deferred — nothing until exam submission |
| **Pacing** | Self-paced, reflective | Time-pressured, forward-moving |
| **Navigation** | Linear (Next only) | Random-access (navigator + Previous/Next) |
| **Primary action** | Submit (reveals feedback) | Select + move on |
| **Answer mutability** | Locked after submit (you saw the answer) | Freely changeable until exam is submitted |
| **"Submit" means** | "Reveal the answer for this question" | "I'm done — score the whole exam" |
| **Review** | Per-question (inline) | End-of-exam (batch) |

Despite these different mental models, both modes use Submit as the primary action. In tutor mode, Submit means "reveal." In exam mode, Submit means... "confirm I meant to click that." These are not the same operation, but the UI treats them identically.

---

## Root Cause Analysis

### Why does exam mode have a Submit button?

`PracticeView` was built as a shared component. The Submit → feedback → Next flow was designed for tutor mode, where it's essential. Exam mode was added later and conditionally hid the feedback, but the interaction skeleton (select → submit → advance) was preserved. Auto-advance was bolted on as a post-submit side effect rather than rethinking the flow.

### Why is the button bar inconsistent?

The action bar is built with conditional rendering:
- Submit shows when `canSubmit && !submitResult`
- Next shows when `!isLastQuestion && submitResult` (or always in tutor when there are more questions)
- Previous shows when `onPreviousQuestion` is provided
- Review Answers shows on last question after submit in exam mode
- Mark for review shows when `isExamMode`

Each condition is individually correct, but together they produce a bar that shifts unpredictably. The button bar was designed additively (add buttons as features landed) rather than designed as a coherent set per mode.

### Why is Review Answers in two places?

The top-right "Review answers" was added as a persistent escape hatch — users should always be able to review. The bottom-bar "Review answers" was added as the natural terminal action on the last question after submit. Both are correct in isolation, but together they create redundancy and confusion about where the "real" review action lives.

---

## Severity Assessment

**Severity: Medium-High** — Not a crash or data loss, but it's the core interaction loop of the exam experience. Every exam question is affected.

**Who is affected:** Every user taking an exam.
- **Heaviest impact:** Users taking long exams (20+ questions) where the extra clicks compound
- **Worst experience:** Users under time pressure who need to move quickly
- **Confusion risk:** Users who haven't internalized the button-bar mutation pattern

**Frequency:** Every single question in every exam session.

---

## Proposed Fix (Sketch)

### First principles: What does "Submit" actually mean?

The word "Submit" means fundamentally different things in each mode, and this is the root of the confusion:

| | Tutor Mode | Exam Mode |
|---|-----------|-----------|
| **"Submit" means** | "Reveal the answer — show me feedback" | "I'm done with the whole exam — score it" |
| **Per-question action** | Submit (reveals feedback) | Just select and move on |
| **Locking point** | Per-question — once you see the answer, it's locked | End-of-exam — nothing is locked until you submit the entire exam |
| **Analogy** | Flashcard flip | Paper exam — circle, erase, re-circle freely until you hand it in |

In tutor mode, Submit is a per-question operation that gates feedback. Correct.

In exam mode, Submit should be an **exam-level** operation, not a per-question operation. The only real "submit" in an exam is handing in the whole thing. Individual answer selections are just tentative marks on paper — freely changeable until you're done.

**The current implementation puts a per-question Submit gate in exam mode, which makes no sense because:**
1. There's no feedback to gate
2. It locks the answer permanently (you can't go back and change it)
3. It forces an unnecessary click on every single question
4. It creates the illusion that each question is a commitment, when the exam mental model is "commit everything at the end"

### Core idea: Answers are tentative until the exam is submitted.

**Exam mode flow (proposed):**

```
Question displayed
  → User clicks a choice (selection highlighted — this is a tentative mark)
  → User clicks Next to move forward (selection is saved, NOT locked)
  → User can navigate back and change any answer at any time
  → On last question: "Next" becomes "End Exam"
  → "End Exam" → Review stage → "Submit Exam" (THIS is the real submit)
```

No per-question Submit button. Answers are freely changeable until the user submits the entire exam. This matches how every real exam works — you circle an answer, move on, come back and change it if you want, and nothing is final until you hand in the test.

**Tutor mode flow (unchanged):**

```
Question displayed
  → User clicks a choice
  → User clicks Submit (reveals feedback — the real purpose of per-question submit)
  → User reads feedback
  → User clicks Next
```

Submit stays in tutor mode because it serves a real purpose: gating feedback reveal. Per-question locking is correct here because you've already seen the answer.

### Button bar (proposed, exam mode):

**Any non-last question (no answer selected):**
```
[ Previous ]  [ Next (disabled) ]  [ Mark for review ]
```

**Any non-last question (answer selected):**
```
[ Previous ]  [ Next ]  [ Mark for review ]
```

**Last question (answer selected):**
```
[ Previous ]  [ End Exam ]  [ Mark for review ]
```

**Consistent rules:**
- Previous always on the left (hidden on Q1 with spacer, per BS-037 pattern)
- Navigation action always in the middle
- Mark for review always on the right
- "Review answers" lives ONLY in the top-right header — one canonical location
- "End Exam" on the last question replaces Next and opens the review stage

### What changes from current:

| Element | Current | Proposed |
|---------|---------|----------|
| Submit button | Present in exam mode (per-question) | Removed — "Submit Exam" is the only submit |
| Answer locking | Per-question on submit (permanent) | End-of-exam on "Submit Exam" (everything unlocked until then) |
| Answer mutability | Cannot change after submit | Freely changeable — navigate back, re-select, move on |
| Auto-advance | After submit (non-last Q) | Removed — user controls pacing with Next |
| Next button | Hidden until submit | Always visible (disabled if no selection on current Q, or always enabled — TBD) |
| Previous button | Conditionally shown | Always shown (hidden on Q1) |
| Review Answers (bottom bar) | Appears on last Q after submit | Removed — top-right only |
| End Exam | Doesn't exist | Replaces Next on last question |
| Button positions | Shift between states | Fixed layout — same slots every question |
| Click count per Q | 2-3 | 1-2 |

---

## Open Questions

### Q1: Should Next auto-advance (no click needed) after selection?

**Option A — Click to advance (recommended):** User selects answer, then clicks Next. Two clicks total but both are intentional. Allows the user to change their mind before committing.

**Option B — Auto-advance on selection:** User clicks answer, immediately advances. One click total. Fastest possible, but no chance to reconsider. Accidental taps on mobile would be punishing. Also: how would "Mark for review" work if the question auto-advances?

**Option C — Configurable:** Let users toggle auto-advance in exam settings. Most flexible but adds settings complexity.

**Leaning toward A.** The ability to change your selection before committing is important in an assessment context.

### Q2: When the user navigates away from an unanswered question, what happens?

Current behavior: unanswered questions stay unanswered. The exam review stage shows them as unanswered.

Proposed: Same behavior. Clicking Next without selecting an answer should navigate forward without recording anything. The question stays unanswered and shows up as such in the review stage. This matches paper exam behavior.

### Q3: Should "End Exam" only appear on the last question, or should it always be accessible?

**Option A — Last question only:** End Exam replaces Next on the last question. Clean, but forces users to navigate to the last question to end the exam.

**Option B — Always accessible via top-right:** The "Review answers" button in the top-right IS the "end exam" escape hatch. It's already there on every question. When you click it, you go to the review stage. From there you can submit. This is already how it works — just needs clearer labeling.

**Leaning toward B.** The top-right button already serves this purpose. We just need to make sure it's clearly labeled and that the last-question "End Exam" button leads to the same place.

### Q4: When does the answer get persisted to the server?

Currently: on Submit (server action `submitAnswer`).

**Option A — Persist on navigate-away:** When the user clicks Next, Previous, or a navigator button, the selected answer is persisted. If they navigate back and change it, the new selection is persisted on the next navigation.

**Option B — Persist on selection:** Every click on a choice immediately persists to the server. Navigation just moves the view.

**Option C — Persist on exam submit only:** Keep answers in client state throughout the exam. Only persist when the user submits the entire exam.

**Leaning toward A.** Persist on navigate-away balances responsiveness with data safety. Option B creates unnecessary server traffic. Option C risks data loss if the browser crashes.

### Q5: How does this interact with the existing auto-advance after submit?

The current auto-advance behavior (exam mode, non-last questions) would be removed entirely. Navigation becomes fully user-controlled via Next/Previous/navigator. This is actually simpler — auto-advance was a band-aid for the fact that Submit didn't show feedback.

### Q6: Answer mutability — the core domain change

This is the biggest technical implication of the proposal and is **not optional** — it's the whole point.

**Current behavior:** `submitAnswer` is a one-way, per-question lock. Once submitted, the answer cannot be changed even if you navigate back. This is correct for tutor mode (you've seen the feedback — changing the answer would be cheating).

**Required behavior for exam mode:** Answers must be changeable until the entire exam is submitted. The user should be able to navigate back to any question, see their previous selection, change it, and move on. Nothing is final until "Submit Exam."

**Implementation approaches (need domain analysis):**

1. **Save-as-draft + batch finalize:** Introduce a `saveAnswer` (or `selectAnswer`) operation that persists the selection without locking it. A separate `finalizeExam` operation locks all answers at once and triggers scoring. This is the cleanest domain model — it separates "I picked C" from "I'm done."

2. **Allow overwrite until exam submission:** Let `submitAnswer` be called multiple times per question in exam mode. The last call wins. `endSession` triggers scoring on whatever the final answers are. Simpler to implement but muddies the domain semantics of "submit."

3. **Client-only until exam submit:** Keep all selections in client state. Only call `submitAnswer` for each question when the user clicks "Submit Exam." Simplest domain model but risks data loss on browser crash/refresh mid-exam.

**Leaning toward approach 1.** It's the most honest domain model — a "draft answer" and a "submitted answer" are genuinely different things. But approach 2 may be pragmatic if the domain refactor is too large.

**Note:** This change ONLY affects exam mode. Tutor mode continues to use the current one-way `submitAnswer` — once you've seen the feedback, the answer is locked. That's correct behavior.

### Q7: Does tutor mode need any changes?

**For now: No.** Tutor mode's Submit → feedback → Next flow is correct for its mental model. Submit gates the feedback reveal, which is a real user action.

There's a softer question of whether tutor mode could also merge Submit into Next (click Next → auto-submit → show feedback inline), but that's a separate concern and lower priority. The current tutor flow works. Park this.

### Q8: Could exam mode changes accidentally break tutor mode?

**This is the highest implementation risk.** Both modes share `PracticeView`, `QuestionCard`, `usePracticeSessionQuestionFlow`, and `question-flow-actions.ts`. The exam changes (remove per-question Submit, add answer mutability, change persistence model) will touch these shared components.

**Guard rails needed:**
- Every shared component change must be validated against BOTH modes
- The `isExamMode` / `shouldShowExplanationForMode()` branching points are the seams — changes should happen at these seams, not in shared logic
- Tutor mode's existing test coverage must stay green throughout
- If a shared component needs to behave differently, prefer explicit mode branching over removing shared behavior

**Current shared component risk map:**

| Shared Component | Exam Change Needed | Tutor Impact Risk |
|-----------------|-------------------|-------------------|
| `PracticeView` (action bar) | Remove Submit button, change Next behavior | HIGH — Submit must stay for tutor |
| `QuestionCard` + `ChoiceButton` | Allow re-selection after "submit" | MEDIUM — tutor locks choices after submit, must keep that |
| `question-flow-actions.ts` | New save-draft path vs one-way submit | HIGH — tutor's submit must remain one-way |
| `usePracticeSessionQuestionFlow` | Navigation without submission | HIGH — tutor's submit-then-navigate must stay |
| `usePracticeSessionReviewStage` | No change (exam only already) | NONE |
| `usePracticeSessionMarkForReview` | No change (exam only already) | NONE |

---

## Deliverables

### Deliverable 1: Mode Interaction Contract Documentation

Before implementation, we need a canonical doc that specifies exactly how tutor and exam modes differ at the interaction level — not just "explanations are deferred" (which `practice-modes.md` already covers) but the full click-by-click contract:

- What buttons appear, in what positions, in what states
- What each click does (what gets persisted, what gets shown, what navigates)
- When answers are locked and why
- What "Submit" means in each mode
- How navigation works (linear vs random-access)
- The post-session flow (summary → review → bookmark)

**Target location:** New section in `docs/practice-engine/practice-modes.md` (Section 7: "Interaction Contracts") or a dedicated `docs/practice-engine/interaction-contracts.md` if it's too large.

**Why this matters:** The current `practice-modes.md` describes the backend lifecycle and data flow. It says nothing about the frontend interaction model — which buttons, which clicks, which states. That's the gap that let vestigial tutor-mode patterns (per-question Submit, answer locking) persist into exam mode unchallenged. Without a written contract, the next person who touches `PracticeView` will have to reverse-engineer the intended differences from code.

**This doc should be written AFTER BS-055 decisions are made but BEFORE implementation begins.** It serves as the implementation spec's interaction layer.

### Deliverable 2: Chrome Agent Audit Findings

Incorporate any new findings from the Chrome agent's full exam flow walkthrough (queued above). Especially:
- Post-submit review stage UX
- Session summary → question review handoff
- Any button/state issues not yet captured in this doc

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-17 | BS-055 opened | Exam mode interaction model is too clicky and button bar is unpredictable; needs first-principles rethink |
| 2026-03-17 | First-principles reframe: "Submit" = exam-level, not per-question | Per-question Submit makes no sense without feedback. The real Submit is ending the exam. Answers must be freely changeable until then — like a paper exam. This is the core insight, not just a UX tweak. |
| 2026-03-17 | Chrome agent audit queued | Full exam flow walkthrough to catch post-submit/review-stage issues not yet documented |
| 2026-03-17 | Added shared component risk map + documentation deliverable | Both modes share PracticeView/QuestionCard/flow hooks. Changes must branch at mode seams, not rip out shared behavior. A mode interaction contract doc is needed before implementation. |
| 2026-03-17 | Tutor mode Submit: keep for now | Submit gates feedback reveal — it has a real purpose. Merging Submit into Next for tutor is a softer future question, not part of this scope. |
