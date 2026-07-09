# DEBT-437: Tutor Graded Submit vs Standalone `end()` Write-Skew Is Broader Than the Archived DEBT-426 Residual Claims

**Status:** Resolved — Accepted, no code change (owner ruling 2026-07-09)
**Priority:** P3
**Date:** 2026-07-05
**Resolved:** 2026-07-09

---

## Description

The archived DEBT-426 doc records its accepted residual as: a session-end committing between the updater's snapshot and commit can let "a cosmetic stale draft/mark … land milliseconds after end-of-session **without affecting grading or final answers**," on the rationale that "terminal grading/finalization is protected by the end-session transaction paths."

That rationale is wrong for one specific pair, independently confirmed by two review lenses (isolation and derived-data) during the 2026-07-05 seam review:

- **Tutor answer submission is a graded write that rides the same window.** `SubmitAnswerUseCase` runs in a REPEATABLE READ transaction writing an `attempts` row plus a `latest_*` state-row update through the same updater/`exists (... ended_at is null)` predicate ([`practice-session-question-state-updater.ts`](../../../src/adapters/repositories/practice-session-question-state-updater.ts#L152-L172)), both evaluated against the transaction snapshot. The submit transaction wiring is the composition-root practice-state write wrapper ([`lib/container/use-cases.ts`](../../../lib/container/use-cases.ts#L41-L50), [`lib/container/use-cases.ts`](../../../lib/container/use-cases.ts#L79-L108)), and the use case inserts the attempt before updating session state ([`submit-answer.ts`](../../../src/application/use-cases/submit-answer.ts#L222-L232)).
- **Standalone `end()` writes only the parent row.** [`drizzle-practice-session-repository.ts`](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569-L610) is an autocommit read/map-then-guarded-UPDATE on `practice_sessions` that never touches state rows or attempts. It also maps the returned domain session before the parent-row update, so the immediate end response can reflect the pre-race state even if the racing submit commits milliseconds later.

The two transactions have **zero overlapping row writes**, so REPEATABLE READ raises no `40001` on either side: both commit. Result — a graded attempt row and `latestSelectedChoiceId`/`latestIsCorrect` land in a session whose `ended_at` predates them. (Exam finalize is *not* exposed: it writes the parent row itself, forcing one side onto the retryable `40001` path — that part of the DEBT-426 rationale is correct. Only the tutor submit-vs-standalone-end pair lacks an overlapping write.)

Concrete anomaly: two tabs on a tutor session; a submit for question 10 is in flight when "End session" commits in the other tab. The end-time summary says 9/10 answered; after reload the summary/review say 10/10; `attempts.answered_at > practice_sessions.ended_at` persists in the data. The final state is serializable-equivalent (as if the submit committed first), so this is an anomaly, not corruption — but the invariant "no graded mutation after `ended_at`" is violated, and the archived doc's acceptance rationale ("without affecting grading") does not cover it.

## Decision Brief (2026-07-09)

Re-verified against current `origin/dev` / `origin/main` head `c8ea199d` before any code change. The anomaly remains live: submit and standalone `end()` still have zero overlapping writes, so Postgres has no write-write conflict to turn into a `40001`.

### Read-path evidence

| Surface | Current read path | Effect of `attempts.answered_at > practice_sessions.ended_at` |
| --- | --- | --- |
| Immediate end-session response | `end()` maps `existingSession` before it updates `ended_at` ([`drizzle-practice-session-repository.ts`](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569-L610)); summary projection counts normalized state ([`practice-session-summary.ts`](../../../src/application/use-cases/practice-session-summary.ts#L25-L54), [`session-stats.ts`](../../../src/domain/services/session-stats.ts#L12-L23)). | Transiently stale if the concurrent submit commits after `end()` mapped the session: the just-ended response can show the pre-submit count. This is the known visible drift. |
| Reloaded session summary | `GetPracticeSessionSummaryUseCase` reloads the session, requires `endedAt`, then projects from state rows ([`get-practice-session-summary.ts`](../../../src/application/use-cases/get-practice-session-summary.ts#L21-L33)). | Correctly counted after both commits. It does not compare `latestAnsweredAt` or `attempts.answeredAt` with `endedAt`. |
| Completed-session review / navigator | `GetPracticeSessionReviewUseCase` derives answered/correct/marked rows from normalized state and session mode ([`get-practice-session-review.ts`](../../../src/application/use-cases/get-practice-session-review.ts#L81-L173)). | Correctly counted. The late state update appears as the user's final answer. |
| Completed feedback review | `GetCompletedSessionQuestionsWithFeedbackUseCase` loads attempts by session, falls back to state only when an attempt is absent, then renders selected/correct state ([`get-completed-session-questions-with-feedback.ts`](../../../src/application/use-cases/get-completed-session-questions-with-feedback.ts#L94-L225); attempts are ordered by `answered_at` but not bounded by `ended_at` in [`drizzle-attempt-repository.ts`](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L245-L255)). | Correctly counted. The matching attempt is used; no stale key or timestamp misclassification found. |
| History - sessions tab | `findCompletedByUserId` selects ended sessions ordered by `ended_at` ([`drizzle-practice-session-repository.ts`](../../../src/adapters/repositories/drizzle-practice-session-repository.ts#L300-L364)); `GetSessionHistoryUseCase` computes answered/correct from state and duration from `startedAt`/`endedAt` ([`get-session-history.ts`](../../../src/application/use-cases/get-session-history.ts#L48-L105)); the UI displays those fields ([`history-sessions-tab.tsx`](<../../../app/(app)/app/history/components/history-sessions-tab.tsx#L176-L260>)). | Correctly counted. Duration ignores answer timestamps, so a late attempt cannot make duration negative or reorder the session. |
| History - questions tab | `GetAttemptedQuestionsUseCase` reads latest attempt rows ([`get-attempted-questions.ts`](../../../src/application/use-cases/get-attempted-questions.ts#L76-L134)); the repository filters out only active-exam attempts, not tutor attempts on ended sessions ([`drizzle-attempt-repository.ts`](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L59-L80), [`active-exam-visibility.ts`](../../../src/adapters/repositories/shared/active-exam-visibility.ts#L5-L31)); the UI shows result/source/attempt time ([`history-questions-tab.tsx`](<../../../app/(app)/app/history/components/history-questions-tab.tsx#L82-L107>)). | Correctly counted and visible as the latest attempt. The row can display an answer timestamp after the session's end timestamp, but the UI does not juxtapose those values in one row. |
| Dashboard stats, streaks, recent activity | `GetUserStatsUseCase` counts attempts and recent activity from the attempt repository ([`get-user-stats.ts`](../../../src/application/use-cases/get-user-stats.ts#L76-L149)); the repository's stats/recent queries use the same active-exam visibility predicate ([`drizzle-attempt-repository.ts`](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L317-L417)); the dashboard renders those values directly ([`dashboard/page.tsx`](<../../../app/(app)/app/dashboard/page.tsx#L59-L90>), [`dashboard/page.tsx`](<../../../app/(app)/app/dashboard/page.tsx#L186-L253>)). | Correctly counted as an attempted tutor answer. Streak and recent activity are based on `answered_at`, which matches the serializable-equivalent "submit first" interpretation. |
| Dashboard recent sessions | Dashboard calls `getSessionHistory({ limit: 3 })` ([`dashboard/page.tsx`](<../../../app/(app)/app/dashboard/page.tsx#L260-L273>)) and renders the same history-session fields ([`dashboard/page.tsx`](<../../../app/(app)/app/dashboard/page.tsx#L121-L183>)). | Same as history sessions: correctly counted after reload; no extra timestamp rule. |
| Export surfaces | `rg -n "CSV\|csv\|download\|Download\|export.*attempt\|attempt.*export\|session.*export\|export.*session" app src components docs/specs docs/dev` finds no user-facing attempt/session export; only question-feedback analytics docs mention CSV export. | No export reader found. |

**Finding:** no persistent reader was found that mis-scores, mis-grades, or misclassifies the final state. The only confirmed user-visible artifact is the already-known one-response summary drift when `end()` returns the pre-race mapped session, plus a persistent audit timestamp inversion (`answered_at > ended_at`). That makes **ACCEPT** a technically legitimate owner decision if product can tolerate the audit shape.

### Owner options

1. **ACCEPT with accurate docs (recommended unless strict timestamp invariants matter).** No code change. Keep this item open only long enough for owner sign-off, then archive as accepted. Cost/risk: preserves the rare two-tab summary drift and timestamp inversion. Benefit: avoids re-serializing hot practice-session paths that DEBT-426 deliberately split apart; all audited readers remain correctly counted.
2. **END-WINS hardening.** Make standalone `end()` transactionally touch the session's question-state rows before/with setting `ended_at`, creating a row overlap with submit's state update. If `end()` reaches the state row first, the submit's REPEATABLE READ transaction retries and then fails closed with `AlreadyEnded`; if the submit already updated the state row, `end()` waits and then records an end time after the answer. Cost/risk: wider write set on every end; careful TDD needed so `end()` still remains idempotent and does not resurrect the old session-wide hot lock on ordinary state writes.
3. **ANSWER-WINS hardening.** Make tutor submit take a parent-session `FOR SHARE` lock before inserting the attempt/updating state, so standalone `end()` waits behind any in-flight submit's parent-row share lock. Cost/risk: every tutor submit now coordinates on the parent row and directly reintroduces parent-row contention into the common answer path. It also needs careful review against the BUG-254 exam grace-window assumptions and the DEBT-426 conflict-disambiguation contract, even though exam finalize itself is not the exposed pair.

Recommendation: **ACCEPT** unless the owner requires the database invariant "no answered attempt timestamp after session `ended_at`" for audit/compliance reasons. If strictness is required, choose END-WINS over ANSWER-WINS because it keeps the common submit path free of parent-row locks and pushes the extra coordination to the less frequent end path.

### Owner ruling (2026-07-09)

**ACCEPT.** The owner ratified option 1 after reviewing the read-path evidence table above: no persistent reader mis-scores or misrenders the final state, the anomaly requires a two-tab millisecond race, and both hardenings would re-serialize hot practice-session paths that DEBT-426 deliberately split apart. No current consumer requires the strict "no answered attempt timestamp after session `ended_at`" invariant; if a future audit/compliance requirement introduces one, END-WINS is the pre-decided hardening direction for the reason stated in the recommendation.

## Impact

1. **Register accuracy:** the archived DEBT-426 acceptance rationale overstates the protection; anyone consulting it to reason about the lock redesign inherits a false claim about grading safety.
2. **Behavioral:** transient summary drift across the end boundary and a persistent `answered_at > ended_at` timestamp inversion — user-visible only in the two-tab race, no scoring corruption (the late answer is correctly graded, just post-end).

## Resolution

1. **Correct the archived doc now (cheap, mandatory):** shipped 2026-07-06. The archived DEBT-426 residual paragraph now states that the window also admits a *graded tutor submit* against a concurrent standalone `end()` (no overlapping write → no serialization failure), scoped precisely as above, with a pointer back to this debt item.
2. **Owner ruling (2026-07-09): ACCEPT — resolved with no production code change (DEBT-408 precedent).** The read-path audit above found no persistent score/grade misrendering, so the anomaly is accepted with accurate documentation. If a strict timestamp invariant is ever required, implement END-WINS with red-first concurrency coverage rather than changing this as a drive-by cleanup.

## Verification

- The amended archived DEBT-426 doc names the tutor-submit-vs-end pair explicitly and no longer claims grading is unaffected. Completed 2026-07-06.
- ACCEPT chosen (2026-07-09): this doc is archived as accepted with the read-path evidence table intact and no production code change.
- If hardening is ever revived: a red-first integration test where a tutor submit's transaction spans a concurrent `end()` commit must prove the chosen policy. END-WINS should never persist `attempts.answered_at > practice_sessions.ended_at`; ANSWER-WINS should prove `end()` waits until the in-flight submit is durably before the end timestamp.

## Related

- Archived: [`debt-426-session-wide-lock-defeats-row-concurrency.md`](./debt-426-session-wide-lock-defeats-row-concurrency.md) (the residual paragraph this corrects).
- [BUG-278](../bugs/bug-278-end-discard-idempotency-caches-transient-errors-under-fixed-key.md) — same-review finding on the adjacent discard path, resolved before this debt item.
- Re-verified and converted into an owner-rulable decision brief on 2026-07-09 against `c8ea199d`.
- Found during the 2026-07-05 post-Track-A adversarial database-seam review; the write-skew extension was independently derived by two of five review lenses and originally verified line-level against `e3853656`.
