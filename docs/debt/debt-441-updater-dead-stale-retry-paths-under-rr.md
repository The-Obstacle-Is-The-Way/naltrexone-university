# DEBT-441: The Question-State Updater's Inner Retry and Final Re-Read Are Dead Code in the REPEATABLE READ Paths — and Would Misreport If Ever Reached

**Status:** Open
**Priority:** P4
**Date:** 2026-07-05

---

## Description

`updatePracticeSessionQuestionState` ([`practice-session-question-state-updater.ts`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L118-L190)) contains a 3-attempt CAS loop with a `'stale'` branch and a post-exhaustion final-snapshot re-read that classifies the failure (`AlreadyEnded` vs `StateChangedConcurrently`). These paths have **different liveness per calling context**, which the code does not express:

- **Transaction-bound REPEATABLE READ paths** (submit, finalize — via `runPracticeSessionStateWriteTransaction`): the snapshot read and the CAS UPDATE share one RR snapshot, so a 0-row CAS result is impossible — any concurrent committed write raises `40001` instead, which propagates to the composition-root retry (fresh transaction, fresh snapshot, correct classification). Here the inner `'stale'` branch and the final re-read are **dead code**. Worse, if the final re-read *were* ever reached tx-bound, it would be wrong: drizzle nests via SAVEPOINT and postgres-js ignores isolation config on nested `transaction()`, so the re-read inherits the stale outer snapshot — a concurrently-ended session would still show `endedAt = null` and the code would misreport `AlreadyEnded` as `StateChangedConcurrently`.
- **Standalone READ COMMITTED paths** (exam draft save via `SaveExamDraftAnswerUseCase`, mark-for-review): each attempt is a fresh top-level transaction; EvalPlanQual re-evaluation produces genuine 0-row `'stale'` results; the loop and final re-read are live and **correct** here.

Nothing in the updater's signature, comments, or tests records this split. A future maintainer reading the retry loop will reasonably assume it provides in-transaction retry semantics for the RR paths (it does not), or refactor the standalone paths onto the runner (silently killing the live branch), or "simplify" the final re-read into the RR flow (activating the misclassification described above).

## Impact

No current defect — every live path behaves correctly today. The debt is comprehension risk on the arc's most safety-critical file: dead code that looks load-bearing, live code whose correctness depends on which caller invokes it, and a latent misclassification armed for whoever reroutes the paths. Exactly the kind of "module whose behavior you cannot infer from its interface" that invites a regression during the next refactor.

## Resolution

Pick one, deliberately:

1. **Document the split in place (minimum):** a block comment on the loop + final re-read stating the per-context liveness (RR tx-bound: dead, `40001` path owns retries; standalone RC: live via EvalPlanQual) and the savepoint-snapshot caveat that makes the re-read unsafe to reach tx-bound.
2. **Make the split structural (better):** split the entry points — a tx-bound variant with no inner loop (single CAS, let `40001`/0-rows-impossible semantics stand) and a standalone variant that owns the retry loop and final classification. Tests then pin each variant's semantics separately.

Either way, add a test that pins the standalone-path `'stale'` retry behavior (currently untested distinct from the RR path) so the live branch can't be silently removed.

## Verification

- Comment or split lands with a test exercising the standalone READ COMMITTED `'stale'` retry (fake or integration).
- If split: the tx-bound variant contains no retry loop; grep confirms the RR callers use it.

## Related

- Archived DEBT-426 (lock redesign that created the two calling contexts) and BUG-268 (the `40001` composition-root retry that owns RR-path retries).
- [DEBT-437](./debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — adjacent semantics-accuracy item on the same surface.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (isolation lens, including postgres-js/drizzle nested-transaction semantics verification against `e3853656`).
