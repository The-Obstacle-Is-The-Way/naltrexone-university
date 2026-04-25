# BUG-237: submitAnswer Allows Final Attempt Writes During Active Exam Sessions

**Status:** Fixed (pending PR)
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

Reject active exam sessions in `SubmitAnswerUseCase` (the use case, not the controller — this is a domain invariant, and the controller is only a transport boundary). The guard must run **before any attempt insert and before `recordQuestionAnswer(...)`** so no row is written and no draft/final state is mutated.

Concrete shape:
- After the existing "session not found" and "question not in session" checks — and before the existing "session already ended" check and before building `attemptInsertInput` at `submit-answer.ts:194` — add: `if (session && session.mode === 'exam' && session.endedAt === null) throw new ApplicationError('VALIDATION_ERROR', 'Per-question submit is not available in exam mode');`
- Use `VALIDATION_ERROR`, mirroring the symmetrical guard in `SaveExamDraftAnswerUseCase` (`save-exam-draft-answer.ts:35-40`: "Draft answers are only available in exam mode"). This is a wrong-shape-for-mode error, not a state conflict.
- Order matters: keep `NOT_FOUND` (missing session, question outside session) BEFORE the new guard, and keep the existing `endedAt !== null` `CONFLICT` AFTER the new guard. The new guard is exam-mode-AND-active-only; ended exams continue to fall through to the existing `CONFLICT` branch.
- Do NOT silently route `submitAnswer` to draft save. Exam-mode UI must already be using `saveExamDraftAnswer` per the shipped contract; this guard is the server-side enforcement of that contract.
- Tutor-mode session submissions, standalone quick-practice submissions (no `sessionId`), and retry submissions (`retryOrigin` set, `sessionId` already disallowed at `submit-answer.ts:118-123`) must remain unchanged.

After the use-case guard lands, update the exam-answer secrecy policy's `SubmitAnswer` status note so it no longer treats active-exam submits as an allowed redacted path.

## Verification

- [x] Add a `SubmitAnswerUseCase` unit test (Vitest, in-memory fakes only — `FakePracticeSessionRepository`, `FakeAttemptRepository`, `FakeQuestionRepository`, `FakeLogger`) proving active exam sessions throw `ApplicationError` with code `VALIDATION_ERROR` BEFORE any `attempts` row is inserted and BEFORE `recordQuestionAnswer(...)` is called. Assert via fake call counts / state, not via mocks. Evidence: `src/application/use-cases/submit-answer.test.ts` → `rejects active exam sessions before inserting an attempt or recording an answer`; red failed with old redacted-success payload, then passed after the use-case guard.
- [x] Add a `SubmitAnswerUseCase` unit test proving tutor-mode session submissions still succeed. Evidence: `src/application/use-cases/submit-answer.test.ts` → `updates the persisted tutor session question state with the latest answer`.
- [x] Add a `SubmitAnswerUseCase` unit test proving standalone (no `sessionId`) submissions still succeed. Evidence: `src/application/use-cases/submit-answer.test.ts` → `inserts an attempt and returns explanation for standalone submissions`.
- [x] Add a `SubmitAnswerUseCase` unit test proving ENDED exam sessions still reject with `CONFLICT` (existing guard preserved — guarantees ordering didn't regress). Evidence: `src/application/use-cases/submit-answer.test.ts` → `throws CONFLICT when submitting to an ended exam session`.
- [x] Add a `SubmitAnswerUseCase` unit test proving ENDED tutor sessions still reject with `CONFLICT` (existing guard preserved). Evidence: `src/application/use-cases/submit-answer.test.ts` → `throws CONFLICT when submitting to an ended tutor session`.
- [x] Add controller-level coverage for `submitAnswer({ sessionId })` against an active exam — confirm it surfaces the use-case error (the guard lives in the use case, not the controller, so no separate controller branch should be added). Evidence: `src/adapters/controllers/question-controller.test.ts` → `surfaces the use-case error when submitAnswer targets an active exam session`.
- [x] Add an integration regression test (`tests/integration/`) using a real Postgres test DB proving an active-exam `submitAnswer` call does NOT create an `attempts` row and does NOT mutate `practice_sessions.params_json` `latest*` fields. Evidence: `tests/integration/controllers.integration.test.ts` → `BUG-237 rejects active-exam submitAnswer without attempt or latest-state writes`.
- [x] Add an integration regression test proving the BUG-237 → finalize collision is closed: an active-exam `submitAnswer` is rejected, the user then drafts the same question through `saveExamDraftAnswer`, and `finalizeExamAnswers` succeeds without unique-index violation on `attempts_session_question_uq`. Evidence: `tests/integration/controllers.integration.test.ts` → `BUG-237 keeps draft finalization from colliding with a prior active-exam submitAnswer`.
- [x] Run the full gate before pushing: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` (per `.claude/rules/git-workflow.md` — pre-push hook is insufficient). Evidence: full gate passed on 2026-04-24 with `pnpm test --run` (282 files, 2330 tests), `pnpm test:browser` (36 files, 241 tests), `pnpm test:integration` (13 files, 83 tests), and `pnpm build` completed successfully.

## Related

- Current contract: [interaction-contracts.md](../practice-engine/interaction-contracts.md)
- Policy note to update after fix: [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)
- Downstream projection bugs: [BUG-235](./bug-235-attempted-question-history-drops-latest-visible-attempt.md), [BUG-236](./bug-236-dashboard-current-streak-includes-active-exam-attempts.md)
