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

Worse, the current exam bar already exposes **Next** before submit. That means exam mode currently has **two forward actions with different semantics**:

- **Submit** = record the answer, lock it, then auto-advance on non-last questions
- **Next** = navigate away without recording anything

So a highlighted selection in exam mode is visually meaningful but **not durable** until Submit is pressed. If the user selects B and clicks Next, the view advances and that selection is discarded. This is a bad interaction contract: the UI implies "you picked B," but the system treats that state as provisional and throwaway unless the user understands the hidden Submit rule.

**Current click count per answered question (exam mode):**
- Select answer: 1 click
- Click Submit: 1 click (required to actually record the answer)
- Auto-advance (non-last) or manual Review Answers on the last question: 0-1 clicks
- **Total: 2-3 clicks per answered question**

**Current click count to skip a question (exam mode):**
- Click Next: 1 click
- **Total: 1 click**

**Ideal click count per question (exam mode):**
- Select answer: 1 click
- Click Next: 1 click
- **Total: 2 clicks to answer and advance, 1 click to skip**

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
- Next shows whenever there is a next question, regardless of whether the current exam answer has been submitted
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

## Proposed Fix (Recommended Interaction Contract)

### First principles: What does "Submit" actually mean?

The word "Submit" means fundamentally different things in each mode, and this is the root of the confusion:

| | Tutor Mode | Exam Mode |
|---|-----------|-----------|
| **"Submit" means** | "Reveal the answer — show me feedback" | "I'm done with the whole exam — score it" |
| **Per-question action** | Submit (reveals feedback) | Select, navigate, and review later |
| **Locking point** | Per-question — once you see the answer, it's locked | End-of-exam — nothing is final until you submit the exam |
| **Analogy** | Flashcard flip | Paper exam — circle, erase, re-circle freely until you hand it in |

In tutor mode, Submit is a per-question operation that gates feedback. Correct.

In exam mode, Submit should be an **exam-level** operation, not a per-question operation. The only real submit is handing in the whole exam. Individual answer selections are draft state until then.

### Core idea: exam answers are drafts until "Submit exam"

**Exam mode flow (recommended):**

```text
Question displayed
  → User may select a choice (local draft)
  → User may click Next / Previous / navigator / Review answers
  → Leaving the question persists the current selection as a draft, if one exists
  → User may revisit any question and change the draft answer
  → Review stage shows answered / unanswered / marked counts
  → "Submit exam" finalizes the exam and reveals correctness/explanations
```

No per-question Submit button. No per-question locking. No auto-advance. No frozen post-submit dead-end state.

**Tutor mode flow (unchanged):**

```text
Question displayed
  → User clicks a choice
  → User clicks Submit
  → Immediate feedback appears
  → User clicks Next
```

Submit stays in tutor mode because it serves a real purpose: gating feedback reveal. Per-question locking remains correct there because the user has already seen the answer.

### Recommended active exam controls

**Any non-last question:**
```text
[ Previous ]  [ Next ]  [ Mark for review ]
```

**Last question:**
```text
[ Previous ]  [ Review answers ]  [ Mark for review ]
```

**Header action on every question:**
```text
[ Review answers ]
```

**Contract rules:**
- Previous always occupies the left slot (hidden on Q1 with spacer, per BS-037).
- The middle slot is the sequential progression control: `Next` on non-last questions, `Review answers` on the last question.
- `Review answers` remains available in the header as the persistent escape hatch from anywhere in the exam.
- The last-question middle button intentionally mirrors the header action. That duplication is acceptable because both label and destination are identical; it replaces the current harmful duplication where bottom-bar `Review answers` appears only after a dead-end submit state.
- Next is always enabled. If no choice is selected, it skips the question and persists nothing. If a choice is selected, leaving the question saves the draft answer.
- Mark for review remains available only while the user is actively taking the exam, not after a pseudo-submit freeze state.

### What changes from current

| Element | Current | Proposed |
|---------|---------|----------|
| Submit button | Present in exam mode (per-question) | Removed from active exam flow; `Submit exam` is the only submit |
| Selection durability | Highlighted choice is only visual until Submit; clicking Next drops it | Leaving the question persists the current selection as a draft |
| Answer locking | Per-question on submit (permanent) | End-of-exam on `Submit exam` |
| Answer mutability | Cannot change after submit | Freely changeable until exam submission |
| Auto-advance | After submit on non-last exam questions | Removed entirely |
| Next button | Visible before submit, but navigates without saving | Visible on every non-last question and acts as the save-or-skip boundary |
| Skip behavior | Supported implicitly via Next, but ambiguous | Supported intentionally; unanswered stays unanswered |
| Last-question primary action | Submit, then separate Review Answers step | `Review answers` directly |
| Review Answers (header) | Persistent, but semantically overlaps with bottom-bar rescue state | Persistent global escape hatch into review stage |
| Review Answers (bottom bar) | Appears after last-question submit | Used only as the last-question middle-slot progression action |
| Button positions | Shift between states | Fixed slots every question |
| Click count to answer and advance | 2-3 | 2 |

