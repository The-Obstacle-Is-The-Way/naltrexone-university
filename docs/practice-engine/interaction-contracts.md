# Practice Engine: Interaction Contracts

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Click-by-click UI contracts for tutor and exam modes — buttons, persistence, locking, navigation, and post-session flows
> **Related:** [Practice Modes](./practice-modes.md) (lifecycle/data), [BS-055](../brainstorming/bs-055-exam-session-interaction-model-rethink.md) (decisions)
> **Status:** Current implementation. Historical BS-055 rationale remains, but the contracts below now describe shipped behavior; follow-up deltas are tracked separately in debt docs where noted.
> **Last Updated:** 2026-03-19

---

## 1. Design Principles

These principles govern both modes. They are derived from BS-055 first-principles analysis and informed by common digital-assessment patterns. The key point for this repo is the contract itself, not the brand-specific precedent.

1. **"Submit" means one thing per mode.** In tutor mode, Submit = "reveal feedback for this question." In exam mode, Submit = "finalize the entire exam." There is no per-question submit in exam mode.
2. **Buttons don't move.** Action bar slots are fixed per mode. The user builds spatial memory — shifting button positions causes misclicks.
3. **What you see is what gets saved.** If the UI shows a highlighted selection, that selection must be durable. A visual state that silently disappears on navigation is a contract violation.
4. **Exam answers are drafts until the exam is submitted.** Like a paper exam — circle, erase, re-circle freely until you hand it in. Nothing is locked until `Submit exam`.
5. **Tutor answers are locked after feedback.** Once you see the correct answer, your response is permanently recorded. This prevents gaming.

---

## 2. Tutor Mode Contract

### Mental model

Flashcard-style learning. Submit gates the feedback reveal. Each question is a self-contained learn-then-advance cycle.

### Flow

```text
Question displayed
  → User selects a choice
  → User clicks Submit
  → Feedback appears (correct/incorrect, explanation, clinical pearl)
  → Answer is locked — choices become non-interactive
  → User clicks Next to advance
```

### Action bar layout

**Before submit (answer selected):**
```text
[ Submit ]  [ Next (outline) ]  [ Bookmark ]
```

**After submit (feedback visible):**
```text
[ spacer ]  [ Next (default) ]  [ Bookmark ]
```

**Q1 (no Previous):**
```text
[spacer]  [ Submit / Next ]  [ Bookmark ]
```

**Contract rules:**
- Submit occupies position 1. Hidden after feedback is revealed (becomes spacer).
- Next occupies position 2. Always visible when there are more questions. Variant changes from outline → default after submit to signal "advance."
- Bookmark occupies position 3.
- Previous is hidden in tutor mode (linear progression only).

### Persistence

- Answer is persisted via `submitAnswer` when Submit is clicked. One-shot, permanent.
- `attempts` table unique constraint `(practiceSessionId, questionId)` enforces single-answer-per-question.
- `timeSpentSeconds` = `now - questionLoadedAt`, captured at submit time.

### Locking

- Per-question, on submit. Once feedback is shown, the answer cannot be changed.
- This is correct because the user has seen the correct answer.

### Implementation note

Tutor mode is **unchanged** by BS-055. The current implementation matches this contract, with one exception:

**Known issue (AF-5):** Next is currently visible and clickable before submit. If clicked pre-submit, the selected answer is silently discarded (`runLoadQuestionFlow` resets `selectedChoiceId` at `question-flow-actions.ts:71`). This is a low-severity UX issue in tutor mode because users naturally click Submit first to see feedback, but it should be guarded — either disable Next pre-submit, or save the selection before navigating.

---

## 3. Exam Mode Contract (Current Implementation)

### Mental model

Paper exam. Select answers, navigate freely, change your mind, hand it in when done.

### Flow

```text
Question displayed
  → User may select a choice (local draft, highlighted)
  → User clicks Next / Previous / navigator button / Finish exam
  → Leaving the question persists the current selection as a draft (if one exists)
  → User may revisit any question and change the draft answer freely
  → Review stage shows answered / unanswered / marked counts
  → "Submit exam" finalizes all answers in a single transaction
  → Feedback and scores become visible
```

