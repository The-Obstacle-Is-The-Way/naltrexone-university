# BUG-072: No Question Navigation in Practice Sessions (Both Modes)

**Status:** Open
**Priority:** P1
**Date:** 2026-02-06

---

## Description

Users cannot navigate back to previous questions or jump to specific questions during a practice session in either tutor or exam mode. The session flow is strictly one-directional: answer → next → answer → next. There is no "Previous" button, no question list/grid to jump from, and no way to see which questions were left unanswered.

**Observed behavior:**
- After answering question 3, there is no way to return to question 1 or 2.
- If a user accidentally advances past a question, it is effectively lost until exam review (exam mode only).
- No visual indicator shows "You skipped question 5" or "3 questions unanswered" during the session.
- Users cannot review or change previous answers before ending the session.

**Expected behavior:**
- Back/forward navigation between questions in both modes.
- A progress indicator or question grid showing answered/unanswered/marked status.
- Ability to jump to any question within the session at any time.

---

## Steps to Reproduce

1. Start a practice session (tutor or exam, any count/settings).
2. Answer question 1, click "Next".
3. Answer question 2, click "Next".
4. Try to go back to question 1 — no mechanism exists.
5. Skip question 3 (don't select a choice), try to end session — no warning about unanswered questions.

---

## Root Cause

The client component (`practice-session-page-client.tsx`) only exposes a `loadNext()` function that calls `getNextQuestion({ sessionId })` without a `questionId`, which always returns the first unanswered question. There is no `loadPrevious()` or `loadSpecificQuestion(id)` wired to the UI outside of the exam review stage.

**Backend support exists but is unused:**
- `getNextQuestion` use case accepts an optional `questionId` parameter for jumping to any session question (line 129 of `get-next-question.ts`).
- `questionStates[]` tracks per-question answered/marked status server-side.
- The exam review flow already uses `loadSpecificQuestion()` internally — the pattern exists but is not exposed during the question-answering phase.

**Key files:**
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` — Missing navigation UI
- `src/application/use-cases/get-next-question.ts` — Backend already supports `questionId` param
- `src/domain/entities/practice-session.ts` — `questionStates[]` tracks all state needed

---

## Fix

### Option A: Question Navigation Bar (Recommended)

Add a navigation bar/grid to the practice session UI that:

1. Shows all question numbers (1, 2, 3, ... N) as clickable indicators.
2. Color-codes each by status: unanswered (empty), answered (filled), marked for review (flagged).
3. Clicking a number calls `getNextQuestion({ sessionId, questionId })` to jump to that question.
4. Add Previous/Next arrow buttons alongside the existing "Next" button.

This leverages the existing `questionId` jump capability and `questionStates[]` tracking.

### Option B: Simple Back/Forward Buttons

Add just Previous/Next buttons with a local question-index stack. Less feature-rich but simpler to implement.

---

## Verification

- [ ] User can navigate backward to a previously answered question (both modes)
- [ ] User can navigate forward through questions (both modes)
- [ ] User can jump to any specific question by number (both modes)
- [ ] Unanswered questions are visually distinguishable from answered ones
- [ ] Marked-for-review questions are visually distinguishable (exam mode)
- [ ] Navigation does not break session state or progress tracking
- [ ] Unit tests cover navigation state transitions
- [ ] Existing session flow tests still pass

---

## Related

- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- `src/application/use-cases/get-next-question.ts`
- `src/domain/entities/practice-session.ts`
- `docs/specs/spec-013-practice-sessions.md`
- `docs/specs/spec-019-practice-ux-redesign.md`
