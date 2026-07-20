# DEBT-447: DB Connection/Session Policy Is Repo-Unspecified — Three Timeouts Unset, Runtime Pooler Host Unenforced, Vendor Doc Recommends Banned `push`

**Status:** Open
**Priority:** P3
**Date:** 2026-07-09
**Re-verified accurate against `ddad8eee` on 2026-07-18.**

---

## Direction (2026-07-20 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1a. Application session bounds | **FIX (Option 1, minimal form)** | Add `statement_timeout: '30s'`, `lock_timeout: '5s'`, and `idle_in_transaction_session_timeout: '60s'` beside UTC in `POSTGRES_CONNECTION_PARAMETERS`; pin values and prove SQLSTATE `57014`, `55P03`, and `25P03` respectively in resolver-scoped disposable Postgres. | Option 3's repo-unspecified/dashboard-owned acceptance and any migration-runner rewrite bundled into the runtime fix. | (a) Reuses the existing startup-parameter object with no new layer; (b) all three bounds are repo-proven absent and disabled is reachable regardless of unverified role settings; (c) Blast radius: one application statement, lock wait, or abandoned transaction can outlive the user-visible budget and hold scarce DB resources. Fix cost: three conservative settings plus focused tests; (d) one policy object and real semantic verification; (e) does not move deploy drift or target ownership. |
| 1b. Migration-session lock bound | **PARK** | Do not claim the application startup settings cover Drizzle Kit. Revive when a resolver-scoped proof demonstrates a supported setting reaches the actual `db:migrate` transaction, or when a Preview/Production migration records a lock wait of at least 30 seconds; then prefer the proven startup/session mechanism over a custom migration runner. | Option 2's unproven custom/alternate migration runner today and a `SET` on a different connection. | (a) Avoids rewriting the deploy seam; (b) migration lock waiting is possible but no incident or proven Drizzle Kit mechanism is recorded; (c) Blast radius: a schema-bearing deploy can remain blocked and queue conflicting work. Cure cost: replacing or wrapping the migration runner without connection-level proof is scarier; (d) refuses a placebo setting; (e) keeps deploy-path changes under DEBT-445 rather than creating an adjacent unverified owner. |
| 2a. Explicit pool size | **FIX (Option 1, minimal form)** | Set postgres.js `max: 10` explicitly with the existing SPEC-029 rationale and a regression test; do not reopen capacity sizing. | A new capacity model, adaptive pool, or provider telemetry project before preserving the already-decided value. | (a) Converts a driver default into local source truth; (b) the value is deliberate and current but implicit; (c) Blast radius: an upstream default change silently alters per-instance connection demand. Fix cost: one option and test; (d) documentation/code now agree; (e) no new target classifier. |
| 2b. Pooler-host enforcement | **ACCEPT (Option 3)** | Document that runtime Neon URLs should be pooled, the same `DATABASE_URL` currently serves runtime and migration, and provider values remain owner-verifiable; add no fail-closed or warn-level classifier now. | Option 2's split URL contract and pre-migrate fail-closed hostname gate; a duplicate target classifier beside DEBT-446. | (a) Adds no second URL policy mechanism; (b) the misconfiguration is conditional and no connection-exhaustion incident/current provider mismatch is measured; (c) Blast radius: a provider-side swap to a direct endpoint could exhaust backend connections as instances multiply. Cure cost: splitting runtime/migration secrets and gating deploys before migration can create a broader outage than the unmeasured risk; (d) accurate source-linked documentation is sufficient for the accepted state; (e) DEBT-446 remains the sole generic target classifier. Accepted failure: a dashboard operator can point runtime `DATABASE_URL` at a direct Neon host and the repository will not block deployment before connection pressure appears. |
| 3. Vendor page drift | **FIX (Option 2, pointers-to-source form)** | Replace copied connection/config snippets with pointers to `lib/db.ts`, `lib/db-connection-options.ts`, `package.json`, and the migration runbooks; retain only operational rationale, the actual single-URL state, and an explicit never-`push` warning. | Option 1's refreshed copied implementation sample, a proposed `DIRECT_URL` contract, and any affirmative `drizzle-kit push` instruction. | (a) Deletes duplicate implementation facts; (b) the page currently recommends a banned command and is already version/config stale; (c) Blast radius: an operator can bypass checked-in migration history. Fix cost: a short source-linked page; (d) removes wrong docs and duplicate sources of truth; (e) target consent remains owned by DEBT-446 and deploy verification by DEBT-445. |

