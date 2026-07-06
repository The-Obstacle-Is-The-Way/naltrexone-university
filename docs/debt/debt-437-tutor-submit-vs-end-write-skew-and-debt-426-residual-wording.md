# DEBT-437: Tutor Graded Submit vs Standalone `end()` Write-Skew Is Broader Than the Archived DEBT-426 Residual Claims

**Status:** Open
**Priority:** P3
**Date:** 2026-07-05

---

## Description

The archived DEBT-426 doc records its accepted residual as: a session-end committing between the updater's snapshot and commit can let "a cosmetic stale draft/mark … land milliseconds after end-of-session **without affecting grading or final answers**," on the rationale that "terminal grading/finalization is protected by the end-session transaction paths."

That rationale is wrong for one specific pair, independently confirmed by two review lenses (isolation and derived-data) during the 2026-07-05 seam review:

- **Tutor answer submission is a graded write that rides the same window.** `SubmitAnswerUseCase` runs in a REPEATABLE READ transaction writing an `attempts` row plus a `latest_*` state-row update through the same updater/`exists (... ended_at is null)` predicate ([`practice-session-question-state-updater.ts`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L159-L165)), both evaluated against the transaction snapshot.
- **Standalone `end()` writes only the parent row.** [`drizzle-practice-session-repository.ts`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L463-L504) is an autocommit read-then-guarded-UPDATE on `practice_sessions` that never touches state rows or attempts.

The two transactions have **zero overlapping row writes**, so REPEATABLE READ raises no `40001` on either side: both commit. Result — a graded attempt row and `latestSelectedChoiceId`/`latestIsCorrect` land in a session whose `ended_at` predates them. (Exam finalize is *not* exposed: it writes the parent row itself, forcing one side onto the retryable `40001` path — that part of the DEBT-426 rationale is correct. Only the tutor submit-vs-standalone-end pair lacks an overlapping write.)

Concrete anomaly: two tabs on a tutor session; a submit for question 10 is in flight when "End session" commits in the other tab. The end-time summary says 9/10 answered; after reload the summary/review say 10/10; `attempts.answered_at > practice_sessions.ended_at` persists in the data. The final state is serializable-equivalent (as if the submit committed first), so this is an anomaly, not corruption — but the invariant "no graded mutation after `ended_at`" is violated, and the archived doc's acceptance rationale ("without affecting grading") does not cover it.

## Impact

1. **Register accuracy:** the archived DEBT-426 acceptance rationale overstates the protection; anyone consulting it to reason about the lock redesign inherits a false claim about grading safety.
2. **Behavioral:** transient summary drift across the end boundary and a persistent `answered_at > ended_at` timestamp inversion — user-visible only in the two-tab race, no scoring corruption (the late answer is correctly graded, just post-end).

## Resolution

1. **Correct the archived doc now (cheap, mandatory):** amend the DEBT-426 residual paragraph to state that the window also admits a *graded tutor submit* against a concurrent standalone `end()` (no overlapping write → no serialization failure), scoped precisely as above, with a pointer to this debt item.
2. **Decide the hardening (optional, deliberate):** if the invariant is to be enforced, the cheapest sound options are (a) `end()` also touching the session's state rows (any no-op update creates the write-write overlap that forces `40001` on the submit side), or (b) the submit transaction taking `SELECT ... FOR SHARE` on the parent row (blocks `end()`'s UPDATE until the submit commits). Both partially re-serialize what DEBT-426 deliberately de-serialized — weigh against the lock-granularity goals before choosing. Accepting the anomaly with accurate documentation is a legitimate outcome.

## Verification

- The amended archived DEBT-426 doc names the tutor-submit-vs-end pair explicitly and no longer claims grading is unaffected.
- If hardening is chosen: a red-first integration test where a tutor submit's transaction spans a concurrent `end()` commit must fail closed (`AlreadyEnded` CONFLICT), not commit a post-end graded attempt.

## Related

- Archived: [`debt-426-session-wide-lock-defeats-row-concurrency.md`](../_archive/debt/debt-426-session-wide-lock-defeats-row-concurrency.md) (the residual paragraph this corrects).
- [BUG-278](../bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) — same-review finding on the adjacent discard path.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review; the write-skew extension was independently derived by two of five review lenses and verified line-level against `e3853656`.
