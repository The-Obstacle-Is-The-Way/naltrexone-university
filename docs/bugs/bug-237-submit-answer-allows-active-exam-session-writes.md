# BUG-237: submitAnswer Allows Final Attempt Writes During Active Exam Sessions

**Status:** Open
**Priority:** P2
**Date:** 2026-04-24

---

## Description

The current exam-mode contract is draft-only until the user clicks `Submit exam`, but the `submitAnswer` server-action path still accepts an active exam `sessionId` and writes a final `attempts` row plus finalized session answer state.

Observed behavior:
- `submitAnswer` accepts `sessionId` for any non-ended session, including `mode='exam'`.
- For active exam sessions, it inserts into `attempts` and calls `recordQuestionAnswer(...)`.
- The response redacts correctness, but the database write has already bypassed the draft/finalize lifecycle.

Expected behavior:
- Active exam sessions should only accept `saveExamDraftAnswer(...)` before submission.
- Final `attempts` rows and finalized `latest*` session state should only be created by `FinalizeExamAnswersUseCase` when the user submits the whole exam.

## Steps to Reproduce

1. Start an exam-mode practice session.
2. Call the authenticated `submitAnswer` server action with `{ sessionId, questionId, choiceId }` for a question in that active exam.
3. Observe that an `attempts` row is inserted for the active exam session and `recordQuestionAnswer(...)` writes finalized `latestSelectedChoiceId`, `latestIsCorrect`, and `latestAnsweredAt`.
4. Optionally change that same question through the normal exam UI so a draft is saved.
5. Click `Submit exam`.
6. Finalization tries to insert another attempt for the same `(practiceSessionId, questionId)` and can hit the `attempts_session_question_uq` unique index.

## Root Cause

Tracer-bullet path:
1. The interaction contract says exam mode has no per-question submit and answers remain drafts until `Submit exam` in [interaction-contracts.md](../practice-engine/interaction-contracts.md#L15) through [interaction-contracts.md](../practice-engine/interaction-contracts.md#L18), [interaction-contracts.md](../practice-engine/interaction-contracts.md#L122) through [interaction-contracts.md](../practice-engine/interaction-contracts.md#L127), and [interaction-contracts.md](../practice-engine/interaction-contracts.md#L157) through [interaction-contracts.md](../practice-engine/interaction-contracts.md#L167).
2. `SubmitAnswerInputSchema` still permits an optional `sessionId` without any mode-level restriction in [question-controller.ts](../../src/adapters/controllers/question-controller.ts#L77) through [question-controller.ts](../../src/adapters/controllers/question-controller.ts#L92).
3. The controller forwards that `sessionId` directly to `SubmitAnswerUseCase` in [question-controller.ts](../../src/adapters/controllers/question-controller.ts#L214) through [question-controller.ts](../../src/adapters/controllers/question-controller.ts#L270).
4. `SubmitAnswerUseCase` only rejects missing sessions, questions outside the session, and already-ended sessions in [submit-answer.ts](../../src/application/use-cases/submit-answer.ts#L170) through [submit-answer.ts](../../src/application/use-cases/submit-answer.ts#L183). It does not reject active exam sessions.
5. For any accepted session, the use case inserts a final attempt and calls `recordQuestionAnswer(...)` in [submit-answer.ts](../../src/application/use-cases/submit-answer.ts#L194) through [submit-answer.ts](../../src/application/use-cases/submit-answer.ts#L225).
6. Exam finalization later inserts attempts for draft states in [finalize-exam-answers.ts](../../src/application/use-cases/finalize-exam-answers.ts#L85) through [finalize-exam-answers.ts](../../src/application/use-cases/finalize-exam-answers.ts#L119).
7. The database enforces a single attempt per session question with `attempts_session_question_uq` in [schema.ts](../../db/schema.ts#L474) through [schema.ts](../../db/schema.ts#L478), so a direct active-exam submit followed by a draft finalization can fail the exam submission transaction.

## Impact

This is not a direct answer-key leak because BUG-193 redaction still keeps the `submitAnswer` response neutral for active exams. The higher-risk issue is data integrity: an authenticated server-action path can bypass the shipped exam lifecycle, create active-exam attempt rows before finalization, and potentially make `Submit exam` fail if the student later changes the answer through the normal draft flow.

It also explains why user-facing projections still need active-exam attempt defenses: the application boundary can still create those rows before the exam is ended.

## Expected Fix

Reject active exam sessions in `SubmitAnswerUseCase` before any attempt insert:
- If `session.mode === 'exam' && session.endedAt === null`, throw an `ApplicationError` such as `VALIDATION_ERROR` or `CONFLICT`.
- Keep standalone quick-practice submissions and tutor-session submissions unchanged.
- Keep completed-session rejection unchanged.
- Do not silently route `submitAnswer` to draft save; callers that are in exam mode should use the explicit draft/finalize actions.

After the use-case guard lands, update the exam-answer secrecy policy's `SubmitAnswer` status note so it no longer treats active-exam submits as an allowed redacted path.

## Verification

- [ ] Add a `SubmitAnswerUseCase` unit test proving active exam sessions are rejected before any attempt is inserted.
- [ ] Add controller coverage proving `submitAnswer({ sessionId })` for an active exam returns the expected action error and does not call the submit use case if the guard is placed at the controller boundary, or returns the use-case error if the guard is placed in the use case.
- [ ] Add an integration regression test proving active exam sessions cannot create `attempts` rows through `submitAnswer`.
- [ ] Verify tutor sessions and standalone quick practice still submit normally.

## Related

- Current contract: [interaction-contracts.md](../practice-engine/interaction-contracts.md)
- Policy note to update after fix: [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)
- Downstream projection bugs: [BUG-235](./bug-235-attempted-question-history-drops-latest-visible-attempt.md), [BUG-236](./bug-236-dashboard-current-streak-includes-active-exam-attempts.md)