---

## Decisions

### Q1: Should Next auto-advance after selection?

**Decision:** No. Exam mode should require an explicit navigation click.

**Rationale:** Auto-advance is fast, but it makes accidental taps punishing, weakens mark-for-review utility, and removes the user’s chance to reconsider before leaving the question. The right fast path is `select → Next`, not `select → surprise navigation`.

### Q2: What happens when the user leaves an unanswered question?

**Decision:** Skipping is allowed. If the user leaves with no selection, nothing is persisted and the question remains unanswered.

**Rationale:** Exams need a real skip behavior. Forcing an answer before navigation makes review-stage counts less meaningful and makes mark-for-review less useful. Current exam mode already exposes skip via Next; the fix is to make that behavior intentional rather than accidental.

### Q3: Should review / end-exam affordances be last-question only?

**Decision:** `Review answers` stays accessible from every question in the header. On the last question, the middle footer action also becomes `Review answers`. Do **not** label this `End Exam`.

**Rationale:** The user should be able to leave the question loop at any time. But the action does not actually submit the exam; it opens the review checklist. `End Exam` would be misleading because the real terminal action is still `Submit exam` inside the review stage.

### Q4: When should answers persist?

**Decision:** Persist on the navigation boundary: Next, Previous, navigator jump, or entry into the review stage.

**Rationale:** This is the best initial tradeoff. Persisting on every radio click is noisy and makes every tentative tap a server mutation. Persisting only on final submit risks catastrophic loss on refresh/crash. The navigation boundary is deliberate and aligns with the mental model of "I’m moving on from this version of my answer."

**Important detail:** entering the review stage from the header or from the last-question middle button must also save the current question’s selection if one exists.

### Q5: What happens to auto-advance?

**Decision:** Remove it entirely from exam mode.

**Rationale:** Auto-advance is a workaround for a redundant Submit button. Once Submit disappears, auto-advance has no job left. User-controlled pacing is simpler and more predictable.

### Q6: What is the correct mutability / persistence model?

**Decision:** Use **save-as-draft + finalize exam**. Do not overload `submitAnswer` for mutable exam behavior.

**Recommended contract:**
1. Add an exam-only draft-save operation that persists the current selected choice into session state without finalizing the question.
2. Allow draft answers to be overwritten freely until final exam submission.
3. On `Submit exam`, materialize one final attempt per answered question from the final draft selections, then end the session.
4. Tutor mode continues to use the existing one-shot `submitAnswer` path unchanged.

**Why this wins:**
- It keeps the meaning of "submit" honest.
- It avoids fighting the existing one-attempt-per-session-question constraints.
- It preserves tutor semantics instead of muddying both modes with one overloaded mutation.

**Clarification after code verification:** current `questionStates.latestSelectedChoiceId`, `latestIsCorrect`, and `latestAnsweredAt` are populated only by `recordQuestionAnswer(...)`. They are **post-submit fields today**, not an existing draft model.

**Recommended data-shape decision:** add explicit draft fields (or an equivalent nested draft object) to per-question session state instead of repurposing `latest*`. Keep `latest*` reserved for finalized answer state so summary/stats semantics remain honest and tutor mode stays clean.

**Hidden technical dependency that must be specced:** revisitable exam answers break the current one-shot `timeSpentSeconds` model. The draft path needs a defined per-question accumulation rule plus draft-aware reads in `GetNextQuestion`, `GetPracticeSessionReview`, and `GetIncompletePracticeSession`, so final attempts do not lose or undercount dwell time and active exam surfaces do not keep reading the wrong field.

### Q7: Does tutor mode need changes now?

**Decision:** No.

**Rationale:** Tutor mode’s Submit → feedback → Next contract is coherent and should remain intact. There may be future tutor simplifications, but BS-055 should not absorb them.

### Q8: How do we avoid breaking tutor mode while fixing exam mode?

**Decision:** Split the mode-specific action and mutation paths explicitly. Keep shared question rendering where it helps, but stop forcing both modes through one conditional action-bar contract.

