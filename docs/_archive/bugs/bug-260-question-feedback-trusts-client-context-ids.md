# BUG-260: Question Feedback Trusts Client-Supplied Attempt and Session Context IDs

**Status:** Resolved
**Severity:** P4
**Date:** 2026-06-23
**Confirmed:** 2026-06-23
**Resolved:** 2026-06-25
**Component:** Question Feedback / Analytics Export / Data Integrity

---

## Resolution

**Fixed and prod-verified 2026-06-25.** Implemented exactly per the Proposed Fix below: a shared `validateFeedbackContext` application helper, with `AttemptRepository` + `PracticeSessionRepository` injected into `RateQuestionUseCase` and `SubmitQuestionReportUseCase`, validates optional client context before the feedback row is recorded:

- a present `attemptId` must be owned by the caller (`findByIdAndUserId`) and its `questionId` must equal the feedback question;
- a present `practiceSessionId` must be owned by the caller and its `questionIds` must include the feedback question;
- when both are present, the attempt must belong to the supplied session either directly (`practiceSessionId`) or as a session-review retry (`retryOrigin=session_review` plus matching `retrySessionId`).

Not-found / not-owned context throws `NOT_FOUND`; found-but-mismatched context throws `VALIDATION_ERROR`; null context is still allowed (standalone / best-effort); only validated context IDs are persisted. The controller, schema, repository, and export script were unchanged.

