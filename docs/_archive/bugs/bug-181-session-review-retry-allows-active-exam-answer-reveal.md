# BUG-181: Session-Review Retry Allows Active Exam Answer Reveal

**Status:** Resolved
**Priority:** P1
**Date:** 2026-03-02
**Resolved:** 2026-03-02 (PR #162, commit `f04e0a9`)

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

Fixed.

### Red — failing tests added first

Added regression tests in [submit-answer.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.test.ts:360) and [submit-answer.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.test.ts:404):

```typescript
it('rejects session_review retry when retrySessionId points to an active exam', async () => {
  // Arrange: active exam session (endedAt: null, mode: 'exam') with question q1
  // Act: execute({ questionId: q1, choiceId: c1, retryOrigin: 'session_review', retrySessionId: activeExam.id })
  // Assert: throws ApplicationError with code 'CONFLICT'
});
```

The exam regression failed before the guard existed and now passes. The companion tutor regression locks the ended-session boundary for `session_review` provenance.

### Green — minimum code change

Added active-session rejection guard in [submit-answer.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/submit-answer.ts:126):

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

No abstraction extracted; guard remains local and explicit.

---

## Verification

- [x] Unit tests added and passing (active exam + active tutor session_review provenance).
- [x] Manual verification post-fix confirmed active-session retries are rejected before grading.
- [x] Gate run: `pnpm typecheck && pnpm lint && pnpm test --run`.
