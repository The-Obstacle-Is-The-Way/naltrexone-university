# BUG-260: Question Feedback Trusts Client-Supplied Attempt and Session Context IDs

**Status:** Open
**Severity:** P4
**Date:** 2026-06-23
**Confirmed:** 2026-06-23
**Component:** Question Feedback / Analytics Export / Data Integrity

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

- [`question-feedback-controller.ts`](../../src/adapters/controllers/question-feedback-controller.ts#L43) accepts `attemptId` and `practiceSessionId` on rating input.
- [`question-feedback-controller.ts`](../../src/adapters/controllers/question-feedback-controller.ts#L59) accepts the same context fields on report input.
- [`question-feedback-controller.ts`](../../src/adapters/controllers/question-feedback-controller.ts#L128) authenticates/entitles the rating caller, then [`question-feedback-controller.ts`](../../src/adapters/controllers/question-feedback-controller.ts#L135) forwards the context IDs (`attemptId` / `practiceSessionId`) unchanged into the use case.
- [`question-feedback-controller.ts`](../../src/adapters/controllers/question-feedback-controller.ts#L183) authenticates/entitles the report caller, then [`question-feedback-controller.ts`](../../src/adapters/controllers/question-feedback-controller.ts#L190) forwards the context IDs unchanged.

The use cases validate the question, but not the context:

- [`rate-question.ts`](../../src/application/use-cases/rate-question.ts#L28) fetches the published question and [`rate-question.ts`](../../src/application/use-cases/rate-question.ts#L33) records the provided `attemptId` / `practiceSessionId`.
- [`submit-question-report.ts`](../../src/application/use-cases/submit-question-report.ts#L31) fetches the published question and [`submit-question-report.ts`](../../src/application/use-cases/submit-question-report.ts#L36) records the provided context.

The repository and database preserve the supplied IDs:

- [`drizzle-question-feedback-repository.ts`](../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L20) inserts feedback rows.
- [`drizzle-question-feedback-repository.ts`](../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L25) writes `attemptId` from the event.
- [`drizzle-question-feedback-repository.ts`](../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L26) writes `practiceSessionId` from the event.
- [`schema.ts`](../../db/schema.ts#L547) constrains feedback `userId`.
- [`schema.ts`](../../db/schema.ts#L553) and [`schema.ts`](../../db/schema.ts#L556) define independent FKs to attempts and sessions, but no ownership/question/session-membership constraint.

The exported data makes the stale context operational:

- [`export-question-feedback.ts`](../../scripts/export-question-feedback.ts#L157) reads feedback rows.
- [`export-question-feedback.ts`](../../scripts/export-question-feedback.ts#L166) selects `attemptId`.
- [`export-question-feedback.ts`](../../scripts/export-question-feedback.ts#L167) selects `practiceSessionId`.
- [`export-question-feedback.ts`](../../scripts/export-question-feedback.ts#L217) maps rows to export records, including context at [`export-question-feedback.ts`](../../scripts/export-question-feedback.ts#L225) and [`export-question-feedback.ts`](../../scripts/export-question-feedback.ts#L226).
- [`export-question-feedback.ts`](../../scripts/export-question-feedback.ts#L246) emits CSV headers including `attempt_id` and `practice_session_id`.

The missing validation matters because the spec says the context exists for correctness/mode correlation:

- [`spec-041-question-feedback.md`](../_archive/specs/spec-041-question-feedback.md#L78) says feedback persists best-effort context so analysis can correlate whether the learner got the question right and in which mode.

## Impact

Feedback analytics can attribute a rating/report to the wrong attempt or practice session. That can mislead content triage about whether a learner got a question right, whether it happened in tutor/exam mode, or which session context produced the report. It does not alter user scores or expose another user's data through an app read path.

## Proposed Fix

Validate feedback context in the application layer before recording feedback. Extend `RateQuestionUseCase` and `SubmitQuestionReportUseCase` with injected `AttemptRepository` and `PracticeSessionRepository` dependencies, and add a shared application helper that normalizes or rejects context:

1. If `attemptId` is present, load it with `findByIdAndUserId(attemptId, userId)` and require `attempt.questionId === input.questionId`.
2. If `practiceSessionId` is present, load it with `findByIdAndUserId(practiceSessionId, userId)` and require `session.questionIds.includes(input.questionId)`.
3. If both are present, require the attempt's `practiceSessionId` to match the supplied session when the attempt is session-scoped.
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

Add sibling tests for a session that does not contain the question, a valid attempt/session pair, and null context. Today the rejection test fails because the use cases do not load attempts or sessions before recording the feedback row.

## Prior Bug Cross-Refs

- BUG-250 fixed CSV formula injection in the feedback export. BUG-260 is about the integrity of exported context IDs, not formula escaping.
- BUG-098 covered submit-answer session membership. BUG-260 applies the same ownership/membership principle to optional feedback metadata.
- BUG-257 added session-owned question reads after session membership is proven. BUG-260 is a separate feedback-context validation gap.
