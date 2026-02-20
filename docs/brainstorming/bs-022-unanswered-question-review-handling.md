# BS-022: Unanswered Question Review Handling

**Date:** 2026-02-17
**Triggered by:** Manual QA of exam mode review — unanswered questions present as blank submittable forms instead of revealing the correct answer
**Scope:** How unanswered questions should behave in review mode across all session-based contexts (tutor, exam) and what the question navigator should display
**Related:** [BS-023](./bs-023-try-again-state-consistency.md), [SPEC-027](../_archive/specs/spec-027-session-review-navigation.md), [SPEC-032](../_archive/specs/spec-032-action-bar-standardization.md)

---

## The Problem

When a user completes an exam or tutor session with unanswered questions and then enters review mode, each unanswered question renders as a **blank, submittable form** — identical to an active practice question. The user sees choice buttons, a Submit button, and no feedback. This creates three problems:

1. **Review is not reviewing.** The purpose of review mode is to learn from what happened. For answered questions, the system shows the correct answer, the user's selection, and an explanation. For unanswered questions, it shows nothing — the user must submit an answer first to see any educational content.

2. **Ambiguous context.** The user is in "review mode" but the UI presents an active question. There's no visual signal that this question was left unanswered during the session. The action bar shows `Submit` instead of review-oriented controls.

3. **Exam mode scoring disconnect.** The exam submit dialog warns "unanswered questions will be scored as incorrect," but the actual session stats exclude unanswered questions from both the answered and correct counts. The session summary shows `0/20 correct (0%)` — but the denominator is 0 answered, not 20 total. The "scored as incorrect" warning is aspirational, not enforced.

### Visual Evidence (Screenshots)

- **History page:** Exam session shows `0/20 correct (0%)`, 1 Incorrect, 19 Unanswered
- **Answered Q1 (review):** Shows selected answer (red), correct answer (green), explanation, "Why other answers are wrong" — full educational content
- **Unanswered Q2 (review):** Shows blank choices, Submit button, no feedback — indistinguishable from active practice
- **Question navigator:** Q1 is red (incorrect), Q2 is highlighted (current), Q3-Q20 are gray (unanswered) — navigator coloring is correct

---

## Root Cause Analysis

### 1. Review mode loads previous attempt — but unanswered questions have none

**File:** `app/(app)/app/questions/[slug]/use-question-page-controller.ts` (lines 189-212)

When entering review mode, the controller calls `loadPreviousAttempt()`. For unanswered questions, this returns `null` because no `Attempt` record exists in the database. The fallback is to render the question in "attempt mode" — a blank form ready for submission.

```
Review mode entry → loadPreviousAttempt() → null (no attempt) → render blank form
```

There's no code path that says "this question was unanswered in the session — show the correct answer as read-only."

### 2. No "unanswered" state distinct from "not yet attempted"

The domain conflates two states:
- **Unanswered in a completed session** — the user chose to skip this question
- **Not yet attempted** — the user hasn't seen this question yet

Both map to `latestSelectedChoiceId === null` in `PracticeSessionQuestionState`. The review UI has no way to distinguish "skipped during exam" from "never encountered."

### 3. Session stats don't enforce exam scoring rules

**File:** `src/domain/services/session-stats.ts` (lines 13-25)

`computeSessionStats()` only counts questions where `latestSelectedChoiceId !== null`. Unanswered questions are excluded entirely — they don't count as incorrect even though the exam submit dialog warns they will be.

```typescript
const answeredStates = questionStates.filter(
  (state) => state.latestSelectedChoiceId !== null,
);
return {
  answered: answeredStates.length,                    // Excludes unanswered
  correct: answeredStates.filter(s => s.latestIsCorrect === true).length,
};
```

---

## Severity Assessment

| Aspect | Severity | Rationale |
|--------|----------|-----------|
| UX confusion | **High** | Review mode should review, not re-quiz. Users expect to see answers. |
| Educational value | **High** | Unanswered questions are learning opportunities wasted if the user must submit first. |
| Exam scoring accuracy | **Medium** | Stats say "0/20 correct (0%)" but denominator should arguably be 20 if unanswered = incorrect. |
| Question navigator accuracy | **Low** | Navigator correctly shows unanswered as gray/outline — this is fine. |
| Data integrity | **Low** | No data corruption — but the stats are misleading. |