**Guard rails:**
- `PracticeView` should not continue evolving as one dense conditional matrix for both modes. Extract explicit tutor vs exam action-bar branches or dedicated subcomponents.
- Tutor mode keeps the current `submitAnswer` path.
- Exam mode gets a separate draft-save + finalize path.
- Shared components (`QuestionCard`, navigator, review-stage checklist) can remain shared, but the action contract cannot stay implicit.
- Validate shared-file edits against both tutor and exam tests every time.

**Current shared component risk map:**

| Shared Component | Exam Change Needed | Tutor Impact Risk |
|-----------------|-------------------|-------------------|
| `PracticeView` (action bar) | Remove per-question Submit, replace with save-or-skip navigation contract | HIGH — split mode-specific action bars here |
| `QuestionCard` + `ChoiceButton` | Allow exam re-selection across revisits without tutor regression | MEDIUM |
| `question-flow-actions.ts` | Add draft-save path and remove exam dependence on submit-to-advance | HIGH |
| `usePracticeSessionQuestionFlow` | Support draft persistence on navigation boundaries | HIGH |
| `usePracticeSessionReviewStage` | Save current draft before entering review | MEDIUM |
| `usePracticeSessionMarkForReview` | Keep behavior, but only in active exam flow | LOW |

---

## Deliverables

### Deliverable 1: Canonical interaction-contract doc (DONE)

Written at [`docs/practice-engine/interaction-contracts.md`](../practice-engine/interaction-contracts.md), linked from `practice-modes.md`.

**Why dedicated instead of expanding `practice-modes.md`:** the current modes doc is lifecycle/data-flow oriented. The missing artifact is a click-by-click UI contract. That is large enough, and important enough, to deserve its own canonical page.

**Minimum contents:**
- Active tutor contract
- Active exam contract
- Persistence boundaries
- Locking rules
- Review-stage entry rules
- Summary → review → back-navigation rules
- Mode-specific action-bar maps

### Deliverable 2: Implementation-spec inputs

Before coding, the implementation spec must explicitly answer:
- What the draft-save API is called and which layer owns it
- What the draft-state shape is (`draft*` fields vs equivalent object) and how it coexists with finalized `latest*` fields
- How per-question draft time is accumulated
- Which readers (`GetNextQuestion`, `GetPracticeSessionReview`, `GetIncompletePracticeSession`, and summary/review projections) become draft-aware during active exam sessions
- When final attempts are materialized
- How the summary review link returns to the summary instead of History
- Whether post-submit session review reattempt remains allowed or is split into separate follow-up work

---

## Audit Findings (Screenshots + Code Verification)

The screenshot walkthrough was useful, but the repo code adds important corrections and exposes one additional active issue. For this doc, **current source code is the tie-breaker**.

### Active findings that BS-055 should track

#### AF-1: Post-submit dead-end state on last question (Medium)

After submitting the last question, the user is left on a frozen question state with disabled choices and nothing meaningful to do except click `Review answers`. This state should disappear entirely under the recommended contract.

#### AF-2: Mark-for-review persists into the dead-end post-submit state (Low)

`Mark for review` / `Unmark review` remains available after the last question is already locked, which weakens the meaning of that control. Under the recommended contract, mark-for-review exists only during active exam-taking.

#### AF-3: Primary action position shift creates a misclick trap (High)

The active primary action moves between slots:

| State | Pos 1 | Pos 2 | Pos 3 |
|-------|-------|-------|-------|
| **Q1 (before submit)** | **Submit** | Next | Mark for review |
| **Q2 (before submit)** | Previous | **Submit** | Mark for review |
| **Q2 (after submit)** | Previous | **Review answers** | Mark for review |

Users can build spatial memory quickly. Moving the primary action between positions is a real input-risk problem, not just visual inconsistency.

#### AF-4: Session Summary-launched review has the wrong return target (Medium)

The current summary surface launches question review with `from=history`, so the question review page resolves its back target to History rather than the session summary route. This affects both the primary `Review your answers` CTA and the per-question breakdown links rendered on the summary.

**Required fix:** summary-launched review must carry a session-summary-aware origin/back target instead of masquerading as History.

#### AF-5: Current exam mode exposes two forward actions with contradictory semantics (High)

Code verification shows `PracticeView` already renders `Next` before submit. In current exam mode:

- `Submit` records and locks the answer
- `Next` navigates away without recording anything

That means a selected answer looks committed, but is silently dropped if the user presses the wrong forward control. This is a core contract bug and should be tracked explicitly in BS-055.

**Scope audit (2026-03-17):** The root cause is `runLoadQuestionFlow` in `question-flow-actions.ts:71`, which unconditionally resets `selectedChoiceId` to `null` on every navigation — regardless of whether the answer was submitted.

