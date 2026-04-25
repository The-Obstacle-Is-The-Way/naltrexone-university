# BUG-238: Active Exam Draft Save Allows Unbounded cumulativeMs

**Status:** In Progress
**Priority:** P3
**Date:** 2026-04-25
**Confirmed:** 2026-04-25
**Component:** Practice / Exam Drafts / Validation
**Resolution State:** Fixed on branch `fix-bug-238-exam-draft-cumulative-ms-bound`; pending PR review, merge verification, and archival.

---

## Description

The active-exam draft-save path accepts an unbounded `cumulativeMs` value, persists it into `practice_sessions.params_json`, and later converts it directly into `attempts.time_spent_seconds` during exam finalization.

Observed behavior:
- `saveExamDraftAnswer` accepts any non-negative integer `cumulativeMs`.
- The application use case passes that value through without normalization.
- The session params parser accepts any non-negative integer `draftCumulativeMs`.
- `finalizeExamAnswers` writes `Math.floor(draftCumulativeMs / 1000)` into the `attempts.time_spent_seconds` integer column.

Expected behavior:
- Active-exam draft timing must obey the same bounded timing invariant as `submitAnswer`.
- A malformed or stale client must not be able to persist an impossible per-question duration or make `Submit exam` fail later.

## Impact

This is a same-user data integrity bug, not a cross-user security issue.

- A malicious or broken client can save a huge `cumulativeMs` for an active exam question.
- Finalizing the exam can then either persist nonsensical timing data or fail when Postgres receives a value outside the `integer` range for `attempts.time_spent_seconds`.
- The failure happens at the high-stakes `Submit exam` boundary, after the user's draft answers have already been saved.

## Root Cause

Tracer-bullet path:

1. [`SaveExamDraftAnswerInputSchema`](../../src/adapters/controllers/practice-schemas.ts#L55) validates `cumulativeMs` with `z.number().int().min(0)` but no upper bound.
2. [`SaveExamDraftAnswerUseCase`](../../src/application/use-cases/save-exam-draft-answer.ts#L64) forwards `input.cumulativeMs` directly to `sessions.saveDraftAnswer(...)`.
3. [`DrizzlePracticeSessionRepository.saveDraftAnswer(...)`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L233) persists the raw value into `draftCumulativeMs`.
4. [`practice-session-params.ts`](../../src/adapters/repositories/practice-session-params.ts#L33) accepts persisted `draftCumulativeMs` with only `z.number().int().min(0)`, so oversized values remain valid session state.
5. [`FinalizeExamAnswersUseCase`](../../src/application/use-cases/finalize-exam-answers.ts#L103) inserts the final attempt with `timeSpentSeconds: Math.floor(state.draftCumulativeMs / 1000)`.
6. [`attempts.time_spent_seconds`](../../db/schema.ts#L441) is a Postgres `integer`, and the already-established submit-answer limit is `MAX_TIME_SPENT_SECONDS = 86_400`.

This is the draft/finalize sibling of archived [BUG-108](../_archive/bugs/bug-108-submit-answer-unbounded-time-spent-seconds.md). BUG-108 fixed direct `submitAnswer` timing, but the active-exam draft path was added later and did not inherit the same invariant.

## Expected Fix

Keep the invariant close to both ingress and finalization:

- Add a shared millisecond bound for exam drafts, derived from `MAX_TIME_SPENT_SECONDS * 1000`.
- Reject out-of-range `cumulativeMs` at `SaveExamDraftAnswerInputSchema` so normal callers get a `VALIDATION_ERROR`.
- Defensively clamp or validate inside `SaveExamDraftAnswerUseCase` so non-controller callers cannot persist oversized draft timing.
- Defensively cap `FinalizeExamAnswersUseCase` when converting persisted `draftCumulativeMs` to `timeSpentSeconds`, so any legacy oversized draft cannot brick finalization.
- Do not add a database migration for this unless code-level normalization is insufficient; the immediate bug is boundary validation and finalization safety.

## Verification

- [x] Code-level tracer-bullet verified on 2026-04-25.
- [x] Existing `submitAnswer` path confirmed to have a 24-hour controller cap and use-case clamp.
- [x] Unit test: `saveExamDraftAnswer` rejects or clamps `cumulativeMs > MAX_TIME_SPENT_SECONDS * 1000`.
  - Evidence: `src/application/use-cases/save-exam-draft-answer.test.ts` covers over-bound clamping, in-bound preservation, and negative/NaN normalization.
- [x] Controller test: `saveExamDraftAnswer` returns `VALIDATION_ERROR` for oversized `cumulativeMs`.
  - Evidence: `src/adapters/controllers/practice-controller.test.ts` covers schema rejection and no use-case execution.
- [x] Unit test: `finalizeExamAnswers` caps legacy oversized `draftCumulativeMs` before writing `timeSpentSeconds`.
  - Evidence: `src/application/use-cases/finalize-exam-answers.test.ts` covers a `Number.MAX_SAFE_INTEGER` legacy draft and asserts `86_400` seconds.
- [x] Integration test: oversized persisted draft does not cause `Submit exam` / `finalizeExamAnswers` to fail with a raw DB integer error.
  - Evidence: `tests/integration/bug-regression.integration.test.ts` covers controller ingress rejection without persistence and legacy finalize capping against real Postgres.
- [x] Full gate after fix: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`.
  - Evidence: passed locally on 2026-04-25.

## Related

- [BUG-108](../_archive/bugs/bug-108-submit-answer-unbounded-time-spent-seconds.md)
- [Interaction Contracts](../practice-engine/interaction-contracts.md)
- [Exam Answer Secrecy Policy](../practice-engine/exam-answer-secrecy-policy.md)