### Affected Entry Points

| Context | Affected? | How |
|---------|-----------|-----|
| Exam mode → Review | Yes | Unanswered questions show as blank forms |
| Tutor mode → Review | Yes | Same behavior (though less common — tutor forces sequential) |
| History session review | Yes | Same `question-page-client.tsx` rendering |
| Practice session review | Yes | Same rendering path |
| Quick Practice | No | No session context, no review mode for unanswered |
| Individual question review | No | Only reached via a specific attempt — always has an answer |

---

## Proposed Fix (Sketch)

### Option A: Auto-reveal correct answer for unanswered questions in review (Recommended)

When `mode=review` and `loadPreviousAttempt()` returns null AND a `sessionId` is present:

1. Load the question's correct answer (already available via the question data)
2. Render the question in a **read-only answered state** showing:
   - No choice selected (or a subtle "You did not answer this question" banner)
   - Correct answer highlighted in green
   - Full explanation displayed
   - "Unanswered" status indicator
3. Action bar shows: `← Previous · Next → · Back to History` (no Submit, no Try Again)

This treats unanswered review questions as educational — "here's what you should have known."

### Option B: Show unanswered banner + allow submission

Keep the current submittable form but add a visual indicator:
- Banner: "This question was left unanswered during your session."
- Allow the user to submit if they want, but make it clear this is a post-session exercise
- After submission, show feedback normally

This preserves interactivity but clarifies the context.

### Option C: Count unanswered as incorrect + auto-reveal

Combine Option A with scoring enforcement:
- In `computeSessionStats()`, count unanswered questions as incorrect for exam mode
- Session summary shows `1/20 correct (5%)` instead of `1/1 correct (100%)`
- In review, auto-reveal the answer (same as Option A)

This aligns the exam scoring warning with actual behavior.

### Recommendation

**Option A for review behavior + Option C for exam scoring.** The exam submit dialog already warns that unanswered = incorrect — the stats should reflect that. And review mode should always be educational.

For tutor mode, the scoring question is less clear — tutor sessions are learning-oriented, and unanswered questions may just mean "didn't get to them yet." Consider keeping the current exclusion-from-stats behavior for tutor mode while enforcing it for exam mode.

---

## Behavior Matrix (Target State)

### Question Navigator Colors

| Status | Current | Target | Change? |
|--------|---------|--------|---------|
| Correct | Green (`success`) | Green | No |
| Incorrect | Red (`destructive`) | Red | No |
| Unanswered | Gray (`outline`) | Gray (`outline`) | No — keep as-is |

The user's instinct is correct: unanswered should stay uncolored (gray). No change needed here.

### Review Mode Rendering

| Status | Current Behavior | Target Behavior |
|--------|-----------------|-----------------|
| Correct | Shows answer + explanation + green highlight | No change |
| Incorrect | Shows answer + explanation + red/green highlight | No change |
| Unanswered (exam) | Blank submittable form | Auto-reveal correct answer + "Unanswered" indicator |
| Unanswered (tutor) | Blank submittable form | Auto-reveal correct answer + "Unanswered" indicator |

### Session Stats (Exam Mode)

| Stat | Current | Target |
|------|---------|--------|
| Answered | Only submitted questions | Only submitted questions (no change to display) |
| Correct | Only correct among submitted | No change |
| Accuracy | `correct / answered` (misleading) | `correct / total` (honest) |
| Score label | "0/20 correct (0%)" based on 0 answered | "1/20 correct (5%)" based on total questions |

### Session Stats (Tutor Mode)

| Stat | Current | Target |
|------|---------|--------|
| All stats | Exclude unanswered | Keep excluding — tutor is learning-oriented |

---

## Implementation Considerations

### Where the correct answer lives

The question data (loaded via `loadQuestion`) includes all choices and their `isCorrect` flags. No additional server call is needed to reveal the correct answer — the data is already client-side.