### Action bar layout

**Any non-last question:**
```text
[ Previous ]  [ Next ]  [ Mark for review ]
```

**Last question:**
```text
[ Previous ]  [ Next ]  [ Mark for review ]
```

**Header (every question):**
```text
                                          [ Finish exam ]
```

**Contract rules:**
- Previous always occupies position 1 when available. On Q1, slot 1 is empty; there is no spacer.
- Position 2 is the sequential progression control: `Next` on every question. On the last question, clicking `Next` enters the review stage.
- `Mark for review` always occupies position 3.
- `Finish exam` lives in the header as a persistent escape hatch — accessible from any question.
- Next is always enabled. No selection = skip (navigate without saving). Selection exists = save draft and advance.
- **No Submit button in the action bar.** The only submit is `Submit exam` inside the review stage.

### Persistence model: Save-as-draft + finalize

This is the BS-055-selected model for mutable exam answers: draft state while the session is `in_progress`, then batch finalization when the user clicks `Submit exam`.

#### Draft-save triggers

| Trigger | What it catches |
|---------|-----------------|
| **Navigation boundary** (Next, Previous, navigator jump) | User moves on — save current selection |
| **Review stage entry** (`Finish exam` header or last-question `Next`) | User wants to review — save current question first |
| **Periodic autosave** (every 30-60 seconds, future enhancement) | User sits on one question for a long time, then crashes |
| **`visibilitychange` / `beforeunload`** (future enhancement) | Tab switch, browser close |

The navigation boundary is the minimum viable persistence point. Autosave and visibility-change saves are recommended follow-ups for crash resilience but are not required for the initial implementation.

#### Draft storage

Drafts should continue to live in session-scoped state on `practice_sessions`, but the current `questionStates` shape is **not already a draft model**.

Today, `questionStates.latestSelectedChoiceId`, `latestIsCorrect`, and `latestAnsweredAt` are written only by `recordQuestionAnswer(...)`. In current source, they represent **recorded post-submit answer state**, not mutable draft state.

**Recommendation:** keep `questionStates` as the container, but add explicit exam-draft fields instead of silently redefining `latest*`.

Suggested shape (names can change in the implementation spec):
- `draftSelectedChoiceId: string | null`
- `draftSavedAt: string | null`
- `draftCumulativeMs: number`

Keep `latestSelectedChoiceId`, `latestIsCorrect`, and `latestAnsweredAt` reserved for finalized answer state. That preserves current summary/stat semantics and avoids overloading one field with two different lifecycle meanings.

**Reader implication:** current readers such as `GetNextQuestion`, `GetPracticeSessionReview`, and `GetIncompletePracticeSession` derive answered/unanswered state from `latestSelectedChoiceId`. Under the draft model, active exam-session reads must become draft-aware.

#### Finalization

When the user clicks `Submit exam` in the review stage:

1. Save the current question's selection (if any unsaved draft exists).
2. In a single database transaction:
   - For each question with a draft answer: run a finalization write path that creates exactly one `attempts` row and writes finalized `latestSelectedChoiceId`, `latestIsCorrect`, and `latestAnsweredAt` exactly once.
   - Call `EndPracticeSession` to compute totals and transition session to `completed`.
3. Return results. Feedback and scores become visible.

This preserves the existing `attempts` table constraint — each answered question gets exactly one final answer write, but it happens at exam submission rather than during the question loop.

#### Per-question time accumulation

Current model: `timeSpentSeconds = now - questionLoadedAt` (single-shot, captured on submit).

**Proposed model: Stopwatch accumulation.**

Two fields per question in client state:
- `cumulativeMs` (number) — total time spent across all visits
- `enteredAt` (timestamp, nullable) — when the current visit started

```text
On enter question:  enteredAt = Date.now()
On leave question:  cumulativeMs += (Date.now() - enteredAt); enteredAt = null
On draft save:      persist cumulativeMs alongside the draft choiceId
On finalize:        timeSpentSeconds = Math.floor(cumulativeMs / 1000)
```

This handles revisits naturally: visit Q1 for 30s → jump to Q3 → come back to Q1 for 20s → Q1 total = 50s.

