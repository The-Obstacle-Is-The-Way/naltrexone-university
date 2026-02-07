# BUG-098: submitAnswer Accepts Questions Not in Session

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

`SubmitAnswerUseCase.execute()` validated session ownership but did **not** validate `questionId ∈ session.questionIds` before inserting attempts. Active-session mismatches were already rolled back by existing code, but ended-session mismatches could still be inserted and linked to the wrong session.

**Observed:** A malicious or buggy client could submit `sessionId` + unrelated `questionId` after session end and still persist an attempt tied to that session.

**Expected:** The use case should validate `questionId ∈ session.questionIds` before inserting the attempt.

## Steps to Reproduce

1. Create a session with `questionIds = ['q1']` and `endedAt != null`
2. Call `submitAnswer({ sessionId, questionId: 'q2', choiceId: 'c2' })`
3. Observe attempt insertion succeeds even though `q2` is not in session

## Root Cause

`submit-answer.ts` performed no explicit question-membership guard after loading session ownership. Attempt insertion happened for any owned session, including ended sessions where `recordQuestionAnswer` is intentionally skipped.

**File:** `src/application/use-cases/submit-answer.ts`
**Lines:** 67-86

## Fix

Added a pre-insert membership guard:

- if `session` exists and `question.id` is not in `session.questionIds`, throw `NOT_FOUND`
- this guard executes before attempt insertion for both active and ended sessions

## Verification

- [x] Unit test: ended-session mismatch throws `NOT_FOUND` and persists no attempt
- [x] Existing `SubmitAnswerUseCase` tests still pass for normal session/non-session paths
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- `src/application/use-cases/submit-answer.ts`
- `src/application/use-cases/submit-answer.test.ts`
