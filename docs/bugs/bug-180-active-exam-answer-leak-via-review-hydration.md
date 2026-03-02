# BUG-180: Active Exam Answer Leak via Review Hydration

**Status:** Open
**Priority:** P1
**Date:** 2026-03-02

---

## Description

`getPreviousAttempt` reveals `correctChoiceId` and explanations for attempts that belong to an exam session that is still active (`endedAt === null`).

Observed behavior:
- A user can open question review mode with `sessionId` for an active exam session and receive full answer-key payload for already-answered questions.

Expected behavior:
- Active exam sessions must not reveal correctness/explanations before session end.

---

## Steps to Reproduce

1. Start an exam-mode session and answer a question (session remains active).
2. Open `/app/questions/<slug>?mode=review&sessionId=<active-session-id>`.
3. The page hydrates via `getPreviousAttempt` and returns `correctChoiceId` and explanation content.

Executable verification performed on 2026-03-02:
1. Repro harness called `GetPreviousAttemptUseCase.execute({ userId, questionId, sessionId: activeExamSessionId })`.
2. Output was `{ kind: 'attempt', correctChoiceId: 'c2', explanationMd: 'Because.' }` while session `endedAt` was `null`.

---

## Root Cause

Tracer-bullet path:
1. [use-question-page-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/use-question-page-controller.ts:321) calls `loadPreviousAttempt` in review mode.
2. [question-page-logic.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/questions/[slug]/question-page-logic.ts:331) calls `getPreviousAttempt` with `sessionId`.
3. [question-view-controller.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/controllers/question-view-controller.ts:124) forwards to use case.
4. [get-previous-attempt.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.ts:86) loads session-scoped attempt.
5. If attempt exists, code returns full answer key at [get-previous-attempt.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.ts:169) without checking whether that session is ended.
6. The only `endedAt` guard exists in the unanswered branch at [get-previous-attempt.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-previous-attempt.ts:104), so answered attempts in active exam sessions bypass exam explanation gating.

---

## Fix

Not fixed yet.

Proposed fix direction:
1. When `sessionId` is provided and an attempt is found, load session and require `endedAt !== null` before returning `correctChoiceId` / explanations.
2. If session is active, return `null` (or a gated payload with no correctness/explanations).
3. Add regression tests for active exam + answered attempt + `sessionId` review hydration.

---

## Verification

How was the fix verified?

- [ ] Unit test added
- [ ] Integration test added
- [x] Manual verification

