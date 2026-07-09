# DEBT-454: Undocumented Per-Context Seam Contracts and Mechanism Forks — `end()` Dead/Live Recovery Split, Convention-Only Lock Preconditions, Forked DB Retry Loop

**Status:** Active
**Priority:** P4
**Date:** 2026-07-09

---

## Description

Three adapter/composition-root seams each carry a load-bearing per-context contract or a deliberate mechanism divergence that exists only in the heads of the people who shipped it — no comment, no shared helper, no enforcement. Every live path behaves correctly today; the debt is that each seam is one plausible refactor away from silently losing the property it depends on. This is the same defect class DEBT-441 resolved for `practice-session-question-state-updater.ts` (per-context contract comment), applied to three sibling surfaces that got nothing.

### 1. `end()` 0-row recovery branch: undocumented dead/live split with latent CONFLICT→INTERNAL_ERROR misclassification

[`DrizzlePracticeSessionRepository.end()`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569) (lines 569–611) runs in two calling contexts with opposite liveness for its 0-row recovery branch (lines 593–607), and neither `end()` nor [`inRepeatableRead`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L157) (157–163) documents the split:

- **Standalone** ([`EndPracticeSessionUseCase`](../../src/application/use-cases/end-practice-session.ts#L38), autocommit READ COMMITTED): the guarded UPDATE (`isNull(endedAt)`) can genuinely return 0 rows after a concurrent committed end, and the recovery re-read at [line 594](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L594) (`findByIdAndUserId` → fresh top-level REPEATABLE READ transaction) correctly classifies CONFLICT. **Live and correct.**
- **Tx-bound** ([`FinalizeExamAnswersUseCase` calls `tx.sessions.end(...)`](../../src/application/use-cases/finalize-exam-answers.ts#L278) inside the composition-root RR transaction from [`use-cases.ts`](../../lib/container/use-cases.ts#L91)): a concurrent committed end raises 40001 at the UPDATE instead, so the branch is **dead code**. If it were ever reached, `findByIdAndUserId` → `inRepeatableRead` → `this.db.transaction(...)` on the outer tx nests via SAVEPOINT with the isolation config silently ignored (BUG-267's verified drizzle/postgres-js analysis), inherits the stale outer snapshot, still sees `endedAt = null`, and falls through to [`INTERNAL_ERROR 'Failed to end practice session'`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L604) instead of `CONFLICT 'already ended'`.

The armed scenario (no current defect): a maintainer reading the recovery branch as generic in-transaction retry semantics either (a) reroutes standalone `end()` through the RR write-transaction runner, silently killing the live standalone CONFLICT classification, or (b) copies the recovery re-read into a tx-bound flow where it can execute — there the user's second end/finalize attempt surfaces as a 500-class INTERNAL_ERROR with no CONFLICT status at all, bypassing the exam clients' CONFLICT-driven recovery UX shipped in DEBT-438 (whose client handling routes absent/unknown reasons to a generic fail-safe — the harm is losing the CONFLICT status entirely, not merely a missing reason string). DEBT-441 fixed exactly this undocumented split one file over ([contract comment now at `practice-session-question-state-updater.ts:128-131`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L128)); `end()` got nothing.

### 2. Advisory/row `lock()` tx-bound precondition enforced only by convention, plus divergent advisory-lock hash idioms

`DrizzleDeletedClerkUserRepository.lock()` ([`pg_advisory_xact_lock`](../../src/adapters/repositories/drizzle-deleted-clerk-user-repository.ts#L13)) and `DrizzleClerkEventRepository.lock()` ([`SELECT … FOR UPDATE`](../../src/adapters/repositories/drizzle-clerk-event-repository.ts#L50)) provide mutual exclusion only inside a transaction. The port interfaces do state this ("IMPORTANT: This must be called inside a transaction." — [`deleted-clerk-user-repository.ts:5`](../../src/application/ports/deleted-clerk-user-repository.ts#L5), [`clerk-event-repository.ts:20`](../../src/application/ports/clerk-event-repository.ts#L20)) — the verifier corrected the original finding here: the port layer is *not* undocumented. But nothing enforces it: the container factories default both repos to the base autocommit db ([`repositories.ts:32-35`](../../lib/container/repositories.ts#L32)), so a future non-tx construction type-checks and yields a `lock()` that runs and silently does nothing (`pg_advisory_xact_lock` acquires and releases at statement end on autocommit), quietly reopening the `user.updated`-vs-`user.deleted` tombstone-resurrection race that BUG-209 closed. Today the sole production caller ([`app/api/webhooks/clerk/route.ts:42`](../../app/api/webhooks/clerk/route.ts#L42)) is correctly tx-bound, so no reachable defect exists.

Separately, the repo's only two advisory-lock sites use divergent idioms — [`hashtextextended(id, 0)`](../../src/adapters/repositories/drizzle-deleted-clerk-user-repository.ts#L13) (64-bit) vs [`hashtext(userId)`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L82) (32-bit) — with no shared helper, no adapter-side comment, and no keyspace note. A copier gets an arbitrary idiom and no guidance. Cross-entity hash collision between the two keyspaces can only cause spurious contention, never lost exclusion, so both halves are comprehension/hygiene debt only.

### 3. Composition-root DB write-retry loop forks the shared `retry()` mechanism

[`runPracticeSessionStateWriteTransaction`](../../lib/container/use-cases.ts#L79) (lines 79–109, the BUG-268 fix guarding submit/finalize/draft-save) hand-rolls exponential backoff with its own constants ([`use-cases.ts:44-46`](../../lib/container/use-cases.ts#L44): 3 attempts / 25ms base / 250ms cap), its own [jitter formula](../../lib/container/use-cases.ts#L63) (63–73), and a local `sleep()` (75–77), while [`src/adapters/shared/retry.ts`](../../src/adapters/shared/retry.ts#L20) already provides a tested `retry()` with `shouldRetry`/`onRetry`/`maxDelayMs` and [`retry-defaults.ts`](../../src/adapters/shared/retry-defaults.ts#L8) holds `DEFAULT_RETRY_OPTIONS` (3/100ms/x2/1000ms). The fork is partially motivated — `retry()` computes delays deterministically ([`retry.ts:112`](../../src/adapters/shared/retry.ts#L112)) and cannot express jitter, which is desirable under serialization-failure contention — but nothing in code or docs records that rationale. Consequences:

- The DB-retry knobs are invisible to anyone tuning `retry-defaults.ts`.
- The loop has no `onRetry`/log hook ([`use-cases.ts:100-102`](../../lib/container/use-cases.ts#L100)), so 40001/40P01 retries on the app's hottest write path are silent, while [`stripe-retry.ts:47-48`](../../src/adapters/gateways/stripe/stripe-retry.ts#L47) `logger.warn`s every attempt.
- Two backoff implementations must now be kept semantically in sync by hand; a maintainer "consolidating" onto `retry()` as-is silently drops jitter, with no test pinning jitter presence.

The verifier explicitly excluded [`UPDATE_QUESTION_STATE_MAX_RETRIES`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L12) from this finding: it is an intentionally immediate-retry, backoff-free CAS loop already ruled correct and documented via DEBT-441 — context, not part of the defect.

## Impact

Today: zero wrong behavior on any live path — all three parts are documentation/mechanism-hygiene debt, hence P4. What each part contributes:

1. **`end()` split** — a refactor that reroutes or copies the recovery branch turns a concurrent double-end/finalize into a 500-class INTERNAL_ERROR instead of CONFLICT, silently defeating the DEBT-438 exam-client recovery UX. The failure is quiet (only a concurrency race exposes it) and would pass typecheck and most tests.
2. **Lock preconditions** — a future non-webhook consumer constructing either Clerk repo without a `dbOverride` gets a lock that no-ops silently; the port doc comment is the only defense. The idiom divergence means the next advisory-lock addition propagates an arbitrary choice or invents a third variant.
3. **Retry fork** — during a contention incident, tuning `retry-defaults.ts` has zero effect on submit/finalize, and elevated 40001/40P01 retry churn is invisible in logs until attempts exhaust and surface as user-facing CONFLICT. Exhausted retries do surface as `ApplicationError` CONFLICT with `cause` preserved — the cost is change amplification plus lost retry observability, not wrong behavior.

## Proposed Resolution

**Part 1 — `end()` recovery branch:**
- **Option A (recommended, matches the DEBT-441 precedent exactly):** add a per-context contract comment above the 0-row recovery branch in `end()` (and a one-line note on `inRepeatableRead` that nested calls on a tx-bound `this.db` become SAVEPOINTs inheriting the outer snapshot with isolation config ignored), stating: standalone READ COMMITTED callers can genuinely hit 0 rows and the fresh-top-level re-read correctly classifies CONFLICT; tx-bound RR callers raise 40001 instead and are owned by `runPracticeSessionStateWriteTransaction`, so this branch is dead there and MUST NOT be relied on tx-bound. Docs-only, no behavior change.
- Option B: make the recovery re-read context-safe by detecting a tx-bound `this.db` and rethrowing a retryable/serialization-shaped error instead of re-reading (behavioral change; overkill for a dead branch).
- Option C: structurally split standalone vs tx-bound end paths (largest change; only worthwhile if `end()` grows again, per DEBT-441's own resolution reasoning).

**Part 2 — lock preconditions and idiom divergence:**
- **Option A (recommended):** extract a single shared advisory-lock helper in `src/adapters/shared/` (e.g. `acquireXactLock(db, namespaceSeed, id)` standardizing on `hashtextextended` with a per-entity seed acting as the keyspace registry), use it at both `drizzle-deleted-clerk-user-repository.ts:13` and `drizzle-subscription-repository.ts:82`, and add a one-line adapter-side comment at each `lock()` implementation mirroring the port's tx-bound precondition.
- Option B: enforce the precondition structurally — make the clerk-event and deleted-clerk-user factory signatures require an explicit tx (no `primitives.db` default), or brand the transaction `DrizzleDb` type so a base-db construction fails to type-check.
- Option C (minimal): comments only — document the canonical idiom (`hashtextextended`) and the tx requirement at both adapter sites and accept the existing divergence; lowest cost, leaves the silent-no-op trap defended by convention alone.

**Part 3 — retry fork:**
- **Option 1 (recommended):** extend `src/adapters/shared/retry.ts` with an optional jitter seam (e.g. `jitter: 'full' | 'none'` or a `computeDelayMs` override), migrate `runPracticeSessionStateWriteTransaction` onto `retry()` with `shouldRetry = isRetryablePracticeSessionStateWriteFailure` and `onRetry` → structured `logger.warn` (attempt, pg code), and hoist the DB-serialization knob set into `retry-defaults.ts` (e.g. `DB_SERIALIZATION_RETRY_OPTIONS = 3/25ms/x2/250ms`) beside `DEFAULT_RETRY_OPTIONS` so all retry tuning lives in one file.
- Option 2 (minimum): keep the local loop but add a per-retry structured warn log and a comment above the constants cross-referencing `retry.ts` that records why it forked (jitter + fresh-transaction-per-attempt semantics), making the divergence intentional and discoverable.
- Either way, leave the updater's CAS `UPDATE_QUESTION_STATE_MAX_RETRIES` immediate-retry loop alone — it is a different, deliberately backoff-free optimistic-concurrency pattern already documented via DEBT-441.

## Verification

1. **Part 1:** contract comment present above `end()`'s 0-row branch and on `inRepeatableRead`; existing standalone-CONFLICT and tx-bound-40001 behavior unchanged (`pnpm test --run` on the practice-session repository/finalize suites passes with no assertion changes). If Option B/C chosen instead: a test proving a tx-bound concurrent-end surfaces as CONFLICT (not INTERNAL_ERROR).
2. **Part 2:** both advisory-lock call sites route through the shared helper (grep proves no raw `pg_advisory_xact_lock` outside `src/adapters/shared/`); adapter-side tx-precondition comments present; if Option B, a type-level test (or `@ts-expect-error` pin) proving base-db construction of the tx-locked repos fails to compile. Clerk webhook integration behavior unchanged.
3. **Part 3:** if Option 1, `lib/container-practice-session-state-transactions.test.ts` extended to pin (a) jitter presence in computed delays, (b) an `onRetry` `logger.warn` per 40001/40P01 attempt, and (c) knobs sourced from `retry-defaults.ts`; if Option 2, a test pinning the per-retry warn log plus the cross-reference comment in review.

## Related

- [DEBT-441 (archived)](../_archive/debt/debt-441-updater-dead-stale-retry-paths-under-rr.md) — the precedent: per-context dead/live retry contract documented for the question-state updater; its resolution is scoped solely to that file and does not cover `end()`.
- [BUG-267 (archived)](../_archive/bugs/bug-267-nested-repeatable-read-silently-drops-isolation.md) — verified that nested `PostgresJsTransaction.transaction()` never receives/applies an isolation config; fixed by opening the outer tx at RR, leaving caller discipline as a documented residual hazard.
- [BUG-268 (archived)](../_archive/bugs/bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) — introduced `runPracticeSessionStateWriteTransaction`; its archive records no reuse-vs-fork decision.
- [BUG-209 (archived)](../_archive/bugs/bug-209-clerk-webhook-lacks-idempotency.md) — the tombstone-resurrection race the Clerk lock seam closes; records the lock mechanism as fix narrative, files no ruling on the enforcement gap.
- [DEBT-438 (archived)](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) — the exam clients' CONFLICT-driven recovery UX that Part 1's latent misclassification would bypass; [DEBT-435 (archived)](../_archive/debt/debt-435-practice-session-conflict-and-test-hygiene-follow-ups.md) hardened the retry-loop test with a non-retryable negative path.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
