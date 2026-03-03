# BUG-186: Active Exam Review Projection Leaks Correctness

**Status:** Fixed
**Priority:** P1
**Date:** 2026-03-03

---

## Description

Active exam review flows expose per-question correctness (`Correct` / `Incorrect`) before the session is ended.

Observed behavior:
- In exam mode, clicking `Review answers` (before final submit) renders correctness labels.
- Opening an exam review question (`mode=review&sessionId=...`) also renders correctness in the review navigator.

Expected behavior:
- While `mode='exam'` and `endedAt === null`, review surfaces must only show neutral states (`Answered` / `Unanswered` / `Marked`).

## Steps to Reproduce

1. Start an exam session and answer at least one question.
2. Click `Review answers` (do not submit the exam yet).
3. Observe `Correct` / `Incorrect` labels in the review stage.
4. Open a review question from that stage and observe the question navigator also uses correctness status.

## Root Cause

Tracer-bullet path:
1. Review stage is loaded while the exam is still active in [use-practice-session-review-stage-state.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:116).
2. `GetPracticeSessionReviewUseCase` projects `state.latestIsCorrect` into output rows without an active-exam redaction gate in [get-practice-session-review.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-practice-session-review.ts:110) and [get-practice-session-review.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-practice-session-review.ts:127).
3. Exam review UI renders `Correct` / `Incorrect` when `row.isCorrect !== null` in [exam-review-view.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:156).
4. Question review session-navigation also consumes `row.isCorrect` in [use-question-page-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/use-question-page-controller.ts:252).
5. Navigator then maps that into destructive/success variants and status labels in [review-question-navigator.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:48) and [review-question-navigator.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:49).

## Verification Notes (Audit #11)

**Confirmed real.** Verified at line level 2026-03-03.

Important nuance: The `QuestionNavigator` component within `exam-review-view.tsx` (lines 44-51) correctly gates correctness behind `review.mode === 'tutor'`, showing only "Answered" for exam mode. But the `ExamReviewView` list items (line 156) apply no mode check — they render "Correct"/"Incorrect" whenever `row.isCorrect !== null`. This is a mixed-enforcement bug: one component in the same file gets it right, the sibling doesn't.

The `ReviewQuestionNavigator` (separate file, lines 48-49) also maps `isCorrect` to `success`/`destructive` button variants unconditionally — a secondary leak surface.

## Fix

Implemented in `bug-fix-186-187-188`:
- `GetPracticeSessionReviewUseCase` now computes a single session-level correctness gate using `shouldShowExplanation(session)`.
- For active exams (`mode='exam'` and `endedAt === null`), projected rows now emit `isCorrect: null`.
- Ended exams and tutor sessions continue to emit real correctness.
- UI code was left unchanged; projection-level redaction automatically forces neutral rendering.

Code changes:
- [get-practice-session-review.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-practice-session-review.ts)
- [get-practice-session-review.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-practice-session-review.test.ts)

## Verification

- [x] Unit test added
- [x] Integration test added
- [x] Manual verification
- [x] Code-level tracer-bullet verified (Audit #11, 2026-03-03)

## Related

- Policy: [exam-answer-secrecy-policy.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/practice-engine/exam-answer-secrecy-policy.md)
- Related prior fixes: BUG-180, BUG-181, BUG-185
- Same pattern: BUG-191 (GetNextQuestion), BUG-192 (History page), BUG-193 (SubmitAnswer)
