# DEBT-426: Session-wide pessimistic lock in practice-session-question-state-updater defeats Track A's per-row concurrency goal

**Status:** Resolved
**Priority:** P3
**Date:** 2026-06-30

---

## Description

Before this debt was resolved, `updatePracticeSessionQuestionState` (`src/adapters/repositories/practice-session-question-state-updater.ts`) took a `SELECT ... FOR UPDATE` lock on the parent `practice_sessions` row (`lockSessionStatus`) before every single-question write, inside each retry attempt's own transaction. This was added deliberately in commit `cf2cdf21` ("Harden practice state review invariants"), with a dedicated test (`practice-session-question-state-updater-lock.test.ts`) asserting the `['lock', 'state', 'update']` call order.

The side effect was that every write to *any* question's state within a session serialized behind this one session-level lock — not just writes to that specific question's row — even though state was split into separate per-question rows specifically so concurrent updates to *different* questions would not need to contend with each other.

## Impact

Before resolution, the row-level `version` optimistic-CAS that the Track A design narrative (and the DEBT-425 doc) frames as "row-level optimistic concurrency" was effectively decorative under normal write paths: the pessimistic session lock serialized all writers before the CAS check could observe a conflict, so the "stale" retry branch was unreachable in ordinary operation. This functionally reproduced the same write-serialization granularity the old whole-blob CAS (BUG-188) had, just via a different mechanism (lock-wait instead of optimistic retry). The shipped fix now lets different-question writes proceed independently while preserving same-row CAS behavior.

