# DEBT-454: Undocumented Per-Context Seam Contracts and Mechanism Forks — `end()` Dead/Live Recovery Split, Convention-Only Lock Preconditions, Forked DB Retry Loop

**Status:** Active
**Priority:** P4
**Date:** 2026-07-09

---

## Description

Three adapter/composition-root seams carry a load-bearing per-context contract or deliberate mechanism divergence that is only partially documented. The transaction requirement for repository `lock()` methods exists at the ports, but is neither enforced by types/factories nor repeated at the implementations; the `end()` recovery split and DB-retry fork have no equivalent contract comment. Current paths behave correctly with respect to these three findings. The risk is that a plausible refactor removes a property whose ownership is not visible at the edited seam. This is the same comprehension class DEBT-441 resolved for `practice-session-question-state-updater.ts` with a per-context contract comment.

### 1. `end()` 0-row recovery branch: undocumented dead/live split with latent CONFLICT→INTERNAL_ERROR misclassification

[`DrizzlePracticeSessionRepository.end()`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L569) runs in two calling contexts with opposite liveness for its 0-row recovery branch ([lines 593-607](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L593)), and neither `end()` nor [`inRepeatableRead`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L157) documents the split:

- **Standalone** ([`EndPracticeSessionUseCase`](../../src/application/use-cases/end-practice-session.ts#L38), autocommit READ COMMITTED): the guarded UPDATE (`isNull(endedAt)`) can genuinely return 0 rows after a concurrent committed end, and the recovery re-read at [line 594](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L594) (`findByIdAndUserId` → fresh top-level REPEATABLE READ transaction) correctly classifies CONFLICT. **Live and correct.**
- **Tx-bound** ([`FinalizeExamAnswersUseCase` calls `tx.sessions.end(...)`](../../src/application/use-cases/finalize-exam-answers.ts#L278) inside the composition-root RR transaction from [`use-cases.ts`](../../lib/container/use-cases.ts#L117)): a concurrent committed end raises `40001` at the UPDATE instead, so the branch is dead for the current finalize flow. If a future tx-bound path made a 0-row result reachable, `findByIdAndUserId` would call `inRepeatableRead` on an existing `PostgresJsTransaction`; installed drizzle-orm 0.45.2 implements that nested call as `client.savepoint(callback)` and accepts no isolation config, so the re-read inherits the outer snapshot. It could still see `endedAt = null` and fall through to [`INTERNAL_ERROR 'Failed to end practice session'`](../../src/adapters/repositories/drizzle-practice-session-repository.ts#L604) instead of the standalone branch's ended-session CONFLICT.

The armed scenario is a future reroute/copy, not a current defect. Moving standalone `end()` under the RR runner would change the live zero-row classification into transaction-level `40001` ownership; copying the re-read into another tx-bound flow could activate the stale-snapshot misclassification. Losing the CONFLICT code would bypass the reason-aware recovery work shipped under DEBT-438; absent/unknown **reasons** still fail safe, but `INTERNAL_ERROR` is a different status entirely. DEBT-441 documents the corresponding split one file over ([practice-session-question-state-updater.ts#L128-L135](../../src/adapters/repositories/practice-session-question-state-updater.ts#L128)). BUG-293 concerns a different `end()` seam — its two standalone pre-reads can observe different autocommit snapshots — and its proposed read-only RR wrapper does not move the later UPDATE under the composition-root runner.

### 2. Four row/advisory lock methods rely on tx-bound construction; the two advisory sites use different hash idioms

Four repository methods provide exclusion only while their database handle is inside a surrounding transaction:

- [`DrizzleDeletedClerkUserRepository.lock`](../../src/adapters/repositories/drizzle-deleted-clerk-user-repository.ts#L11) uses `pg_advisory_xact_lock`.
- [`DrizzleClerkEventRepository.lock`](../../src/adapters/repositories/drizzle-clerk-event-repository.ts#L40), [`DrizzleStripeEventRepository.lock`](../../src/adapters/repositories/drizzle-stripe-event-repository.ts#L40), and [`DrizzleUserRepository.lockByClerkId`](../../src/adapters/repositories/drizzle-user-repository.ts#L56) use `SELECT ... FOR UPDATE`.

All four port contracts state that the lock must be called inside a transaction ([deleted-Clerk-user port](../../src/application/ports/deleted-clerk-user-repository.ts#L1), [Clerk-event port](../../src/application/ports/clerk-event-repository.ts#L17), [Stripe-event port](../../src/application/ports/stripe-event-repository.ts#L17), [user port](../../src/application/ports/user-repository.ts#L19)). The gap is enforcement and implementation-local visibility: all four factories accept an omitted `dbOverride` and then construct the repository over `primitives.db` ([repositories.ts#L28-L35](../../lib/container/repositories.ts#L28), [lines 58-63](../../lib/container/repositories.ts#L58)). In autocommit, the transaction-level advisory lock or row lock is released when that one statement's implicit transaction ends, before subsequent read/write statements can use the exclusion.

Current production callers are correctly bound. The Clerk route constructs Clerk-event, deleted-user, and user repositories from the callback's `tx` ([app/api/webhooks/clerk/route.ts#L41-L51](../../app/api/webhooks/clerk/route.ts#L41)); Stripe webhook dependencies construct the Stripe-event repository from their transaction callback ([lib/container/controllers.ts#L24-L31](../../lib/container/controllers.ts#L24)). The controller then calls the locks only inside those callbacks. Thus no reachable misuse was found, but a future caller can compile a base-db lock that has no cross-statement effect.

Repository-wide grep finds exactly two advisory-lock call sites, both transaction-scoped and passed through the single-`bigint` lock overload: deleted-Clerk-user locking hashes an external Clerk ID with [`hashtextextended(clerkUserId, 0)`](../../src/adapters/repositories/drizzle-deleted-clerk-user-repository.ts#L13), while subscription upsert hashes the internal user UUID text with [`hashtext(userId)`](../../src/adapters/repositories/drizzle-subscription-repository.ts#L82) (its 32-bit result is widened for the one-argument lock call). The subscription repository self-opens its transaction, and both Stripe writer paths reach that same repository/key, so there is no billing-writer lock divergence. The two unrelated lock domains lack a shared naming/keyspace note; a rare cross-domain numeric collision can cause spurious blocking, not lost exclusion.

### 3. Composition-root DB write-retry loop forks the shared `retry()` mechanism

[`runPracticeSessionStateWriteTransaction`](../../lib/container/use-cases.ts#L79), introduced by BUG-268, is wired only around `FinalizeExamAnswersUseCase` ([lines 117-132](../../lib/container/use-cases.ts#L117)) and **session-backed** `SubmitAnswerUseCase` ([lines 263-276](../../lib/container/use-cases.ts#L263)). Draft save and mark-for-review use the updater's standalone READ COMMITTED/CAS retry path; discard owns a separate RR transaction (BUG-292); standalone end is autocommit (BUG-293). The original `submit/finalize/draft-save` scope claim was false.

The runner hand-rolls exponential backoff with private constants ([use-cases.ts#L41-L50](../../lib/container/use-cases.ts#L41): 3 attempts / 25ms base / 250ms cap), base-plus-uniform jitter ([lines 63-73](../../lib/container/use-cases.ts#L63)), and local sleep. Only attempts 0 and 1 sleep under the current three-attempt loop, producing integer delays of 25-49 ms and 50-99 ms; the 250 ms cap is not reached. This is not “full jitter” in `[0, cappedDelay)`. [`src/adapters/shared/retry.ts`](../../src/adapters/shared/retry.ts#L69) already supplies bounded deterministic exponential retry with `shouldRetry`, `onRetry`, a delay cap, and injectable sleep; [`retry-defaults.ts`](../../src/adapters/shared/retry-defaults.ts#L8) holds the external-call defaults (3/100ms/x2/1000ms). The DB loop also has distinct exhaustion semantics: it maps exhausted `40001`/`40P01` failures to `practiceSessionStateChangedConcurrentlyError({ cause })`, whereas generic `retry()` rethrows the last error. A separate DB policy is therefore legitimate, but its jitter/fresh-transaction/exhaustion rationale is not documented at the implementation.

Consequences:

- The DB-retry knobs are invisible to anyone tuning `retry-defaults.ts`.
- The loop has no retry-observation hook ([use-cases.ts#L95-L103](../../lib/container/use-cases.ts#L95)), so `40001`/`40P01` retries on these two transaction-bound workflows are silent, while Stripe retry logs each attempt ([stripe-retry.ts#L43-L59](../../src/adapters/gateways/stripe/stripe-retry.ts#L43)).
- The existing test named "waits with jittered backoff" forces `Math.random()` to `0` and proves only the 25ms base delay ([container-practice-session-state-transactions.test.ts#L196-L227](../../lib/container-practice-session-state-transactions.test.ts#L196)); removing the random term would still pass it. A maintainer consolidating onto `retry()` as-is could therefore drop jitter without a red test.

The verifier explicitly excluded [`UPDATE_QUESTION_STATE_MAX_RETRIES`](../../src/adapters/repositories/practice-session-question-state-updater.ts#L12) from this finding: it is an intentionally immediate-retry, backoff-free CAS loop already ruled correct and documented via DEBT-441 — context, not part of the defect.

## Impact

Today: zero wrong behavior on any live path — all three parts are documentation/mechanism-hygiene debt, hence P4. What each part contributes:

1. **`end()` split** — a refactor that reroutes or copies the recovery branch turns a concurrent double-end/finalize into a 500-class INTERNAL_ERROR instead of CONFLICT, silently defeating the DEBT-438 exam-client recovery UX. The failure is quiet (only a concurrency race exposes it) and would pass typecheck and most tests.
2. **Lock preconditions** — a future caller can construct any of four locking repositories without a tx override; the port comments are the only defense. The hash idiom difference is naming/keyspace comprehension debt, not a proven correctness problem.
3. **Retry fork** — tuning external-call `DEFAULT_RETRY_OPTIONS` correctly has no effect on the separate DB policy, but that separation is not explained. Elevated `40001`/`40P01` retry churn is invisible until exhaustion surfaces as typed CONFLICT with cause preserved. Cost: change comprehension, an unpinned jitter property, and missing retry observability — not current wrong behavior.

## Proposed Resolution

**Part 1 — `end()` recovery branch:**
- **Option A (recommended, matches the DEBT-441 precedent exactly):** add a per-context contract comment above the 0-row recovery branch in `end()` (and a one-line note on `inRepeatableRead` that nested calls on a tx-bound `this.db` become SAVEPOINTs inheriting the outer snapshot with isolation config ignored), stating: standalone READ COMMITTED callers can genuinely hit 0 rows and the fresh-top-level re-read correctly classifies CONFLICT; tx-bound RR callers raise 40001 instead and are owned by `runPracticeSessionStateWriteTransaction`, so this branch is dead there and MUST NOT be relied on tx-bound. Docs-only, no behavior change.
- Option B: make the recovery re-read context-safe by detecting a tx-bound `this.db` and rethrowing a retryable/serialization-shaped error instead of re-reading (behavioral change; overkill for a dead branch).
- Option C: structurally split standalone vs tx-bound end paths (largest change; only worthwhile if `end()` grows again, per DEBT-441's own resolution reasoning).

**Part 2 — lock preconditions and idiom divergence:**
- **Option A (recommended, smallest honest step):** add implementation-local tx-precondition comments to all four lock methods and split/rename factory APIs so event/tombstone lock-capable repositories require an explicit transaction handle. For `UserRepository`, whose non-lock methods legitimately use the base DB, prefer interface segregation or a transaction-scoped locker factory rather than making every user read transactional. Add tests that production webhook dependency factories pass the callback tx.
- Keep the two advisory hash algorithms explicitly documented unless there is a concrete cross-domain keyspace requirement. They protect unrelated identities and both subscription writers already share one key.
- If the algorithms are ever standardized, use an expand/contract lock transition: mixed deployed versions using old and new hashes would otherwise stop contending for the same logical resource. Acquire old and new keys in one deterministic order during the compatibility deploy, then remove the old key only after old instances are gone. A one-commit switch to `hashtextextended` is not safe under rolling deployment.
- Option B (minimal): comments/tests only. This leaves type-level misuse possible but makes the contract visible where a maintainer edits it.

**Part 3 — retry fork:**
- **Option 1 (recommended, minimum):** keep the local DB loop, document why it is separate (fresh top-level RR transaction per attempt, base-plus-uniform jitter, PostgreSQL-code allowlist, and typed exhaustion mapping), and add a safe retry-observation hook or metric carrying only attempt/max/code/delay. Add a nonzero-RNG test so removing jitter fails. Keep DB policy constants local or give them a clearly DB-specific exported object; they should not inherit external-service defaults accidentally.
- Option 2 (larger refactor): extend `retry()` with an injected delay-computation/RNG seam, then wrap the **whole** `primitives.db.transaction` call and preserve the runner's typed exhaustion mapping outside the generic helper. Pin the exact delay distribution and fresh-transaction count before restructuring. Do not add a generic `jitter: true` flag without deterministic test injection.
- Either way, leave the updater's CAS `UPDATE_QUESTION_STATE_MAX_RETRIES` immediate-retry loop alone — it is a different, deliberately backoff-free optimistic-concurrency pattern already documented via DEBT-441.

## Verification

1. **Part 1:** contract comment present above `end()`'s 0-row branch and on `inRepeatableRead`; existing standalone-CONFLICT and tx-bound-40001 behavior unchanged (`pnpm test --run` on the practice-session repository/finalize suites passes with no assertion changes). If Option B/C chosen instead: a test proving a tx-bound concurrent-end surfaces as CONFLICT (not INTERNAL_ERROR).
2. **Part 2:** all four implementation methods state the tx requirement; lock-capable event/tombstone factories cannot default to the base DB (or a type-level test pins the chosen structural boundary); webhook wiring tests prove callback-tx construction. If hash migration is chosen, a compatibility test proves old/new deployments still contend during the dual-lock phase.
3. **Part 3:** a composition-root source scan or structural test pins the runner to finalize and session-backed submit; a nonzero deterministic RNG test pins the 25-49 ms / 50-99 ms base-plus-uniform ranges; retry observation is asserted for both `40001` and `40P01`; exhausted retries still map to typed CONFLICT with cause, and non-retryable errors still run once.

## Related

- [DEBT-441 (archived)](../_archive/debt/debt-441-updater-dead-stale-retry-paths-under-rr.md) — the precedent: per-context dead/live retry contract documented for the question-state updater; its resolution is scoped solely to that file and does not cover `end()`.
- [BUG-267 (archived)](../_archive/bugs/bug-267-nested-repeatable-read-silently-drops-isolation.md) — verified that nested `PostgresJsTransaction.transaction()` never receives/applies an isolation config; fixed by opening the outer tx at RR, leaving caller discipline as a documented residual hazard.
- [BUG-268 (archived)](../_archive/bugs/bug-268-cas-retry-loop-ignores-repeatable-read-serialization-failure.md) — introduced `runPracticeSessionStateWriteTransaction`; its archive records no reuse-vs-fork decision.
- [BUG-209 (archived)](../_archive/bugs/bug-209-clerk-webhook-lacks-idempotency.md) — the tombstone-resurrection race the Clerk lock seam closes; records the lock mechanism as fix narrative, files no ruling on the enforcement gap.
- [DEBT-438 (archived)](../_archive/debt/debt-438-conflict-reason-client-coverage-gaps.md) — the exam clients' CONFLICT-driven recovery UX that Part 1's latent misclassification would bypass; [DEBT-435 (archived)](../_archive/debt/debt-435-practice-session-conflict-and-test-hygiene-follow-ups.md) hardened the retry-loop test with a non-retryable negative path.
- [BUG-292](../bugs/bug-292-discard-unowned-serialization-failure-internal-error.md) and [BUG-293](../bugs/bug-293-end-split-prereads-phantom-corruption-error.md) — current source of truth for the repository-owned discard RR transaction and standalone-end autocommit pre-read seam; neither path runs through this composition-root retry helper.
- [PostgreSQL advisory-lock functions](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS) and [explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS) — transaction-level advisory and row locks are released at transaction end; a one-statement autocommit call cannot protect later statements.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
