# BUG-345: The Database Timeouts Do Not Apply Through Neon's Pooler

**Status:** Verifying — production's pooled SHOW reports 30s, 5s and 60s after promotion; due 2026-10-20
**Priority:** P3
**Date:** 2026-10-16

---

## Summary

DEBT-447 added three intended application-session bounds: 30 seconds per statement, 5 seconds per lock acquisition, and 60 seconds idle inside a transaction. The application sends them as connection startup parameters. On 2026-10-16, production and Neon dev both reported `0`, `0` and `5min` through their pooled URLs, using `SHOW` inside read-only transactions. The settings did not take effect. Migration 0052 now installs those bounds as database-scoped defaults for the connecting role. The status is effective on merge; production remains unverified until promotion and backend renewal.

*Corrected 2026-10-16: independently repeated the dev-only check; narrowed the mechanism and impact claims; corrected migration scope, backend refresh and transaction-wrapper tradeoffs.*

*Corrected 2026-10-17: stated the dated production and dev observations directly and clarified direct-connection startup overrides for migration bounds.*

## Evidence

### Code and Dated Database Observations

- `lib/db-connection-options.ts:4-9` defines the three bounds beside `TimeZone: 'UTC'`. `lib/db.ts:19-22` passes them to postgres.js as `connection` options. Installed postgres.js 3.4.9 serializes `options.connection` into its startup packet (`src/connection.js`, `StartupMessage`).
- The Neon dev check on 2026-10-16 read the pooled URL from `.env.local` and checked its Neon/pooler hostname shape without printing it. It supplied `DATABASE_URL` explicitly and set the matching `DB_TARGET_ACK` through the repository's target helper.
- The client used the unchanged `POSTGRES_CONNECTION_PARAMETERS`, `max: 1`, and `fetch_types: false` to suppress the driver's automatic type-discovery query. Inside `sql.begin("read only", ...)`, it issued only these statements:

  ```sql
  SHOW transaction_read_only;
  SHOW statement_timeout;
  SHOW lock_timeout;
  SHOW idle_in_transaction_session_timeout;
  SHOW TimeZone;
  ```

  | Setting | Requested at startup | Effective in the read-only transaction |
  | --- | --- | --- |
  | `transaction_read_only` | Via `begin("read only")` | `on` |
  | `statement_timeout` | `30s` | `0` |
  | `lock_timeout` | `5s` | `0` |
  | `idle_in_transaction_session_timeout` | `60s` | `5min` |
  | `TimeZone` | `UTC` | `GMT` |

  No table read, `SET`, sleep, held lock, or timeout-triggering workload ran on dev. `SHOW` proves the effective settings for this transaction; it does not prove cancellation behavior under load or coverage of every pooled backend. GMT and UTC both have zero offset here.
