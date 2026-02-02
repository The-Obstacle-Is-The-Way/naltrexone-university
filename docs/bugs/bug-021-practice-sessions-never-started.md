# BUG-021: Practice Sessions Never Started/Ended — Dead Session Controller Code

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The practice controller has `startPracticeSession()` and `endPracticeSession()` functions that are fully implemented but never called. Practice runs in an infinite loop with no session boundaries — users can't do a timed exam block or see session summary.

**Observed behavior:**
- User starts practicing
- Questions load indefinitely via filter-based `getNextQuestion()`
- No way to "end" a practice session
- No session summary (questions answered, accuracy, time spent)
- Exam mode (hide explanations until end) not possible

**Expected behavior:**
- Start session with parameters (question count, time limit, mode)
- Questions drawn from session pool
- End session shows summary
- Exam mode hides explanations until session ends

## Steps to Reproduce

1. Navigate to `/app/practice`
2. Answer questions
3. Observe: No "End Practice" button
4. Observe: No session summary ever shown
5. Search codebase: `startPracticeSession` and `endPracticeSession` never called

## Root Cause

**What exists:**
- `startPracticeSession()` — creates session with ordered questions ✓
- `endPracticeSession()` — marks session complete, computes stats ✓
- `PracticeSession` entity and repository — complete ✓
- `computeSessionProgress()` domain service — complete ✓

**What's missing:**
- UI to start a session with parameters
- Session ID passed through practice flow
- "End Session" button
- Session summary page/modal
- Mode selection (tutor vs exam)

Practice page uses filter-based `getNextQuestion({ filters })` instead of session-based `getNextQuestion({ sessionId })`.

## Fix

Option A: Implement full session flow:
1. Create session start UI (select filters, question count, mode)
2. Call `startPracticeSession()`
3. Pass sessionId through practice flow
4. Add "End Session" button calling `endPracticeSession()`
5. Show session summary modal/page

Option B: Remove session code if filter-based practice is sufficient:
1. Delete unused `startPracticeSession`, `endPracticeSession`
2. Delete unused `computeSessionProgress` domain service
3. Update specs to reflect design decision

## Verification

- [ ] User can start a practice session with parameters
- [ ] Session tracks question progress
- [ ] User can end session and see summary
- [ ] Exam mode hides explanations until session end
- [ ] E2E test: start → practice → end → summary

## Related

- `src/adapters/controllers/practice-controller.ts`
- `src/domain/services/session.ts` — computeSessionProgress (unused)
- SPEC-013: Practice Sessions