There was also a client-side ambiguity that belonged with this redesign, not as an isolated quick fix. The active exam hooks treated any `CONFLICT` returned by draft save as "exam expired" recovery: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` called `recoverServerExpiredExam()` for every non-ok draft-save `CONFLICT`, while `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts` finalized the exam for every save-before-review `CONFLICT`. That was reasonable when the dominant draft-save conflict was expiry, but Track A introduced another legitimate transient `CONFLICT`: `Practice session state changed concurrently; please retry.` after exhausted row-version retries. Removing the session-wide lock made that transient state-write conflict reachable, so the shipped lock-granularity redesign also disambiguates conflict reasons before invoking expiry recovery.

## Resolution

Resolved 2026-07-03 by choosing and implementing the single joined active/ownership read plus row-version CAS design. Session-wide write serialization is not required to guard "session not ended" because the per-row CAS `UPDATE` still includes the atomic `exists (... practice_sessions.ended_at is null)` predicate. The normal state-write path no longer takes `SELECT ... FOR UPDATE` on `practice_sessions`; it reads the parent session and target state row in one joined statement snapshot, then updates the state row by `id` + `version`.

**Correction (2026-06-30, second review pass; wording updated 2026-07-01 after BUG-267 was fixed):** simply deleting the `FOR UPDATE` call would not have been a safe drop-in fix. The lock also participated in the read-then-write snapshot consistency `findQuestionStateSnapshot` relied on, and removing it without a compensating design change would have reopened parent/child race and error-classification issues similar to [BUG-267](../bugs/bug-267-nested-repeatable-read-silently-drops-isolation.md)'s historical torn-read class of problem. The shipped fix uses the compensating single joined snapshot design rather than a bare lock delete.

The client conflict disambiguation shipped in the same change. `ApplicationError` now supports structured details, `ActionResult.error.details` surfaces those details, and active exam draft-save recovery branches on an allowlisted machine-readable reason instead of message strings or bare `CONFLICT`.

## Design

Chosen shape (2026-07-03): use the single joined active/ownership design, not a per-row lock and not a reasoned keep. The parent `practice_sessions FOR UPDATE` lock is removed from the normal state-write path. Each retry attempt reads the parent session row and the target `practice_session_question_states` row in one statement snapshot, then applies the existing row-version CAS update with the `exists (... practice_sessions.ended_at is null)` predicate. On CAS exhaustion, the final diagnostic read uses the same joined snapshot shape to preserve the existing error-classification contract.

Invariants the session-wide lock currently provides, and the replacement:

1. **Serializes all state writers for a session.** Today, every `recordQuestionAnswer`, `saveDraftAnswer`, `finalizeDraftAnswer`, and `setQuestionMarkedForReview` call locks the parent session row before it touches a question-state row, so two writes to different questions in the same session wait behind each other. That serialization is not an essential domain invariant; it contradicts Track A's normalized row model. Replacement: independent question rows are allowed to update independently. Same-row writers still coordinate through the `version` predicate, and the top-level `REPEATABLE READ` transaction wrapper still retries real serialization failures for finalize/submit flows.
2. **Gives the missing-row classifier one consistent parent/state snapshot.** The lock prevented the parent session from changing while `findQuestionStateSnapshot` separately read the state row. Replacement: the classifier performs a single joined read of the parent session plus target state row. If the session is missing, it remains `NOT_FOUND`; if the target state row is missing but `params_json.questionIds` owns the question, it remains `INTERNAL_ERROR` and still outranks ended-session `CONFLICT`; if the missing question is not session-owned, ended-session `CONFLICT` still outranks the not-part-of-session `NOT_FOUND` within that statement snapshot.
3. **Pairs the "seen active" read with the write.** The lock made the later write happen while the parent row could not be ended by another transaction. Replacement: no separate lock is needed because the CAS `UPDATE` already includes `exists (select 1 from practice_sessions where id = practice_session_question_states.practice_session_id and user_id = input.userId and ended_at is null)`. That predicate is evaluated atomically with the child-row update. If the session ended or disappeared before the write statement can update, the attempt becomes stale/missed and the retry/final diagnostic path classifies the current state.

   Accepted residual, corrected 2026-07-06 by [DEBT-437](./debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md): the `exists (... ended_at is null)` predicate is statement-level serialization, not session-end serialization. Under READ COMMITTED, a session-end transaction that commits after the updater statement's snapshot but before the updater commits will not conflict with a draft/mark write that already passed the predicate, so a stale draft/mark can land milliseconds after end-of-session. The same window also admits a graded tutor submit racing standalone `end()`: submit writes `attempts` + the question-state row, standalone `end()` writes only the parent session row, and the zero-overlap write set means Postgres raises no `40001` on either side. Exam finalize remains protected by its parent-row end write, but tutor submit vs. standalone `end()` can persist `attempts.answered_at > practice_sessions.ended_at`; DEBT-437's owner ruling (2026-07-09) resolved this as **Accepted — no code change** after a full read-path audit found no persistent score/grade misrendering; END-WINS (`end()` touching state rows) is the pre-decided hardening if a strict timestamp invariant is ever required.

Client contract bundled with the lock redesign:

- `ApplicationError` gains structured details, surfaced through `ActionResult.error.details`. Message-string matching is forbidden for this path.
- Server conflicts that mean "server-side exam expiry / session ended" carry a machine-readable reason distinct from transient row-state concurrency. Draft-save expiry recovery may run only for the expiry/session-ended reasons.
- The transient row-state reason (`Practice session state changed concurrently; please retry.`) must surface as retryable UI/error state and must not call `recoverServerExpiredExam()` or auto-finalize the exam.
- The idempotency-cache semantics were intentionally left unchanged by the DEBT-426 redesign itself because the active exam draft-save path is not idempotency-wrapped. The later [DEBT-435](./debt-435-practice-session-conflict-and-test-hygiene-follow-ups.md) tail sweep resolved the cached-transient-conflict follow-up for finalize, mark-for-review, and session answer submission by making the transient state-write reason non-cacheable at the idempotency adapter seam.

## Verification

- `tests/integration/practice-session-state-lock-granularity.integration.test.ts` holds a `FOR UPDATE` lock on the parent `practice_sessions` row from a second Postgres connection, then proves a draft save to a different question's state row completes within the probe window. The same file also exercises concurrent same-row writes and accepts only successful updates or controlled `ApplicationError('CONFLICT', 'Practice session state changed concurrently; please retry.')`, never raw driver failures.
- `src/adapters/repositories/practice-session-question-state-updater-lock.test.ts` now asserts the updater reads parent session + target state in one joined snapshot and throws if the old parent-row `FOR UPDATE` path is reintroduced.
- `src/adapters/repositories/drizzle-practice-session-repository-question-state-missing-row.test.ts` and the existing question-state tests preserve the missing normalized state classification ordering: session-owned missing state remains `INTERNAL_ERROR`, including for ended sessions; ended-session `CONFLICT` still applies when the missing question is not session-owned.
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.browser.spec.tsx`, `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.browser.spec.tsx`, and `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model-timer.browser.spec.tsx` prove transient state-write conflicts do not trigger expiry recovery or exam finalization, while explicit `exam_time_expired` conflicts still do.
- Final local verification on 2026-07-03: `pnpm typecheck`, `pnpm lint`, `pnpm test --run` (362 files / 3068 tests), `pnpm test:browser` (57 files / 317 tests), `pnpm test:integration` (23 passed + 1 skipped files / 146 passed + 2 skipped tests), `pnpm build`, and `pnpm test:e2e` (35 passed + 1 flaky retry, exit 0).

## Related

- PR #537, [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md)
- `src/adapters/repositories/practice-session-question-state-updater.ts`
- `src/adapters/repositories/practice-session-question-state-updater-lock.test.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
- commit `cf2cdf21`