### Locking

- **No per-question locking during the exam.** Answers are freely changeable.
- **Exam-level locking on `Submit exam`.** All answers become permanent. Feedback is revealed.
- This matches the intended paper-exam mental model and common digital-assessment behavior.

### Implementation note

The legacy pre-BS-055 behavior that differed from this contract (per-question submit in exam mode, locked answers, shifting action labels, no post-exam review stage) has now been retired by DEBT-321, DEBT-322, and BS-058. This section describes the shipped contract.

---

## 4. Quick Practice Contract

### Mental model

Lightweight, no-session question flow. Submit → see feedback → get another question.

### Flow

```text
Question displayed
  → User selects a choice
  → User clicks Submit
  → Feedback appears immediately
  → Next button appears (or "Try again")
  → User clicks Next to get another question
```

### Contract rules

- Next is gated behind submit (not visible pre-submit). This is correct and safe.
- No session state, no persistence beyond the `attempts` table row.
- No navigator, no Previous.

### Current state

Quick Practice matches its contract. No changes needed (AF-5 safe — Next is hidden pre-submit).

---

## 5. Post-Session Flows

### Session summary

After a tutor session ends, the user sees a summary page with:
- Stats cards (answered, correct, accuracy, duration)
- Per-question breakdown
- CTAs: "Back to Practice" and "View in History"

After an exam is submitted, the flow is now:

```text
Review & Submit
  → Submit exam
  → Post-exam review stage
  → View Summary / Finish review
  → Session Summary
```

The post-exam review stage shows:
- Score banner (`Score: X% (correct/total)`)
- Correctness-colored navigator (green/red/outline)
- Full question feedback inline
- Top-right `View Summary` escape hatch
- Bottom bar focused on movement/utility: `Previous`, `Bookmark`, `Next`
- Last reviewed question swaps the forward CTA to `Finish review`
- No reattempt action

### Summary → Question review

The terminal exam summary still exposes:
- `Review your answers`
- Clickable breakdown rows
- `Back to Practice`
- `View in History` as a demoted secondary action

Summary-launched review uses a summary-aware origin:
- Route shape: `/app/questions/[slug]?from=summary&mode=review&sessionId=...`
- The question review page resolves its return path back to the session summary, not History

### Question review page

- Color-coded navigator (green = correct, red = incorrect, outline = unanswered)
- Full feedback content (explanation, clinical pearl, references)
- Bookmark action available (per BS-053)
- Navigation between questions in the session
- Exam-session review suppresses `Practice Again` / `Try Again`
- Non-exam review paths may still expose reattempt flows where the underlying attempt is not exam-owned

---

## 6. Shared Component Boundaries

Both modes share rendering components but must have separate action contracts. The following table defines the boundary:

| Component | Shared Across Modes | Mode-Specific Behavior |
|-----------|--------------------|-----------------------|
| `QuestionCard` | Yes — renders stem + choices | Exam allows re-selection on revisit; tutor locks after submit |
| `ChoiceButton` | Yes — renders individual choice | State variants differ (exam: selected/unselected only; tutor: selected/correct/incorrect) |
| `QuestionNavigator` | Exam only | N/A for tutor |
| `PracticeView` action bar | Shared component | **Must branch explicitly.** Tutor: Submit/Next/Bookmark. Exam: Previous/Next/Mark-for-review. Do not evolve as a single conditional matrix. |
| `question-flow-actions.ts` | Shared load logic | **Must branch on save.** Tutor: one-shot `submitAnswer`. Exam: draft-save on navigation boundary. |
| Review stage | Exam only | N/A for tutor |
| Feedback display | Shared rendering | Timing gated by mode (immediate vs deferred) |

---

## Related Documents

- [Practice Modes](./practice-modes.md) — lifecycle, grading, concurrency (data layer)
- [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md) — when correctness/explanations are exposed
- [BS-055](../brainstorming/bs-055-exam-session-interaction-model-rethink.md) — full problem analysis, decisions, and audit findings
- [Bookmark Surface Policy](../frontend/bookmark-surface-policy.md) — where bookmark appears per surface