**File:** `app/(app)/app/questions/[slug]/question-page-logic.ts` — `loadQuestion()` returns `QuestionDetailOutput` which includes `choices[].isCorrect`.

### Session state lookup

To know whether a question is "unanswered in this session" vs "never seen," the review mode needs the session's question states. The `sessionNavigation` prop already carries `rows[]` with `isAnswered` and `isCorrect` — this can be used to determine if a question was part of the session but left unanswered.

### Action bar changes

For unanswered questions in review with auto-reveal:
- Remove `Submit` (no submission needed)
- Remove `Try Again` (nothing to retry)
- Keep `← Previous`, `Next →`, `Back to ...`

### Quick Practice

No changes needed. Quick Practice has no session context and no review mode for unanswered questions. The "Unanswered" filter on Quick Practice correctly shows questions the user hasn't attempted globally — this is a different concept from "unanswered in a specific session."

---

## Open Questions

| # | Question | Context |
|---|----------|---------|
| Q1 | Should unanswered questions in exam mode count as incorrect in stats? | The submit dialog says they will, but `computeSessionStats()` excludes them |
| Q2 | Should tutor mode treat unanswered differently from exam mode? | Tutor is learning-oriented; exam simulates real test conditions |
| Q3 | Should auto-reveal show a "You did not answer this question" banner? | Distinguishes from answered-correctly questions |
| Q4 | Should the review action bar for unanswered questions still offer "Try Again"? | See [BS-023](./bs-023-try-again-state-consistency.md) for broader Try Again discussion |
| Q5 | Should accuracy be `correct / answered` or `correct / total` for exam mode? | Real board exams use `correct / total` |

---

## Live QA Findings (2026-02-20)

Findings from manual browser testing that were **not captured in the original analysis**:

### Finding 1: Tutor mode has NO end-session confirmation dialog

Exam mode shows an `AlertDialog` with an explicit red warning: _"You have X unanswered questions that will be scored as incorrect."_ Tutor mode **skips the dialog entirely** — clicking "End session" auto-finalizes via `input.finalizeSession()` with no warning about unanswered questions.

**File:** `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts` (lines 77-83)

This is acceptable behavior (tutor is learning-oriented, not punitive), but worth documenting.

### Finding 2: History page Tutor mode has contradictory stats

The History session card displays: **`1/5 correct (100%)`**

- **Fraction** `1/5` uses denominator = `questionCount` (total questions in session, including unanswered)
- **Percentage** `100%` uses denominator = `answered` (only questions submitted, via `computeAccuracy(answered, correct)`)
- These two numbers in the same label use **different denominators**, making the display internally contradictory

**Root cause:** `history-sessions-tab.tsx` line 66 renders `${row.correct}/${row.questionCount}` for the fraction, but `row.accuracy` is computed as `correct / answered` in `get-session-history.ts` line 64.

Exam mode happens to be "consistent" when all answered questions are wrong (0/20, 0%), but would show the same contradiction if some answers were correct (e.g., `1/20 correct (100%)` if only 1 question was answered and it was correct).

**Severity: Medium** — This is a display-level bug that exists for both modes, not just tutor.

### Finding 3: Session Summary vs History use different denominators

| View | Fraction | Percentage | Denominator |
|------|----------|------------|-------------|
| **Session Summary** | Not shown as fraction | `correct / answered` | `answered` only |
| **History card** | `correct / questionCount` | `correct / answered` | Mixed — fraction uses total, percentage uses answered |

The Session Summary (post-session screen) is internally consistent — it shows `answered`, `correct`, and `accuracy` as separate stat cards. The History card mashes them into one label with mismatched denominators.

### Finding 4: Submit button in review mode is functional

The Chrome investigation confirmed that unanswered questions in review mode are not merely visual — the **Submit button actually works**. Users can select a choice and submit an answer for an unanswered question after the exam/session has ended. This creates a post-session attempt record.

**Root cause:** `question-page-logic.ts` line 31-42 — `canSubmitQuestionAnswer()` returns `true` whenever `selectedChoiceId` is set and `submitResult` is null. There is no check for whether the session has ended or whether the user is in review mode.

