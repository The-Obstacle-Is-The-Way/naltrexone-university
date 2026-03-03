# BUG-193: SubmitAnswer Returns isCorrect for Active Exams

**Status:** Open
**Priority:** P3
**Date:** 2026-03-03

---

## Description

`SubmitAnswerUseCase` returns `isCorrect: grade.isCorrect` unconditionally in the response, even when the submission is for an active exam session. While the current exam UI doesn't render this value, it is present in the API response and violates the exam-answer-secrecy policy's defense-in-depth principle.

Observed behavior:
- Submitting an answer during an active exam returns `{ isCorrect: true/false, correctChoiceId: null, explanationMd: null }`.
- The `isCorrect` boolean is exposed while explanations and correctChoiceId are correctly gated.

Expected behavior:
- When `shouldShowExplanation(session)` is false, `isCorrect` should also be redacted (returned as `null` or a new neutral type).

## Steps to Reproduce

1. Start an exam session.
2. Submit an answer.
3. Inspect the API response in browser DevTools.
4. Observe `isCorrect: true` or `isCorrect: false` in the response body.

## Root Cause

Tracer-bullet path:
1. Use case computes explanation visibility at [submit-answer.ts:255-260](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.ts:255): `const shouldShowExplanation = !session || sessionShouldShowExplanation(session)`.
2. Explanations, correctChoiceId, and choiceExplanations are correctly gated at lines 257-260.
3. Line 264: `isCorrect: grade.isCorrect` — returned unconditionally, NOT gated by `shouldShowExplanation`.

The asymmetry is clear: three fields are gated, one is not.

## Fix

Not yet implemented.

Expected fix shape:
- Gate `isCorrect` behind the same `shouldShowExplanation` check:
  ```typescript
  isCorrect: shouldShowExplanation ? grade.isCorrect : null,
  ```
- This requires widening `SubmitAnswerOutput.isCorrect` from `boolean` to `boolean | null`.
- Practice session UI already handles null (it doesn't display isCorrect in exam mode).

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification

## Related

- Policy: [exam-answer-secrecy-policy.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/practice-engine/exam-answer-secrecy-policy.md) — lists `isCorrect shown to user` as forbidden during active exams.
- BUG-191 covers the same gap in `GetNextQuestion`.
- Current UI mitigates impact: practice session exam flow doesn't render submit feedback.
