# BUG-065: Exam Mode Shows Feedback When It Shouldn't

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-05
**Resolved:** 2026-02-05

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

`PracticeView` rendered the `Feedback` panel whenever `submitResult` existed, regardless of practice mode. Additionally, `PracticeView` always passed `correctChoiceId` to `QuestionCard`, which highlighted the correct/incorrect choice states (also feedback) even when the feedback panel was removed.

**Code location:**
- `app/(app)/app/practice/page.tsx` (`PracticeView`)
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` (session flow auto-advance)

---

## Fix

Minimal exam-mode behavior fix:

- Hide `Feedback` in exam mode (only render feedback in tutor mode).
- Prevent correct/incorrect choice highlighting in exam mode by not passing `correctChoiceId` to `QuestionCard`.
- Auto-advance to the next question after a successful submit in exam mode.

Note: A richer exam summary (reviewing all answers + explanations at the end) is tracked separately as product scope (see DEBT-106).

---

## Verification

- [x] EXAM mode: No feedback panel after answering
- [x] EXAM mode: Auto-advance to next question after submit
- [x] TUTOR mode: Still shows immediate feedback (unchanged)
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test --run`

---

## Related

- SPEC-019: Practice UX Redesign
- DEBT-105: Missing Session Resume Functionality
- DEBT-106: Exam Mode Mark-for-Review + richer session summary
- `components/question/Feedback.tsx` - Feedback component
- `src/domain/value-objects/practice-mode.ts` - Mode logic