### Finding 5: "Review Questions" pre-submit screen in exam mode

Before final exam submission, an intermediate "Review Questions" screen shows:
- **Answered / Unanswered / Marked** counts
- Per-question status labels (e.g., "Answered • Not marked • Incorrect", "Unanswered • Not marked")
- The app pre-scores answered questions before the user submits the exam

This screen was not analyzed in the original doc but is **working correctly** and needs no changes.

---

## Robust Fix Design (2026-02-20)

Based on the full codebase investigation and live QA, here is the complete fix broken into layers.

### Layer 1: Review Mode — Auto-reveal for unanswered questions (P0)

**Problem:** Unanswered questions in review mode show a blank, submittable form.
**Fix:** When `mode=review` and `loadPreviousAttempt()` returns null and the question belongs to a completed session, render a synthetic "unanswered" review state.

**Files to change:**

1. **`app/(app)/app/questions/[slug]/use-question-page-controller.ts`** (lines 189-212)
   - In `loadPreviousAttempt()`, when the attempt is null AND a `sessionId` is present:
   - Check `sessionNavigation.rows` to confirm this question exists in the session (rules out "never seen")
   - Set a new state flag: `isUnansweredInSession = true`
   - Construct a synthetic `submitResult`-like object that contains:
     - `selectedChoiceId: null` (no user selection)
     - `isCorrect: false` (unanswered = incorrect for display purposes)
     - `correctChoiceId`: derived from `question.choices.find(c => c.isCorrect)?.id`
     - `explanation`: from the question data (already loaded)
   - This allows the existing review rendering to show green highlight on the correct answer and display the explanation

2. **`app/(app)/app/questions/[slug]/question-page-client.tsx`** (lines 248-261)
   - When `isUnansweredInSession === true`:
     - Hide the Submit button
     - Hide the Try Again button
     - Show only navigation: `← Previous · Next → · Back to Session`
   - Add a banner/indicator: **"You did not answer this question"** above the choices

3. **Choice rendering** (wherever choices are displayed)
   - When `isUnansweredInSession === true`:
     - No choice highlighted as "selected" (since none was)
     - Correct choice highlighted in green
     - Other choices shown in neutral/dimmed state
   - This is visually distinct from "incorrect" (which shows red selection + green correct)

### Layer 2: Stats consistency — Fix the History card denominator mismatch (P1)

**Problem:** History card shows `1/5 correct (100%)` — fraction uses total, percentage uses answered.
**Fix:** Align the percentage with the fraction by using the same denominator.

**Decision needed:** Which denominator to standardize on?

**Option 2A: Standardize on `questionCount` for exam, `answered` for tutor**
- Exam: `1/20 correct (5%)` — percentage = `correct / questionCount`
- Tutor: `1/1 correct (100%)` — both fraction and percentage use `answered`
- Requires: change fraction in tutor to `correct/answered`, OR change percentage in exam to `correct/questionCount`

**Option 2B: Standardize on `questionCount` for both modes**
- Exam: `1/20 correct (5%)`
- Tutor: `1/5 correct (20%)`
- Simpler, but penalizes tutor sessions where skipping is expected

**Option 2C (Recommended): Mode-aware display**
- Exam History card: `1/20 correct (5%)` — `correct / questionCount` for both fraction and percentage
- Tutor History card: `1/1 correct (100%)` — `correct / answered` for both fraction and percentage
- Requires: `history-sessions-tab.tsx` to branch on `row.mode`
- Session Summary: Keep as-is (separate stat cards, internally consistent)

**Files to change:**
- `app/(app)/app/history/components/history-sessions-tab.tsx` (line 64-66) — branch fraction/percentage display on mode
- `src/application/use-cases/get-session-history.ts` (line 64) — optionally add `examAccuracy: computeAccuracy(questionCount, correct)` to the output

### Layer 3: Prevent post-session submission for unanswered questions (P1)

**Problem:** Users can submit answers to unanswered questions in review mode, creating post-session attempt records.
**Fix:** Block submission when in review mode.

**Files to change:**

