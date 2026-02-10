# BUG-123: Server Returns `correctChoiceId` to Client in Exam Mode

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-09
**Resolved:** 2026-02-10

---

## Description

During an in-progress exam session, the API returned `correctChoiceId` in the submit response. This leaks the correct answer before the exam is finalized.

## Root Cause

`SubmitAnswerUseCase` always populated `correctChoiceId`, even when explanations were intentionally hidden in exam mode.

## Resolution

- Make `correctChoiceId` nullable in `SubmitAnswerOutput`.
- Return `correctChoiceId: null` whenever the domain indicates explanations should be hidden (active exam session).
- Update controller runtime schema to accept `null`.
- Add regression coverage in the submit-answer use case tests.

Key files:

- `src/application/use-cases/submit-answer.ts`
- `src/application/use-cases/submit-answer.test.ts`
- `src/adapters/controllers/question-controller.ts`

## Verification

- `pnpm test --run`

