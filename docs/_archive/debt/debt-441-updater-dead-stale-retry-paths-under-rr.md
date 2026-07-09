# DEBT-441: The Question-State Updater's Inner Retry and Final Re-Read Are Dead Code in the REPEATABLE READ Paths — and Would Misreport If Ever Reached

**Status:** Resolved
**Priority:** P4
**Date:** 2026-07-05
**Resolved:** 2026-07-06

---

## Description

`updatePracticeSessionQuestionState` ([`practice-session-question-state-updater.ts`](../../../src/adapters/repositories/practice-session-question-state-updater.ts)) contains a 3-attempt CAS loop with a `'stale'` branch and a post-exhaustion final-snapshot re-read that classifies the failure (`AlreadyEnded` vs `StateChangedConcurrently`). Before this debt was resolved, these paths had **different liveness per calling context** that the code did not express:

- **Transaction-bound REPEATABLE READ paths** (submit, finalize — via `runPracticeSessionStateWriteTransaction`): the snapshot read and the CAS UPDATE share one RR snapshot, so a 0-row CAS result is impossible — any concurrent committed write raises `40001` instead, which propagates to the composition-root retry (fresh transaction, fresh snapshot, correct classification). Here the inner `'stale'` branch and the final re-read are **dead code**. Worse, if the final re-read *were* ever reached tx-bound, it would be wrong: drizzle nests via SAVEPOINT and postgres-js ignores isolation config on nested `transaction()`, so the re-read inherits the stale outer snapshot — a concurrently-ended session would still show `endedAt = null` and the code would misreport `AlreadyEnded` as `StateChangedConcurrently`.
- **Standalone READ COMMITTED paths** (exam draft save via `SaveExamDraftAnswerUseCase`, mark-for-review): each attempt is a fresh top-level transaction; EvalPlanQual re-evaluation produces genuine 0-row `'stale'` results; the loop and final re-read are live and **correct** here.

Nothing in the updater's signature or comments records this split, and the existing tests that cover standalone stale-version retries do not make the transaction-context distinction visible at the production entry point. A future maintainer reading the retry loop will reasonably assume it provides in-transaction retry semantics for the RR paths (it does not), or refactor the standalone paths onto the runner (silently killing the live branch), or "simplify" the final re-read into the RR flow (activating the misclassification described above).

## Impact

No current defect — every live path behaves correctly today. The debt is comprehension risk on the arc's most safety-critical file: dead code that looks load-bearing, live code whose correctness depends on which caller invokes it, and a latent misclassification armed for whoever reroutes the paths. Exactly the kind of "module whose behavior you cannot infer from its interface" that invites a regression during the next refactor.

## Resolution

Resolved 2026-07-06 by choosing the minimum documented-split path. `updatePracticeSessionQuestionState` now records the per-context contract directly above the retry loop:

- standalone callers open fresh top-level READ COMMITTED transactions for each attempt, so the loop can observe a newer row version on retry;
- repositories bound to a composition-root REPEATABLE READ transaction inherit the outer snapshot, so serialization failures there are owned by `runPracticeSessionStateWriteTransaction`.

No behavior changed. A structural split remains possible later if this updater grows again, but the immediate risk was the undocumented failure-domain split.

## Verification

- The retry-loop comment landed in `src/adapters/repositories/practice-session-question-state-updater.ts`.
- Existing standalone READ COMMITTED stale-version retry/exhaustion coverage in `drizzle-practice-session-repository-question-state.test.ts` remains the owner of the live retry behavior.

## Related

- Archived DEBT-426 (lock redesign that created the two calling contexts) and BUG-268 (the `40001` composition-root retry that owns RR-path retries).
- [DEBT-437](./debt-437-tutor-submit-vs-end-write-skew-and-debt-426-residual-wording.md) — adjacent semantics-accuracy item on the same surface; resolved as Accepted, no code change (owner ruling 2026-07-09).
- Found during the 2026-07-05 post-Track-A adversarial database-seam review (isolation lens, including postgres-js/drizzle nested-transaction semantics verification against `e3853656`).