- **TDD:** 11-branch helper test (`validate-feedback-context.test.ts`) + per-use-case reject/valid/null integration tests; red→green verified (neutering the validator failed exactly the 11 guard tests, the 11 valid/null tests stayed green). Full gate green (typecheck, lint, unit 2994, build).
- **Fix PR:** [#516](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/516) — squash `542eedbc` to `dev`. CodeRabbit reviewed the exact head `3cb21ae2` ("No actionable comments were generated in the recent review", 0 unresolved threads).
- **Promotion:** [#517](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/517) — merge commit `602997b9` to `main` (byte-identical-tree owner-override; CodeRabbit rate-limited on the promo, `git diff 3cb21ae2 origin/main` empty).
- **Prod-verified:** deploy `dpl_EFeg1cHqhTvdTU2W5bWq5iuyJDDe` (commit `602997b9`, `target: production`) READY, `addictionboards.com` 200.

### Residual + completion (2026-06-25)

A post-archive re-audit found one residual both-ID gap in the original helper rule: it rejected mismatched session-scoped attempts, but still accepted an owned standalone attempt for the same question paired with an unrelated owned session that also contained the question. That could still persist misleading export-correlation metadata. The completion fix tightens the both-ID invariant to require a real attempt/session relationship: either `attempt.practiceSessionId === input.practiceSessionId`, or the attempt is a legitimate session-review retry with `retryOrigin === 'session_review'` and `retrySessionId === input.practiceSessionId`. The retry branch is required because the real session-review "Try Again" path submits a standalone retry attempt while preserving the reviewed session id for feedback context.

This is treated as BUG-260 completion, not a new bug ID. Added regression coverage rejects the standalone-attempt + unrelated-session pair at the helper level and through both `RateQuestionUseCase` and `SubmitQuestionReportUseCase`, while preserving null context, standalone-with-null-session, direct session attempts, and session-review retry feedback.

---

## Summary

Question rating and report actions accept optional `attemptId` and `practiceSessionId` from the client, validate only that they are UUID-shaped, and persist them unchanged. The use cases verify that the `questionId` is published, but they never verify that the attempt/session belongs to the current user, matches the feedback question, or contains that question. The export script then emits those context IDs for offline feedback analysis.

The normal UI usually sends server-derived context, so this is not a broad user-facing break. It is still a real low-severity integrity bug because an entitled user can make a crafted server-action call that attaches feedback to unrelated existing context, corrupting the metadata that SPEC-041 says exists for mode/correctness correlation.

## Reachability

Reachable by an authenticated, entitled user through the real `rateQuestion` / `submitQuestionReport` server actions. The honest UI path mostly passes correct server-derived IDs, and cross-user pollution requires knowing an unguessable UUID, so severity stays P4. The concrete harm is persistent misleading feedback metadata in the operator export, not app-visible score corruption or cross-user data disclosure.

## Reproduction

1. As an entitled user, have an existing attempt for question `Q2` or a completed session that does not include question `Q1`.
2. Submit a crafted `rateQuestion` or `submitQuestionReport` action payload for published question `Q1` with the unrelated `attemptId` or `practiceSessionId`.
3. The controller accepts the UUID-shaped IDs, the use case validates only `Q1`, and the repository inserts the row.
4. Run the feedback export.

Expected: feedback context is either verified to match the user/question/session or is rejected/omitted.

Actual: the feedback row persists and exports an unrelated context ID.

## Root Cause

The controller boundary only validates UUID shape:

- [`question-feedback-controller.ts`](../../../src/adapters/controllers/question-feedback-controller.ts#L43) accepts `attemptId` and `practiceSessionId` on rating input.
- [`question-feedback-controller.ts`](../../../src/adapters/controllers/question-feedback-controller.ts#L59) accepts the same context fields on report input.
- [`question-feedback-controller.ts`](../../../src/adapters/controllers/question-feedback-controller.ts#L128) authenticates/entitles the rating caller, then [`question-feedback-controller.ts`](../../../src/adapters/controllers/question-feedback-controller.ts#L135) forwards the context IDs (`attemptId` / `practiceSessionId`) unchanged into the use case.
- [`question-feedback-controller.ts`](../../../src/adapters/controllers/question-feedback-controller.ts#L183) authenticates/entitles the report caller, then [`question-feedback-controller.ts`](../../../src/adapters/controllers/question-feedback-controller.ts#L190) forwards the context IDs unchanged.

The use cases validate the question, but not the context:

- [`rate-question.ts`](../../../src/application/use-cases/rate-question.ts#L28) fetches the published question and [`rate-question.ts`](../../../src/application/use-cases/rate-question.ts#L33) records the provided `attemptId` / `practiceSessionId`.
- [`submit-question-report.ts`](../../../src/application/use-cases/submit-question-report.ts#L31) fetches the published question and [`submit-question-report.ts`](../../../src/application/use-cases/submit-question-report.ts#L36) records the provided context.

The repository and database preserve the supplied IDs:

- [`drizzle-question-feedback-repository.ts`](../../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L20) inserts feedback rows.
- [`drizzle-question-feedback-repository.ts`](../../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L25) writes `attemptId` from the event.
- [`drizzle-question-feedback-repository.ts`](../../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L26) writes `practiceSessionId` from the event.
- [`schema.ts`](../../../db/schema.ts#L547) constrains feedback `userId`.
- [`schema.ts`](../../../db/schema.ts#L553) and [`schema.ts`](../../../db/schema.ts#L556) define independent FKs to attempts and sessions, but no ownership/question/session-membership constraint.

The exported data makes the stale context operational:

- [`export-question-feedback.ts`](../../../scripts/export-question-feedback.ts#L157) reads feedback rows.
- [`export-question-feedback.ts`](../../../scripts/export-question-feedback.ts#L166) selects `attemptId`.
- [`export-question-feedback.ts`](../../../scripts/export-question-feedback.ts#L167) selects `practiceSessionId`.
- [`export-question-feedback.ts`](../../../scripts/export-question-feedback.ts#L217) maps rows to export records, including context at [`export-question-feedback.ts`](../../../scripts/export-question-feedback.ts#L225) and [`export-question-feedback.ts`](../../../scripts/export-question-feedback.ts#L226).
- [`export-question-feedback.ts`](../../../scripts/export-question-feedback.ts#L246) emits CSV headers including `attempt_id` and `practice_session_id`.

The missing validation matters because the spec says the context exists for correctness/mode correlation:

- [`spec-041-question-feedback.md`](../specs/spec-041-question-feedback.md#L78) says feedback persists best-effort context so analysis can correlate whether the learner got the question right and in which mode.

## Impact

Feedback analytics can attribute a rating/report to the wrong attempt or practice session. That can mislead content triage about whether a learner got a question right, whether it happened in tutor/exam mode, or which session context produced the report. It does not alter user scores or expose another user's data through an app read path.

## Proposed Fix

Validate feedback context in the application layer before recording feedback. Extend `RateQuestionUseCase` and `SubmitQuestionReportUseCase` with injected `AttemptRepository` and `PracticeSessionRepository` dependencies, and add a shared application helper that normalizes or rejects context:

1. If `attemptId` is present, load it with `findByIdAndUserId(attemptId, userId)` and require `attempt.questionId === input.questionId`.
2. If `practiceSessionId` is present, load it with `findByIdAndUserId(practiceSessionId, userId)` and require `session.questionIds.includes(input.questionId)`.
3. If both are present, require the attempt to belong to the supplied session either directly (`attempt.practiceSessionId === input.practiceSessionId`) or as a session-review retry (`attempt.retryOrigin === 'session_review' && attempt.retrySessionId === input.practiceSessionId`).
4. Reject missing or not-owned context with `NOT_FOUND`, reject found-but-mismatched context with `VALIDATION_ERROR`, and continue allowing null context for standalone or best-effort cases.
5. Persist only validated context IDs.

Rejected alternatives:

- Trust the existing UI to supply correct context: server actions are callable by authenticated clients and must enforce their own integrity boundary.
- Drop context IDs from feedback entirely: avoids corruption but loses the intended SPEC-041 analytics feature.
- Fix only the export script: too late; the persisted row remains misleading and future consumers can still join on bad metadata.
- Use only database constraints: ownership and session membership are application concepts spanning attempts plus `practice_sessions.params_json`, and are already handled cleanly in use cases elsewhere.

## Failing Test Sketch

```ts
it('rejects feedback context when the attempt belongs to a different question', async () => {
  const questions = new FakeQuestionRepository([questionQ1]);
  const attempts = new FakeAttemptRepository([
    createAttempt({ id: attemptForQ2Id, userId, questionId: questionQ2Id }),
  ]);
  const sessions = new FakePracticeSessionRepository();
  const feedback = new FakeQuestionFeedbackRepository();
  const useCase = new RateQuestionUseCase(
    feedback,
    questions,
    attempts,
    sessions,
  );

  await expect(
    useCase.execute({
      userId,
      questionId: questionQ1Id,
      attemptId: attemptForQ2Id,
      practiceSessionId: null,
      rating: 'helpful',
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

  expect(feedback.recordCalls).toEqual([]);
});
```

Add sibling tests for a session that does not contain the question, a valid direct attempt/session pair, a valid session-review retry pair, a standalone attempt with null session, and null context. The 2026-06-25 completion regression rejects a standalone attempt paired with an unrelated session even when both are owned and both point at / contain the feedback question.

## Prior Bug Cross-Refs

- BUG-250 fixed CSV formula injection in the feedback export. BUG-260 is about the integrity of exported context IDs, not formula escaping.
- BUG-098 covered submit-answer session membership. BUG-260 applies the same ownership/membership principle to optional feedback metadata.
- BUG-257 added session-owned question reads after session membership is proven. BUG-260 is a separate feedback-context validation gap.
