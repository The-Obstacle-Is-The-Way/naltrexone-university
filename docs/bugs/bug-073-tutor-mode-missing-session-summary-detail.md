# BUG-073: Tutor Mode Missing Per-Question Session Summary at End

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06

---

## Description

When a tutor-mode session ends, the user sees only aggregate statistics (X answered, Y correct, Z% accuracy, duration) with no per-question breakdown. There is no way to review which questions were answered correctly, which were wrong, or which were skipped. In contrast, exam mode has a full review stage with per-question detail before final submission.

Additionally, exam mode's post-submission view also lacks a per-question breakdown — after finalizing, both modes show only the same aggregate `SessionSummaryView`.

**Observed behavior (tutor mode):**
1. User answers 20 questions.
2. User clicks "End session".
3. Session immediately ends (no review opportunity).
4. Summary shows: "15 answered, 12 correct, 80%, 12 minutes" — and nothing else.
5. No way to see which specific questions were right/wrong/skipped.

**Observed behavior (exam mode, post-submit):**
1. User completes exam review stage (which correctly shows per-question detail).
2. User clicks "Submit exam".
3. Post-submit summary shows only aggregates — the per-question detail from the review stage is gone.

**Expected behavior:**
- Tutor mode: End-of-session screen shows per-question results (question stem preview, user's answer, correct/incorrect, link to review each question).
- Exam mode (post-submit): Results screen shows per-question breakdown with explanations now visible (since session is ended and exam-mode explanation gating is lifted).
- Both modes: Scrollable list of all questions with their outcomes.

---

## Steps to Reproduce

### Tutor Mode
1. Start a tutor-mode practice session with 5+ questions.
2. Answer all questions.
3. Click "End session".
4. Observe: only aggregate stats shown, no per-question breakdown.

### Exam Mode
1. Start an exam-mode practice session with 5+ questions.
2. Answer all questions.
3. Click "Review answers" — this correctly shows per-question detail.
4. Click "Submit exam".
5. Observe: only aggregate stats shown, per-question detail from review is gone.

---

## Root Cause

### Tutor Mode
In `practice-session-page-client.tsx`, the `onEndSession` handler checks:
```
if (sessionMode === 'exam' || isInReviewStage) → loadReview()
else → finalizeSession()  // tutor skips directly to end
```

Tutor mode bypasses the review stage entirely, calling `endPracticeSession()` directly and showing `SessionSummaryView` which only renders aggregate stats.

### Exam Mode (Post-Submit)
After `onFinalizeReview()` calls `endSession()`, the `review` state is cleared and `summary` state is set. The `SessionSummaryView` component only renders the `EndPracticeSessionOutput` fields (answered, correct, accuracy, duration) — it does not include or re-fetch per-question data.

### Backend supports this
`getPracticeSessionReview()` use case works for both modes (no mode restriction in the use case). It returns full per-question detail including `isAnswered`, `isCorrect`, `stemPreview`, etc. The UI simply never calls it for tutor mode, and discards it after exam submission.

**Key files:**
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` — `onEndSession` skips review for tutor; `SessionSummaryView` is aggregate-only
- `src/application/use-cases/get-practice-session-review.ts` — Already supports both modes
- `src/application/use-cases/end-practice-session.ts` — Returns only aggregate stats

---

## Fix

### Option A: Add Review Data to End-of-Session Summary (Recommended)

1. **Tutor mode**: Before ending the session, call `getPracticeSessionReview()` to fetch per-question data. Display it below the aggregate stats.
2. **Exam mode**: After `endPracticeSession()`, call `getPracticeSessionReview()` again (session is now ended, so explanations are available). Display per-question breakdown with explanations.
3. **Both modes**: `SessionSummaryView` component should accept and render an optional `reviewData` prop alongside the aggregate stats.

### Option B: Separate Review Route

Create a `/app/practice/[sessionId]/results` page that loads review data for ended sessions. After session end, redirect to results page. This separates concerns but adds routing complexity.

---

## Verification

- [ ] Tutor mode end-of-session shows per-question breakdown (question stem, user answer, correct/incorrect)
- [ ] Exam mode post-submit shows per-question breakdown with explanations
- [ ] Skipped/unanswered questions are clearly indicated in the summary
- [ ] Clicking a question in the summary navigates to its full detail (optional enhancement)
- [ ] Aggregate stats still display correctly in both modes
- [ ] Unit tests for `SessionSummaryView` with review data
- [ ] Existing session flow tests still pass

---

## Related

- BUG-072 (question navigation — related UX gap)
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- `src/application/use-cases/get-practice-session-review.ts`
- `src/application/use-cases/end-practice-session.ts`
- `docs/specs/spec-013-practice-sessions.md`
- `docs/specs/spec-019-practice-ux-redesign.md`
