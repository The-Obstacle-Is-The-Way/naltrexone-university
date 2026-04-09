# BUG-191: GetNextQuestion Returns latestIsCorrect for Active Exams

**Status:** Fixed
**Priority:** P2
**Date:** 2026-03-03

---

## Description

`GetNextQuestionUseCase.executeForSession` returns `latestIsCorrect` unconditionally in the session object, including during active exam sessions. This violates the exam-answer-secrecy policy and exposes per-question correctness in the API response.

Observed behavior:
- During an active exam, navigating to an already-answered question returns `session.latestIsCorrect: true/false` in the API response.
- Any current or future consumer of this response could render the correctness verdict.

Expected behavior:
- When `session.mode === 'exam'` and `session.endedAt === null`, `latestIsCorrect` should be redacted to `null`.

## Steps to Reproduce

1. Start an exam session with multiple questions.
2. Answer a question (setting `latestIsCorrect` in questionState).
3. Navigate back to that question (triggering `GetNextQuestion`).
4. Inspect the API response: `session.latestIsCorrect` contains `true` or `false`.

## Root Cause

Tracer-bullet path:
1. Use case builds session output at [get-next-question.ts:220-230](../../../src/application/use-cases/get-next-question.ts#L220).
2. Line 227: `latestIsCorrect: targetState.latestIsCorrect` — emitted unconditionally.
3. Lines 208-212: Only `previousSubmission` is gated behind tutor mode (`const isTutor = session.mode === 'tutor'`).
4. `latestIsCorrect` has no equivalent gate.

Contrast with `previousSubmission` which correctly applies the mode check:
```typescript
const previousSubmission = isAnswered && isTutor ? ... : null;
```

## Fix

Gated `latestIsCorrect` behind `shouldShowExplanation(session)` in `executeForSession`, matching the existing `previousSubmission` pattern:
```typescript
const showCorrectness = shouldShowExplanation(session);
// ...
latestIsCorrect: showCorrectness ? targetState.latestIsCorrect : null,
```

## Verification

- [x] Unit test added
- [ ] Integration test added
- [ ] Manual verification

## Related

- Policy: [exam-answer-secrecy-policy.md](../../practice-engine/exam-answer-secrecy-policy.md)
- Same pattern as BUG-186 (review projection) but on a different surface (getNextQuestion).
- Prior fix: BUG-180 (getPreviousAttempt gating) established the guard pattern.
