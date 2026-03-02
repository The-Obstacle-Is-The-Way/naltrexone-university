# BUG-180: Active Exam Answer Leak via Review Hydration

**Status:** Resolved
**Priority:** P1
**Date:** 2026-03-02
**Resolved:** 2026-03-02 (PR #162, commit `f04e0a9`)

---

## Description

`getPreviousAttempt` reveals `correctChoiceId` and explanations for attempts that belong to an exam session that is still active (`endedAt === null`), across all identifier paths (`sessionId`, `attemptId`, and implicit "latest attempt").

Observed behavior:
- A user can open question review mode for an attempt from an active exam session and receive full answer-key payload for already-answered questions.

Expected behavior:
- Active exam sessions must not reveal correctness/explanations before session end.

---

## Steps to Reproduce

1. Start an exam-mode session and answer a question (session remains active).
2. Open any of:
   - `/app/questions/<slug>?mode=review&sessionId=<active-session-id>`
   - `/app/questions/<slug>?mode=review&attemptId=<active-session-attempt-id>` (Dashboard path)
   - `/app/questions/<slug>?mode=review` when the latest attempt for that question is from the active exam session (History/Bookmarks-style path)
3. The page hydrates via `getPreviousAttempt` and returns `correctChoiceId` and explanation content.

Executable verification performed on 2026-03-02:
1. Repro harness called `GetPreviousAttemptUseCase.execute({ userId, questionId, sessionId: activeExamSessionId })`.
2. Output was `{ kind: 'attempt', correctChoiceId: 'c2', explanationMd: 'Because.' }` while session `endedAt` was `null`.
3. Repro harness called `GetPreviousAttemptUseCase.execute({ userId, questionId, attemptId: activeExamAttemptId })` and received full answer payload.
4. Repro harness called `GetPreviousAttemptUseCase.execute({ userId, questionId })` (latest-attempt path) and received full answer payload when latest attempt belonged to the active exam session.

---

## Root Cause

Tracer-bullet path:
1. [use-question-page-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/use-question-page-controller.ts:321) calls `loadPreviousAttempt` in review mode.
2. Review links can provide `sessionId` (session review), `attemptId` (Dashboard at [dashboard/page.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/dashboard/page.tsx:230)), or neither (History/Bookmarks standalone review at [history-questions-tab.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/components/history-questions-tab.tsx:452)).
3. [question-page-logic.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/question-page-logic.ts:331) calls `getPreviousAttempt` with whichever identifiers are present.
4. [question-view-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/controllers/question-view-controller.ts:124) forwards to use case.
5. [get-previous-attempt.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.ts:83) selects attempt by `attemptId`, `sessionId + questionId`, or latest-by-question.
6. If attempt exists, code returns full answer key at [get-previous-attempt.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.ts:169) without checking whether the attempt belongs to an active exam session.
7. The only `endedAt` guard exists in the unanswered `sessionId` branch at [get-previous-attempt.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.ts:104), so answered attempts in active exam sessions bypass gating regardless of identifier path.

---

## Fix (TDD)

Fixed.

### Red — failing tests added first

Added regression tests in [get-previous-attempt.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.test.ts:176) and [get-previous-attempt.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.test.ts:235):

```typescript
it('returns null when attemptId belongs to an active exam session', async () => {
  // Arrange: active exam session (endedAt: null) + attempt in that session
  // Act: execute({ userId, questionId: 'q1', attemptId: activeAttempt.id })
  // Assert: result is null (no answer key leaked)
});

it('returns null when latest attempt belongs to an active exam session', async () => {
  // Arrange: latest attempt for q1 belongs to active exam session
  // Act: execute({ userId, questionId: 'q1' })
  // Assert: result is null
});
```

These tests failed before the guard existed and now pass.

### Green — minimum code change

Added active-exam guard in [get-previous-attempt.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.ts:149):

```typescript
if (attempt.practiceSessionId) {
  const attemptSession = await this.sessions.findByIdAndUserId(
    attempt.practiceSessionId,
    input.userId,
  );
  if (attemptSession?.mode === 'exam' && attemptSession.endedAt === null) {
    return null;
  }
}
```

This closes all three leak paths (`sessionId`, `attemptId`, latest) because all of them converge on the same answered-attempt branch.

### Refactor

No abstraction extracted; change kept local to this ingress guard.

---

## Verification

- [x] Unit tests added and passing.
- [x] Manual verification post-fix confirmed active-exam attempts now hydrate as `null`.
- [x] Gate run: `pnpm typecheck && pnpm lint && pnpm test --run`.
