# BUG-193: SubmitAnswer Returns isCorrect for Active Exams

**Status:** Fixed
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

Gated `isCorrect` behind the existing `shouldShowExplanation` check in `submit-answer.ts:264`:
```typescript
isCorrect: shouldShowExplanation ? grade.isCorrect : null,
```

Type widened from `boolean` to `boolean | null` in:
- `SubmitAnswerOutput` (`submit-answer.ts`)
- Controller Zod schema (`question-controller.ts`: `z.boolean().nullable()`)
- UI fallback (`practice-view.tsx`: `isCorrect ?? false` inside `!isExamMode` guard)

All 12 consumers of `.isCorrect` on submit results were audited — all handle nullable correctly via `?? false`, strict equality checks, or pre-existing `!isExamMode` guards.

Commits:
- `5f93a854 Fix BUG-193: Redact isCorrect in active exam submit responses`
- `a841507f Fix BUG-193: Handle nullable submit correctness in practice feedback`

## Verification

- [x] Unit test added — `submit-answer.test.ts`: asserts `result.isCorrect` is `null` for active exam submissions. `question-controller.test.ts`: validates nullable schema round-trip.
- [x] Integration test added — `controllers.integration.test.ts`: end-to-end test submits an answer during an active exam and verifies `isCorrect: null` in the controller response.
- [ ] Manual verification

## Related

- Policy: [exam-answer-secrecy-policy.md](/Users/ray/Desktop/github/naltrexone-university-1/docs/practice-engine/exam-answer-secrecy-policy.md) — lists `isCorrect shown to user` as forbidden during active exams.
- BUG-191 covers the same gap in `GetNextQuestion`.
- Current UI mitigates impact: practice session exam flow doesn't render submit feedback.
