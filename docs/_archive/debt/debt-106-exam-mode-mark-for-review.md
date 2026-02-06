# DEBT-106: Exam Mode Missing "Mark for Review" Feature

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-05
**Resolved:** 2026-02-06

---

## Description

Exam mode previously had no persisted mark-for-review workflow, no pre-submit review stage, and summary scoring was vulnerable to attempt-count inflation instead of latest-answer-per-question semantics.

---

## Impact

- Users could not flag uncertain questions for revisit during exam simulation.
- Exam flow ended immediately instead of providing an exam-style review pass.
- Session summary risked incorrect totals when questions were re-answered.

---

## Resolution (Implemented)

### 1. Persisted Session Question State

Added per-question state to the session model and persistence layer:

- `questionStates[]` on `PracticeSession` with:
  - `markedForReview`
  - `latestSelectedChoiceId`
  - `latestIsCorrect`
  - `latestAnsweredAt`
- initialized at session start and persisted in `practice_sessions.params_json`
- repository support for state updates:
  - `recordQuestionAnswer(...)`
  - `setQuestionMarkedForReview(...)`

### 2. Application Use Cases

Added explicit exam-review use cases:

- `GetPracticeSessionReviewUseCase`
- `SetPracticeSessionQuestionMarkUseCase`

Updated existing use cases:

- `StartPracticeSessionUseCase` initializes `questionStates`
- `GetNextQuestionUseCase` selects by persisted session state and supports optional `questionId` jump
- `SubmitAnswerUseCase` records latest answer state in active sessions
- `EndPracticeSessionUseCase` computes totals from latest state per question
- `GetIncompletePracticeSessionUseCase` computes progress from session state

### 3. Controller and UI Flow

Implemented new server actions and client workflow:

- `getPracticeSessionReview`
- `setPracticeSessionQuestionMark`
- exam-mode "Mark for review" / "Unmark review" button
- "Review answers" stage before final submit
- review stage shows answered/unanswered/marked counts
- review stage supports "Open question" jump navigation
- final exam submit happens from review stage and then shows summary

### 4. SSOT Updates

Updated specs to match implemented behavior:

- `docs/specs/spec-013-practice-sessions.md`
- `docs/specs/master_spec.md`
- `docs/specs/spec-019-practice-ux-redesign.md`

---

## Verification

- [x] Mark/unmark works in exam mode and is persisted
- [x] Review stage returns ordered rows with answered/unanswered/marked state
- [x] Review stage can reopen a specific session question
- [x] Final scoring uses latest per-question state, not raw attempt count
- [x] Tutor mode behavior remains unchanged
- [x] Unit test suite passes (`pnpm test --run`)

---

## Related

- `src/domain/entities/practice-session.ts`
- `src/adapters/repositories/drizzle-practice-session-repository.ts`
- `src/application/use-cases/get-practice-session-review.ts`
- `src/application/use-cases/set-practice-session-question-mark.ts`
- `src/application/use-cases/end-practice-session.ts`
- `src/adapters/controllers/practice-controller.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
