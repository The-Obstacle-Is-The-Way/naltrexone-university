# DEBT-106: Exam Mode Missing "Mark for Review" Feature

**Status:** Open
**Priority:** P2
**Date:** 2026-02-05
**Updated:** 2026-02-06

---

## Description

Exam mode does not currently support a true mark-for-review workflow.

**Current Behavior:**
- Exam mode auto-advances after submit.
- There is no persisted question-state model for "marked", "unanswered", or "changed answer".
- Session summary is computed from attempts count, not per-question latest state.

**Expected Behavior (like UWorld/Kaplan/real exams):**
- "Mark for Review" button on each question
- Marked questions flagged in progress indicator
- At end of exam (before submitting):
  - List of all questions
  - Shows which are answered, unanswered, marked
  - Can jump to any question to review/change answer
- Final submit only after review screen

---

## Impact

- Users cannot flag uncertain questions for later pass-through.
- Exam simulation remains weaker than production exam tools.
- Implementing this incorrectly risks scoring bugs and duplicate-attempt inflation.

---

## Why This Is Still Open

This debt cannot be safely paid by a small UI-only patch. A correct implementation requires:

1. **Persisted session question state**
   - Marked/unmarked state per `(sessionId, questionId)`.
   - Ability to revisit and change answers without creating duplicate scoring artifacts.
2. **Revised exam lifecycle**
   - "End session" must transition to a review stage before final submit.
   - Current `EndPracticeSessionUseCase` finalizes immediately.
3. **Scoring semantics update**
   - Current totals use attempts count; exam review requires latest-answer-per-question semantics.
4. **SSOT update**
   - `docs/specs/master_spec.md` and feature specs currently do not define mark-for-review behavior.

Implementing only a toggle in client state would be a half-measure and would not satisfy the required behavior.

---

## Resolution Plan (Next Iteration)

### Step 1 — SSOT + Data Model

- Add explicit exam review-stage requirements to specs.
- Introduce a persisted `session_question_states` model (or equivalent) for marked + answer state.

### Step 2 — Backend

- Add use cases/controllers for:
  - mark/unmark question
  - review-state retrieval
  - final exam submission
- Update session finalization/scoring to latest-question-state semantics.

### Step 3 — Frontend

- Add mark-for-review toggle (exam mode only).
- Add pre-submit review screen with question jump.
- Gate final submit behind review stage.

---

## Verification

- [ ] Can mark/unmark questions in exam mode (persisted)
- [ ] Review screen shows answered/unanswered/marked across full session
- [ ] Can navigate to any question from review stage
- [ ] Final scoring uses latest answer per question (no attempt inflation)
- [ ] Tutor mode remains unchanged

---

## Related

- `docs/specs/master_spec.md` (needs update before implementation)
- `docs/specs/spec-013-practice-sessions.md`
- `docs/specs/spec-019-practice-ux-redesign.md`
- `src/application/use-cases/end-practice-session.ts`
