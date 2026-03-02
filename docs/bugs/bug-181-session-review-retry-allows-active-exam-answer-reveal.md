# BUG-181: Session-Review Retry Allows Active Exam Answer Reveal

**Status:** Open
**Priority:** P1
**Date:** 2026-03-02

---

## Description

`SubmitAnswerUseCase` accepts `retryOrigin='session_review'` with `retrySessionId` that points to an active exam session (`endedAt === null`), then returns full explanation payload because submission is treated as standalone (`sessionId` absent).

Observed behavior:
- Active exam context can be used as retry provenance, but output still includes `correctChoiceId`, `explanationMd`, and `choiceExplanations`.

Expected behavior:
- Session-review retries should require an ended review session, or otherwise keep exam explanation gating.

---

## Steps to Reproduce

1. Have an active exam session with `endedAt = null` that includes question `q1`.
2. Submit a standalone answer with:
   - `questionId=q1`
   - `retryOrigin='session_review'`
   - `retrySessionId=<active-session-id>`
3. Observe response includes answer key/explanations.

Executable verification performed on 2026-03-02:
1. Repro harness called `SubmitAnswerUseCase.execute(...)` with active exam `retrySessionId`.
2. Output included `{ correctChoiceId: 'c2', explanationMd: 'Because.', choiceExplanationsLength: 2 }`.

---

## Root Cause

Tracer-bullet path:
1. Client retry provenance is built as `session_review` in [use-question-page-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/use-question-page-controller.ts:405).
2. Submit pipeline forwards retry fields in [question-page-logic.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/question-page-logic.ts:223).
3. Controller forwards to use case in [question-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/controllers/question-controller.ts:243).
4. Use case validates session ownership/membership for `retrySessionId` in [submit-answer.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.ts:112) but does not enforce `retrySession.endedAt !== null`.
5. The same request omits `sessionId`, so `session` stays `null` at [submit-answer.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.ts:147).
6. Explanation gating computes `shouldShowExplanation = !session || ...` at [submit-answer.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.ts:249), revealing answer content.

---

## Fix (TDD)

Not fixed yet.

### Red — write the failing test first

In `submit-answer.test.ts`, add a test:

```typescript
it('rejects session_review retry when retrySessionId points to an active exam', async () => {
  // Arrange: active exam session (endedAt: null, mode: 'exam') with question q1
  // Act: execute({ questionId: q1, choiceId: c1, retryOrigin: 'session_review', retrySessionId: activeExam.id })
  // Assert: throws ApplicationError with code 'CONFLICT'
});
```

This test must FAIL before the fix — confirming the leak exists.

### Green — minimum code to pass

In `SubmitAnswerUseCase.execute()`, inside the existing `retryOrigin === 'session_review'` block (line 112-126), after the membership check, add:

```typescript
if (retrySession.endedAt === null) {
  throw new ApplicationError(
    'CONFLICT',
    'Cannot retry from an active session',
  );
}
```

This ensures session_review retries only work against ended sessions, closing the explanation leak.

### Refactor

Consider extracting a shared `assertSessionEnded(session)` guard if BUG-180's fix introduces the same pattern in `GetPreviousAttemptUseCase`.

---

## Verification

- [ ] Unit test added (Red phase test above)
- [ ] Manual verification post-fix