| Flow | Vulnerable? | Notes |
|------|------------|-------|
| Exam mode Next | **YES** | Next visible pre-submit, discards selection |
| Exam navigator jumps | **YES** | Same code path as Next |
| Tutor mode Next | **YES (low severity)** | Same code path, but users naturally submit first to see feedback |
| Quick Practice | No | Next is gated behind submit (not visible pre-submit) |
| Question Review | No | Uses Link-based navigation (page reload) |

The proposed draft-save-on-navigation model fixes this for exam mode. Tutor mode should also guard against this (either disable Next pre-submit, or save before navigating), but that is a lower-priority follow-up.

#### AF-6: Post-submit session review still exposes reattempt actions (Cross-cutting, Medium)

Current question review code still renders `Practice Again` / `Try Again` and wires `onReattempt` for session-review contexts via `retryOrigin = 'session_review'`. That is outside the active exam-session loop, but it still weakens exam finality and deserves a separate follow-up if not handled in the eventual spec.

### Corrections after code verification

- The earlier label-inconsistency claim (`Practice Again` vs `Try Again`) is **not an active source-level bug** in the current repo. `question-page-client.tsx` now derives that label from correctness, and tests cover the correct standalone-review cases.
- The more important post-exam problems are the wrong back target and the still-available session-review reattempt action, not the label text itself.
- The current `Next` button is **not** hidden until submit. It is already visible pre-submit except on the last question. The real bug is that its semantics are disconnected from the visible selection state.

### Things that work well

| Element | Notes |
|---------|-------|
| **Review stage checklist** | Answered / unanswered / marked summary is clear and useful. |
| **Submit exam confirmation dialog** | Good confirmation pattern with clear destructive action. |
| **Session summary cards** | Stats hierarchy is strong and does not need a redesign. |
| **Post-exam review content structure** | Color-coded navigator, explanations, clinical pearl, and references are strong. The issue is navigation/reattempt semantics, not the content layout. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-17 | BS-055 opened | Exam mode interaction model is too clicky and button bar is unpredictable; needs first-principles rethink |
| 2026-03-17 | First-principles reframe: "Submit" = exam-level, not per-question | Per-question Submit makes no sense without feedback. The real Submit is ending the exam. Answers must be freely changeable until then — like a paper exam. This is the core insight, not just a UX tweak. |
| 2026-03-17 | Chrome agent audit queued | Full exam flow walkthrough to catch post-submit/review-stage issues not yet documented |
| 2026-03-17 | Added shared component risk map + documentation deliverable | Both modes share PracticeView/QuestionCard/flow hooks. Changes must branch at mode seams, not rip out shared behavior. A mode interaction contract doc is needed before implementation. |
| 2026-03-17 | Tutor mode Submit: keep for now | Submit gates feedback reveal — it has a real purpose. Merging Submit into Next for tutor is a softer future question, not part of this scope. |
| 2026-03-17 | Q1-Q8 closed | Explicit Next, intentional skipping, review-stage entry from any question, navigation-boundary draft persistence, no exam auto-advance, save-as-draft + finalize as the required domain model, tutor unchanged, and explicit mode-branching as the regression guardrail. |
| 2026-03-17 | Code verification corrected screenshot-only assumptions | Current source shows Next is already visible pre-submit and can discard a highlighted answer. That contract bug is more important than the earlier label-inconsistency claim. |
| 2026-03-17 | `Practice Again` / `Try Again` inconsistency de-scoped from BS-055 | Current source derives the label from correctness and tests cover the expected standalone-review behavior. The active post-exam issues are back-targeting and session-review reattempt semantics, not label text. |
| 2026-03-17 | Biggest remaining implementation risk identified | Mutable exam answers require a draft-save path plus a per-question time-accumulation model. Without that, final attempts will have broken or undercounted `timeSpentSeconds`. |
| 2026-03-17 | AF-5 scope audit completed | Silent-discard bug affects exam Next, exam navigator jumps, AND tutor Next (low severity). Quick Practice and Question Review are safe. Root cause: `runLoadQuestionFlow` unconditionally resets `selectedChoiceId`. |
| 2026-03-17 | Common digital-assessment research completed | External research directionally supported save-as-draft + batch finalize and stopwatch-style time accumulation. The contract no longer depends on brand-specific precedent. |
| 2026-03-17 | Interaction contract doc written | `docs/practice-engine/interaction-contracts.md` — canonical click-by-click contracts for tutor, exam, and quick practice modes. Linked from `practice-modes.md`. |
| 2026-03-17 | Draft-state semantics clarified | `latestSelectedChoiceId/latestIsCorrect/latestAnsweredAt` are current post-submit fields only. Recommended path: add explicit draft fields and make active exam readers draft-aware instead of overloading `latest*`. |
