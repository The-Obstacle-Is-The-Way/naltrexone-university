# BUG-065: Exam Mode Shows Feedback When It Shouldn't

**Status:** Open
**Priority:** P2
**Date:** 2026-02-05

---

## Description

In **EXAM mode**, the UI displays a feedback panel with "Explanation not available" after each answer. Real exam mode should show NO feedback at all until the session ends.

**Current Behavior (EXAM mode):**
1. User answers a question
2. Feedback panel appears showing "Incorrect" or "Correct"
3. Message shows: "Explanation not available."
4. User must click "Next Question"

**Expected Behavior (EXAM mode):**
1. User clicks an answer choice
2. Answer is submitted silently
3. Immediately advance to next question (no feedback panel)
4. At session end: show summary with all results and explanations

**Note:** TUTOR mode should continue showing immediate feedback with explanations. This bug is specifically about EXAM mode behavior.

---

## Steps to Reproduce

1. Sign in as subscribed user
2. Start a practice session in **EXAM mode**
3. Answer any question
4. Observe feedback panel appears (it shouldn't in exam mode)

---

## Root Cause

The practice session page renders the `Feedback` component regardless of mode. In exam mode, no feedback should be shown - the submit action should silently record the answer and immediately load the next question.

**Code location:**
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- `app/(app)/app/practice/page.tsx` (ad-hoc practice)

---

## Fix

### Option 1: Hide Feedback in Exam Mode (Minimal)

In the session page, conditionally render feedback:

```tsx
{mode === 'tutor' && submitResult && (
  <Feedback
    isCorrect={submitResult.isCorrect}
    explanationMd={submitResult.explanationMd}
  />
)}
```

In exam mode, auto-advance after submit:
```tsx
// After successful submit in exam mode
if (mode === 'exam') {
  loadNextQuestion();
}
```

### Option 2: Full Exam Mode Redesign (Better UX)

1. Submit auto-advances to next question (no "Next Question" button)
2. Show only question number progress (e.g., "Question 5 of 20")
3. Add "Mark for Review" button to flag uncertain answers
4. At session end, show:
   - Summary stats (correct/incorrect/marked for review)
   - List of all questions with your answers vs correct answers
   - Full explanations for each question

---

## Verification

- [ ] EXAM mode: No feedback panel after answering
- [ ] EXAM mode: Auto-advance to next question after submit
- [ ] EXAM mode: Session summary shows all results at end
- [ ] TUTOR mode: Still shows immediate feedback (unchanged)
- [ ] E2E test covers both modes

---

## Related

- SPEC-019: Practice UX Redesign
- DEBT-105: Missing Session Resume Functionality
- `components/question/Feedback.tsx` - Feedback component
- `src/domain/value-objects/practice-mode.ts` - Mode logic