- Neon documents transaction-mode pooling. PgBouncer distinguishes tracked startup parameters from ignored or rejected ones; it does not universally drop every startup parameter. The receipt proves that **these application options did not establish their intended values on this pooled path**. The exact deployed pooler configuration was not inspected. ([Neon pooling](https://neon.com/docs/connect/connection-pooling), [PgBouncer startup parameters](https://www.pgbouncer.org/config.html#ignore_startup_parameters))
- Production, read 2026-10-16 through its pooled URL with `SHOW` inside a read-only transaction: `0`, `0`, `5min`, `GMT`. Neon dev, the same day and method: the same values, as shown above.

### The Missing Boundary and Its New Proof

`tests/integration/db-connection-session.integration.test.ts:17-24,125-161` proves SQLSTATE `57014`, `55P03` and `25P03` against the resolver's direct local Postgres, which accepts these startup settings. Its reference to a fresh pooled connection means the postgres.js client pool, not a PgBouncer deployment. No transaction-pooler transport participates in those original tests.

`tests/integration/db-pooler-timeouts.integration.test.ts` now exercises a digest-pinned PgBouncer in transaction mode, locally and in CI. It ignores the three timeout startup parameters, reproducing the observed Neon failure without claiming to reproduce its entire configuration. The test uses the application's real `POSTGRES_CONNECTION_PARAMETERS`. Before the migration, its effective-value assertion failed with `0`, `0`, `0`; local Postgres has no five-minute idle default. After migration 0052:

- A disposable ordinary role (`NOSUPERUSER NOCREATEDB NOCREATEROLE`) runs the actual managed Drizzle migration entry point successfully. Its database-scoped defaults must exactly match `POSTGRES_CONNECTION_PARAMETERS`, so editing either copy alone fails the test.
- Three concurrently occupied fresh backends receive `30s`, `5s`, `1min`, even without client startup options. A backend held open before migration retains `0`, `0`, `0`.
- Server-side fixture defaults scaled to 100ms produce `57014` for a standalone statement, `55P03` for a transaction lock wait and wire-level `25P03` for an idle transaction. postgres.js reports that last disconnect as `CONNECTION_CLOSED`; the next query succeeds. Savepoint rollback removes a temporary `SET LOCAL` override and restores the server default.
- A trigger on the disposable migration ledger captures `30s`, `5s`, `1min` inside the installed Drizzle Kit client's actual migration transaction. A held ledger lock makes the unchanged managed runner fail with wire-level `55P03` at the five-second bound. This proves more than reading settings on a separate client.

All eight checks passed on 2026-10-17, including a local rehearsal of CI's separately started Postgres container attached to the pooler network. Hosted CI remains a post-push check. Changing only the application statement bound to 31 seconds made the migration/config drift assertion fail; restoring it passed. The local test alone issues PgBouncer `RECONNECT`/`WAIT_CLOSE`, scoped to its disposable database. No migration, lock workload or pool-admin action ran against Neon. `docs/architecture/integrations/postgres.md` now describes server defaults, process coverage and rollout instead of treating startup options as a pooled guarantee.

## Impact

- Statements and lock acquisitions on the tested path have no bound from `statement_timeout` or `lock_timeout`. They can still end through completion, lock release, cancellation, another error or infrastructure termination; they do not necessarily wait until a function's `maxDuration`.
- An idle transaction is governed by the observed five-minute idle timeout, rather than the intended minute. This is an inactivity bound, not a limit on total transaction duration. Earlier disconnect/termination can also release its locks.
- DEBT-447 left backend cancellation after platform termination unverified. Postgres still detects deadlocks independently of these two disabled timeouts. ([PostgreSQL timeout semantics](https://www.postgresql.org/docs/current/runtime-config-client.html), [deadlock detection](https://www.postgresql.org/docs/current/runtime-config-locks.html))
- Existing subscription/provisioning locks and DEBT-502's proposed serialization therefore lack the intended timeout backstop on this path. Lock scopes vary; being keyed by user does not prove safe total connection demand. No production outage is established by this check.

## Options

1. **Role defaults, scoped to the application database where appropriate.** A repository-managed `ALTER ROLE … IN DATABASE … SET` can make the settings defaults on backend login. PostgreSQL permits ordinary roles to change their own defaults for user-settable parameters. This addresses DEBT-447's objection to unverified manual settings only if rollout and effective pooled values are also verified. Defaults do not update existing backend sessions; reconnecting an application client through a pooler need not create a new backend. Plan and verify pool refresh without assuming one successful `SHOW` covers the pool. ([PostgreSQL ALTER ROLE](https://www.postgresql.org/docs/current/sql-alterrole.html))
   - **Migration coupling is real.** `vercel.json:8` runs the managed migration between ledger checks before building. `scripts/internal/run-managed-db-migrate.ts:6-12` invokes Drizzle Kit using the explicit target; `scripts/database-process.ts:8-11` passes it as `DATABASE_URL`; `drizzle.config.ts:5-20` supplies that same URL. No separate migration-role/URL contract exists.
   - Installed Drizzle Kit 0.31.11 resolves the postgres.js driver here (`pg` is absent) and creates its own client with `{ max: 1 }`, without importing `lib/db.ts` or its connection options. Thus an application startup fix alone does not cover migrations, while role defaults would affect subsequent migration sessions using that role.
   - All three defaults matter for migrations, not only the five-second lock bound. A direct URL using the same role inherits its defaults **unless the connection overrides them**. On an unpooled connection, startup options such as `options=-c lock_timeout=…` apply and override role defaults. This can give migrations their own bounds without changing roles. Another option is a separately configured migration role. Either approach must reach the actual migration connection; a `SET` on a different connection is ineffective. The managed-session proof above resolves DEBT-447's parked migration-lock decision. DEBT-445's shared Preview/deployment contract still applies. ([PostgreSQL startup options](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNECT-OPTIONS), [setting parameters](https://www.postgresql.org/docs/current/config-setting.html))
2. **`SET LOCAL` before work in each explicit transaction.** It lasts for that transaction and fits transaction pooling; it does not cover standalone queries or establish session defaults. Rollback to a savepoint preceding the setting undoes it. ([PostgreSQL SET](https://www.postgresql.org/docs/current/sql-set.html))
   - There is no single transaction wrapper to patch. Callers include `lib/container/controllers.ts:36`, `lib/container/use-cases.ts:121`, `app/api/webhooks/clerk/route.ts:43`, the reconcile route and checkout-success dependency builder. Repositories also start transactions, including `drizzle-subscription-repository.ts:112` and `drizzle-practice-session-repository.ts:218`; some nest inside an existing transaction as savepoints. Inventory outer transactions, nesting and unwrapped reads before claiming application-wide coverage.
   - It adds setup work to each covered transaction and must precede the first protected statement/lock. Neither this option nor server defaults bound waiting for a client/backend connection, or the total duration of a busy multi-statement transaction.
3. **Database defaults.** These apply to new sessions for the database across roles, unless a more specific role/session setting overrides them. Their scope is broader than option 1; the database owner or a superuser can change them. They share the backend-refresh and migration questions. A separate migration role alone does not avoid the database defaults unless its settings override them. ([PostgreSQL ALTER DATABASE](https://www.postgresql.org/docs/current/sql-alterdatabase.html))

## Resolution

**Decided 2026-10-17:** option 1, under the owner's adoption of DEBT-524's option 2 and steps 1–8. Migration `0052_bug345_role_timeouts.sql` uses a `DO` block and `format()` with `%I`/`%L` to set the current role's defaults in the current database. This covers standalone reads and every transaction path without adding wrappers or a second migration URL.

**Migration bounds:** accept 30-second statements, five-second lock waits and 60 seconds idle in a transaction. Failing a migration promptly is preferable to queueing requests behind its lock request. The actual managed-session proof resolves the DEBT-447 Waiting row; it does not claim the already-open session applying 0052 changes settings. The settings take effect at new backend login.

**Process inventory:** the Postgres operations guide records runtime requests/webhooks/crons, the Vercel and human migration entry points, pre/post ledger checks, direct and managed seeds, content-release/withdrawal scripts, feedback export and Studio/manual clients. None has a demonstrated need for a higher bound. Per-statement limits do not cap a whole active multi-statement job. Future exceptions require a proved need and a bounded `SET LOCAL` in that operation's own transaction, never a higher global default.

**Rollout:** use the normal Preview build and promotion; every pushed PR head migrates the shared Preview database (DEBT-445). Do not manually migrate a Neon branch. Existing pooled backends must renew before the defaults apply. The operations guide defines repeated, concurrent production `SHOW` checks inside read-only transactions, and the conditional owner step if Neon-side recycling is required. No such production action is delegated. A code rollback does not reset role defaults; a necessary reset needs a reviewed follow-up migration and fresh-backend verification.

**Deadline:** October 20 is provisional, approved by the owner on 2026-10-17. The promotion change must update both status lines to the actual promotion date plus three days. Keep the record open until production's pooled samples show all three intended values.

## Verification

- [x] Production's pooled settings read on 2026-10-16 with `SHOW` inside a read-only transaction: `0`, `0`, `5min`; `TimeZone` `GMT`.
- [x] Neon dev's pooled settings read twice on 2026-10-16, the second time by the challenger, through the `.env.local` pooled URL inside `sql.begin("read only")`: read-only `on` and the same values. Only `SHOW` statements ran.
- [x] On 2026-10-17, option 1's migration tradeoff checked against PostgreSQL's startup-option documentation.
- [x] On 2026-10-17, the pooled effective-value test failed before migration 0052 and passed afterward. The extended suite proves all three SQLSTATEs on disposable local targets; no Neon migration or load test ran.
- [x] Server defaults cover standalone queries and transactions independently of wrappers. Tests prove standalone cancellation, transaction locking/idle termination, savepoint rollback, old backend retention and three concurrent fresh backends. The ordinary role applies the migration and the drift assertion checks every timeout value.
- [x] The actual managed Drizzle Kit transaction records all three bounds; its blocked migration fails with `55P03`. Accept the five-second lock limit and remove DEBT-447's now-proved Waiting item.
- [x] A second agent challenged the updated mechanism, process inventory, managed-client proof and rollout on 2026-10-17; no substantiated correction to this record.
- [ ] Set the final due date in the promotion change, then record backend renewal and repeated concurrent pooled samples.
- [ ] After promotion, the authorized production check reports the intended 30s, 5s and 60s through the pooled path, with rollout evidence for preexisting backend sessions.

## Related

- DEBT-447: application bounds, accepted pool policy and the migration-bound work proved here.
- DEBT-445: the single-URL build/migration contract and deployment compatibility.
- DEBT-524: the structural assessment and deployment-fidelity gap.
- DEBT-502 item 2: proposed provisioning serialization.