Application sessions get conservative database-side bounds through the existing connection parameter seam, but those settings must not be misrepresented as migration-session coverage. The migration lock mechanism stays parked until it is proven on Drizzle Kit's actual connection; pooler enforcement is explicitly accepted rather than duplicated beside DEBT-446. The vendor page becomes a durable pointer map, while DEBT-445 remains the build-path drift owner.

## Description

The production database seam — [`lib/db.ts`](../../lib/db.ts#L15), its environment plumbing, and its designated reference [`docs/vendor-docs/postgres.md`](../../docs/vendor-docs/postgres.md) — leaves three operational policies implicit. The repository does not configure database-side statement/lock/idle-transaction timeouts; the application pool size remains an accepted driver default while the pooled-host requirement is prose-only; and the vendor doc recommends a schema command the repository bans. These are latent configuration/documentation risks, not evidence of a current production incident.

### 1. The repo sets `TimeZone` and driver `idle_timeout`, but not `statement_timeout`, `lock_timeout`, or `idle_in_transaction_session_timeout`

The application singleton at [`lib/db.ts:15-20`](../../lib/db.ts#L15) sets postgres.js `idle_timeout: 20` and passes [`POSTGRES_CONNECTION_PARAMETERS`](../../lib/db-connection-options.ts#L1), whose only entry is `TimeZone: 'UTC'`. `idle_timeout` closes a postgres.js connection that is idle in the client pool; it is not PostgreSQL's `idle_in_transaction_session_timeout`. Neither the application connection options nor [`drizzle.config.ts:14-20`](../../drizzle.config.ts#L14) explicitly sets `statement_timeout`, `lock_timeout`, or `idle_in_transaction_session_timeout`, and [`docs/dev/migration-authoring.md`](../dev/migration-authoring.md) discusses lock scope without prescribing a migration lock-wait timeout.

PostgreSQL defaults each of those three server settings to zero (disabled): [`statement_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-STATEMENT-TIMEOUT) bounds a statement, [`lock_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT) bounds each lock acquisition, and [`idle_in_transaction_session_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-IDLE-IN-TRANSACTION-SESSION-TIMEOUT) terminates a session left idle inside an open transaction. postgres.js sends entries from its `connection` option as startup parameters (`node_modules/postgres/src/index.js:484-488`; `node_modules/postgres/src/connection.js:996-1005`), so the application can set all three at connection creation.

**Repository-verification boundary:** this proves only that the repository does not set the three values. The effective Neon values could still be changed outside git through database/role settings or connection-string startup options. The current Vercel `DATABASE_URL`, Neon role/database settings, and dashboard configuration are not committed and were not queried during this docs-only audit, so whether production currently inherits PostgreSQL's disabled defaults is **unverifiable from the repository**.

**Failure scenario, scoped to what is proven:** [`vercel.json:3`](../../vercel.json#L3) runs `pnpm db:migrate && pnpm build`. Migration 0027, for example, executes an [`ALTER TABLE ... DROP CONSTRAINT`](../../db/migrations/0027_early_wallow.sql#L47), and PostgreSQL ordinarily takes `ACCESS EXCLUSIVE` for `ALTER TABLE` subcommands unless documented otherwise ([PostgreSQL `ALTER TABLE`](https://www.postgresql.org/docs/current/sql-altertable.html)). A conflicting long transaction can therefore make the migration wait while later conflicting traffic queues behind its lock request. The UI's [`withTimeout`](../../lib/with-timeout.ts#L10) is only `Promise.race`; it does not call postgres.js query cancellation. It can return a 10–15 second client error ([timeout tiers](<../../app/(app)/app/shared/timeout-tiers.ts#L1>)) while the server invocation is still working. Vercel then terminates an invocation at its configured `maxDuration` ([Vercel duration semantics](https://vercel.com/docs/functions/configuring-functions/duration#consequences-of-changing-the-maximum-duration)); this means the document's original “unbounded warm-instance outage” claim was too strong. Neither repository code nor the cited Vercel documentation establishes whether invocation termination immediately cancels the PostgreSQL backend statement, so that post-termination detail is also **unverifiable from the repository**. The verified gap is the absence of a database-side bound and explicit cancellation policy, not a proven indefinite user outage.

SPEC-029/BS-017 correctly settled a different setting: postgres.js `connect_timeout` defaults to 30 seconds and was deliberately left unchanged ([SPEC-029:134-138](../_archive/specs/spec-029-dev-environment-resilience.md#L134), [BS-017:313-325](../_archive/brainstorming/bs-017-dev-environment-resilience.md#L313)). This item does not reopen that ruling.

### 2. `max = 10` was explicitly accepted but remains implicit; the application `-pooler` hostname is not enforced

Because [`lib/db.ts`](../../lib/db.ts#L17) omits `max`, the installed postgres.js source supplies `10` (`node_modules/postgres/src/index.js:447-453`), matching the driver's [documented default](https://github.com/porsager/postgres#the-connection-pool). The original candidate's claim that the value was “never deliberately sized” is false: SPEC-029 explicitly decided that the default 10 was appropriate for serverless ([line 138](../_archive/specs/spec-029-dev-environment-resilience.md#L138)), and BS-017 made the same ruling ([lines 292-296](../_archive/brainstorming/bs-017-dev-environment-resilience.md#L292)). The narrower residual is that the accepted value is implicit and the archived decision contains no instance-count/concurrency arithmetic or current Neon limit evidence.

The stronger live gap is endpoint enforcement. [`docs/vendor-docs/postgres.md:30-35`](../../docs/vendor-docs/postgres.md#L30) says application queries use a hostname whose endpoint ID ends in `-pooler`; Neon's current guide likewise recommends pooled strings for serverless/web applications and shows that suffix ([Neon connection pooling](https://neon.com/docs/connect/connection-pooling#how-to-use-connection-pooling)). But [`.env.example:8`](../../.env.example#L8) is only `postgresql://***`, [`lib/env.ts:38-40`](../../lib/env.ts#L38) validates only that `DATABASE_URL` is a URL, and no boot/test guard checks the host. The same variable also feeds migrations through [`drizzle.config.ts:9-20`](../../drizzle.config.ts#L9), so the repository does not encode separate pooled-runtime and direct-migration roles.

**Repository-verification boundary:** historical archived evidence says a non-production project connection used a pooler and observed `max_connections=112` ([DEBT-411:77-86](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md#L77)), but it does not prove today's Production/Preview values. The current Vercel hostname, Neon compute size, `max_connections`, PgBouncer pool size, instance concurrency, and traffic are **unverifiable from the repository**.

**Conditional failure scenario:** if a deployed app URL were changed to a direct Neon endpoint, eleven fully utilized default pools would request up to 110 direct connections. Neon's current example gives 104 `max_connections` for a 0.25 CU compute, where connection 105 fails with “remaining connection slots are reserved”; larger computes have different limits ([Neon pool-limit examples](https://neon.com/docs/connect/connection-pooling#understanding-connection-pool-limits)). This arithmetic demonstrates reachability for that example, not this project's current configuration. On the proper pooled endpoint, 10,000 is only the PgBouncer client-connection ceiling; active transactions still share a compute-sized backend pool and can queue. P3 is retained for the silent direct-endpoint misconfiguration path, not because the accepted value 10 is itself proven wrong.

Archived [DEBT-432](../_archive/debt/debt-432-postgres-js-prepared-statements-vs-neon-pooler-unconfirmed.md) invalidated only the prepared-statement concern for Drizzle's `.unsafe()` query path. Its residual note is about future raw postgres.js query use; it did **not** rule on pool size or hostname validation, and this document no longer attributes that broader invitation to it.

### 3. The vendor doc recommends banned `drizzle-kit push` and does not match the current connection seam (P4)

[`docs/vendor-docs/postgres.md:38-44`](../../docs/vendor-docs/postgres.md#L38) says exactly: “Use for `drizzle-kit push`, schema operations. No `-pooler` suffix.” That contradicts the current bans at [`CLAUDE.md:93`](../../CLAUDE.md#L93), [`AGENTS.md:470`](../../AGENTS.md#L470), [`migration-authoring.md:83-85`](../dev/migration-authoring.md#L83), and [`integration-tests.md:28`](../dev/integration-tests.md#L28). The vendor doc's “Our Setup” sample ([lines 15-24](../../docs/vendor-docs/postgres.md#L15)) also omits `idle_timeout: 20`, inlines the UTC setting instead of importing `POSTGRES_CONNECTION_PARAMETERS`, and lists `drizzle-orm ^0.45.1` although [`package.json:53`](../../package.json#L53) declares `^0.45.2`. Its direct-connection section presents `DIRECT_URL` as an instruction, while the environment table later says the project uses only `DATABASE_URL` and merely suggests considering `DIRECT_URL` ([line 69](../../docs/vendor-docs/postgres.md#L69); this is an unclear hypothetical/actual mix, not a literal contradiction).

**Failure scenario:** `drizzle-kit` is installed and `drizzle.config.ts` accepts the implicit `.env.local` fallback, so a developer can follow the vendor page and invoke `pnpm exec drizzle-kit push` even though no `db:push` package script exists. `push` bypasses this repository's checked-in migration files and ledger contract, including custom SQL that is not recoverable from a schema diff. A later `pnpm db:migrate` can then try to apply ledger-missing migrations against objects already changed by `push`. Default local E2E is now resolver-scoped Docker and would not inspect a separately mutated remote database; only an intentional existing-target preflight could report that target's missing ledger entries. The original claim that every subsequent E2E run would flag the remote drift was therefore false.

Archived [BUG-240](../_archive/bugs/bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) demonstrates the consequence of bypassing/not applying the checked-in migration journal, but its incident was caused by migrations not being run, **not** by `drizzle-kit push`. P4 remains appropriate: the contradiction is real, while the destructive path requires a user to follow this stale page over the auto-loaded repository instructions.

## Impact

- **Part 1 (P3):** no repository-level database timeout bounds a slow/lock-waiting application statement, migration statement, or idle transaction. Client and Vercel duration limits bound user/invocation wait, so no indefinite application outage is claimed. Effective live DB settings and backend cancellation on platform termination remain unverified.
- **Part 2 (P3):** `max=10` is an explicit historical decision, not an unaudited accident. The residual risk is a silent pooled-to-direct app URL swap plus undocumented capacity arithmetic; actual production configuration and headroom are unverified.
- **Part 3 (P4):** the dedicated vendor page can steer a developer toward a banned schema path and gives an inaccurate picture of `lib/db.ts`.

## Proposed Resolution

**Part 1:**
- **CHOSEN (Option 1, minimal form):** set
  `statement_timeout: '30s'`, `lock_timeout: '5s'`, and
  `idle_in_transaction_session_timeout: '60s'` in
  `POSTGRES_CONNECTION_PARAMETERS`. Thirty seconds matches the common explicit
  application/Vercel route budget, five seconds lets the lock-specific failure
  fire first, and sixty seconds allows ordinary transactional gaps while
  terminating an abandoned transaction. Document postgres.js recovery after the
  terminated session and verify SQLSTATE `57014` (statement), `55P03` (lock),
  and `25P03` (idle transaction).
- **PARKED (Option 2):** do not claim the application setting covers
  `pnpm db:migrate`, issue `SET` on a separate connection, or replace Drizzle
  Kit speculatively. Revive only when a resolver-scoped disposable proof shows
  a supported startup/session mechanism reaches Drizzle's actual migration
  transaction, or a deployed migration records a lock wait of at least 30
  seconds. The durable authoring guide should state the distinction now.
- **REJECTED BY DIRECTION REVIEW (Option 3):** unverified Neon dashboard/role
  settings do not substitute for a repo-owned application-session policy.

**Part 2:**
- **CHOSEN (Option 1, minimal form):** set `max: 10` explicitly in the
  postgres.js options, retain SPEC-029's existing serverless rationale, and pin
  it in a regression test. No new capacity-sizing or adaptive-pool project is
  authorized by this debt.
- **REJECTED BY DIRECTION REVIEW (Option 2):** do not split runtime/migration
  variables or add a fail-closed hostname preflight without a measured
  connection incident. Such a preflight would run before migration, duplicate
  DEBT-446's target policy, and could block every deploy on a documentation-level
  assumption.
- **ACCEPT (Option 3, documentation-only):** document the actual one-URL state,
  the intended pooled runtime endpoint, and provider-side ownership. Do not add
  a warn-only classifier that fails to close the risk. Accepted failure: a
  dashboard operator can point runtime `DATABASE_URL` at a direct Neon host and
  the repository will not block deployment before connection pressure appears.

**Part 3:**
- **REJECTED BY DIRECTION REVIEW (Option 1):** do not refresh a copied
  `lib/db.ts` sample or hand-maintained dependency versions; that leaves a
  second source to drift again.
- **CHOSEN (Option 2, pointers-to-source form):** rewrite
  `docs/vendor-docs/postgres.md` to point to `lib/db.ts`,
  `lib/db-connection-options.ts`, `package.json`, and the migration runbooks.
  Retain only operational rationale and checked-in commands, describe the actual
  single-`DATABASE_URL` state, and say explicitly never to use
  `drizzle-kit push`.

## Verification

- **Part 1a:** extend `lib/db-connection-options.test.ts` to pin all three
  values. In resolver-scoped disposable Postgres, prove an over-budget
  statement returns SQLSTATE `57014`, a held-lock wait returns `55P03` within
  the configured budget, and an idle transaction terminates with `25P03`; prove
  a fresh pooled connection remains usable afterward. Do not use a hardcoded
  port or remote database.
- **Part 1b:** no migration-runner implementation test is authorized while
  parked. Revival requires the actual `pnpm db:migrate` connection proof or
  recorded 30-second deploy lock wait named above.
- **Part 2a:** unit-test the explicit postgres.js `max: 10` option and retain the
  SPEC-029 rationale.
- **Part 2b:** documentation names the accepted one-URL/pooler risk and does not
  claim provider settings are repo-verified; no hostname classifier or deploy
  gate is added.
- **Part 3:** `docs/vendor-docs/postgres.md` contains no affirmative
  `drizzle-kit push` instruction, clearly labels the actual single-URL state,
  and points to current source files instead of copying implementation/version
  details. Run the docs link check.

## Related

- [SPEC-029 dev-environment resilience](../_archive/specs/spec-029-dev-environment-resilience.md) and [BS-017](../_archive/brainstorming/bs-017-dev-environment-resilience.md) — deliberately retained the 30-second connect timeout and the default pool size; they did not evaluate the three database-side timeouts or encode pooled-host validation.
- [DEBT-432 (archived)](../_archive/debt/debt-432-postgres-js-prepared-statements-vs-neon-pooler-unconfirmed.md) — invalidated only the prepared-statement claim for the Drizzle query path.
- [DEBT-411 (archived)](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md) — historical, non-production observation of a pooled endpoint and `max_connections=112`; not evidence of current production configuration.
- [BUG-240 (archived)](../_archive/bugs/bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) — migration journal/application incident; not caused by `drizzle-kit push`.
- [PostgreSQL client-connection defaults](https://www.postgresql.org/docs/current/runtime-config-client.html), [postgres.js pool documentation](https://github.com/porsager/postgres#the-connection-pool), [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), and [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration) — primary vendor references used by this audit.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12 finder lenses, per-candidate adversarial verification, dedup against the full archived register).