1. **`app/(app)/app/questions/[slug]/question-page-logic.ts`** (lines 31-42)
   - Add a `mode` parameter to `canSubmitQuestionAnswer()`
   - Return `false` when `mode === 'review'` AND `isUnansweredInSession === true`
   - This prevents the Submit button from being clickable even if it were somehow rendered

2. **Controller level** — The synthetic review state from Layer 1 already prevents submission by not rendering the Submit button, but this adds defense-in-depth.

### Layer 4: Exam stats enforcement (P2 — deferred, needs product decision)

**Problem:** `computeSessionStats()` excludes unanswered questions. The submit dialog says they count as incorrect, but they don't.
**Fix (if decided):** Add a mode-aware stats computation.

**Files to change:**
- `src/domain/services/session-stats.ts` — Add optional `mode` parameter. When `mode === 'exam'`, include unanswered in the denominator for accuracy.
- `src/application/use-cases/end-practice-session.ts` — Pass mode to stats computation.

**Deferred because:** This changes the _stored_ accuracy for exam sessions, which affects historical data. Needs a product decision on whether to backfill or only apply going forward. The display-level fix in Layer 2 addresses the visible symptom without changing stored data.

### Files NOT changing

| File | Why |
|------|-----|
| `review-question-navigator.tsx` | Navigator colors are correct (gray for unanswered) |
| `session-breakdown-list.tsx` | Breakdown labels are correct ("Unanswered" in gray) |
| `exam-review-view.tsx` | Submit warning dialog is correct |
| `session-summary-view.tsx` | Summary cards are internally consistent |
| Quick Practice paths | No session context, not affected |

### Implementation Order

1. **Layer 1** first — this is the core UX fix and the P0
2. **Layer 2** next — the History card mismatch is a visible bug
3. **Layer 3** alongside Layer 1 — defense-in-depth, small change
4. **Layer 4** deferred — requires product decision on scoring semantics

---

## Updated Open Questions

| # | Question | Status |
|---|----------|--------|
| Q1 | Should unanswered questions in exam mode count as incorrect in stats? | **Deferred to Layer 4** — display fix in Layer 2 addresses the visible symptom |
| Q2 | Should tutor mode treat unanswered differently from exam mode? | **Answered: Yes** — Tutor uses `correct/answered`, Exam uses `correct/total` for display |
| Q3 | Should auto-reveal show a "You did not answer this question" banner? | **Answered: Yes** — Layer 1 includes banner to distinguish from incorrect |
| Q4 | Should the review action bar for unanswered questions still offer "Try Again"? | **Answered: No** — nothing to retry, navigation only |
| Q5 | Should accuracy be `correct / answered` or `correct / total` for exam mode? | **Answered: `correct / total` for exam display** (Layer 2) |
| Q6 | Should we backfill historical exam session accuracy? | **New** — Layer 4 would change stored accuracy; needs decision on backfill |
| Q7 | How should the "unanswered review" state be modeled? | **Answered** — synthetic state in controller, not a new domain concept |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-17 | Created brainstorming doc | Manual QA revealed unanswered questions render as blank forms in review mode |
| 2026-02-17 | Question navigator colors confirmed correct | Gray for unanswered is the right signal — no change needed |
| 2026-02-20 | Chrome agent live QA completed | Confirmed all original findings + discovered 5 new issues (see Live QA Findings) |
| 2026-02-20 | History card denominator mismatch confirmed as bug | `1/5 correct (100%)` — fraction and percentage use different denominators |
| 2026-02-20 | Tutor mode no-dialog behavior confirmed acceptable | Learning-oriented mode doesn't need punitive warning |
| 2026-02-20 | Post-session submission confirmed as functional bug | Submit button works in review mode for unanswered questions |
| 2026-02-20 | Robust fix design documented (4 layers) | Layer 1 (P0): auto-reveal, Layer 2 (P1): stats consistency, Layer 3 (P1): block submission, Layer 4 (P2): deferred scoring |
| 2026-02-20 | Option 2C recommended for stats display | Mode-aware: exam=correct/total, tutor=correct/answered |
