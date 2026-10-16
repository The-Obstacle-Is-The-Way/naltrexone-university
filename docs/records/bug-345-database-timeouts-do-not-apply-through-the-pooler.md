# BUG-345: The Database Timeouts Do Not Apply Through Neon's Pooler

**Status:** Open — dev pooled SHOW confirms missing bounds; choose and prove the fix, including migration scope and existing pool sessions, then verify production
**Priority:** P3
**Date:** 2026-10-16

---

## Summary

DEBT-447 added three intended application-session bounds: 30 seconds per statement, 5 seconds per lock acquisition, and 60 seconds idle inside a transaction. The application sends them as connection startup parameters. They did not become effective on the Neon dev pooled connection tested on 2026-10-16: it reported `0`, `0` and `5min` instead.

The original author reported the same production values that day. This challenge independently repeated only the authorized dev check. It does not claim a fresh production verification or a measured timeout incident. DEBT-524's assessment found the defect.

*Corrected 2026-10-16: independently repeated the dev-only check; narrowed the mechanism and impact claims; corrected migration scope, backend refresh and transaction-wrapper tradeoffs.*

## Evidence

### Code and Live Dev Receipt

- `lib/db-connection-options.ts:4-9` defines the three bounds beside `TimeZone: 'UTC'`. `lib/db.ts:19-22` passes them to postgres.js as `connection` options. Installed postgres.js 3.4.9 serializes `options.connection` into its startup packet (`src/connection.js`, `StartupMessage`).
- The challenge read the pooled URL directly from `.env.local`, the Neon dev target designated by the owner. It checked the Neon/pooler hostname shape without printing it, supplied that URL explicitly as `DATABASE_URL`, and set the matching `DB_TARGET_ACK` through the repository's target helper. No production URL was loaded or connection attempted.
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
- The original author's production receipt was also `0`, `0`, `5min`, `GMT`, reportedly from a read-only transaction on 2026-10-16. It is retained as attributed prior evidence. The earlier draft's separate October 11 observation is not needed to establish this defect and is not independently substantiated here.

### Why the Existing Tests Do Not Establish Pooled Coverage

`tests/integration/db-connection-session.integration.test.ts:17-24,125-161` proves SQLSTATE `57014`, `55P03` and `25P03` against the resolver's direct local Postgres, which accepts these startup settings. Its reference to a fresh pooled connection means the postgres.js client pool, not a PgBouncer deployment. No transaction-pooler transport participates in those tests.

`docs/architecture/integrations/postgres.md` describes the intended application bounds as effective. The dev result disproves that guarantee for the tested pooled path. Correcting that integration document belongs with the eventual fix; this review changes only the two records and their index.

## Impact

- Statements and lock acquisitions on the tested path have no bound from `statement_timeout` or `lock_timeout`. They can still end through completion, lock release, cancellation, another error or infrastructure termination; they do not necessarily wait until a function's `maxDuration`.
- An idle transaction is governed by the observed five-minute idle timeout, rather than the intended minute. This is an inactivity bound, not a limit on total transaction duration. Earlier disconnect/termination can also release its locks.
- DEBT-447 left backend cancellation after platform termination unverified. Postgres still detects deadlocks independently of these two disabled timeouts. ([PostgreSQL timeout semantics](https://www.postgresql.org/docs/current/runtime-config-client.html), [deadlock detection](https://www.postgresql.org/docs/current/runtime-config-locks.html))
- Existing subscription/provisioning locks and DEBT-502's proposed serialization therefore lack the intended timeout backstop on this path. Lock scopes vary; being keyed by user does not prove safe total connection demand. No production outage is established by this check.

## Options

1. **Role defaults, scoped to the application database where appropriate.** A repository-managed `ALTER ROLE … IN DATABASE … SET` can make the settings defaults on backend login. PostgreSQL permits ordinary roles to change their own defaults for user-settable parameters. This addresses DEBT-447's objection to unverified manual settings only if rollout and effective pooled values are also verified. Defaults do not update existing backend sessions; reconnecting an application client through a pooler need not create a new backend. Plan and verify pool refresh without assuming one successful `SHOW` covers the pool. ([PostgreSQL ALTER ROLE](https://www.postgresql.org/docs/current/sql-alterrole.html))
   - **Migration coupling is real.** `vercel.json:8` runs the managed migration between ledger checks before building. `scripts/internal/run-managed-db-migrate.ts:6-12` invokes Drizzle Kit using the explicit target; `scripts/database-process.ts:8-11` passes it as `DATABASE_URL`; `drizzle.config.ts:5-20` supplies that same URL. No separate migration-role/URL contract exists.
   - Installed Drizzle Kit 0.31.11 resolves the postgres.js driver here (`pg` is absent) and creates its own client with `{ max: 1 }`, without importing `lib/db.ts` or its connection options. Thus an application startup fix alone does not cover migrations, while role defaults would affect subsequent migration sessions using that role.
   - All three defaults matter for migration behavior, not only the five-second lock bound. A **direct URL using the same role does not escape role defaults**. Separation needs an appropriately configured migration role or an explicit setting on the actual migration connection. A `SET` on a different connection is ineffective. DEBT-447's migration-bound work remains parked until the real migration connection is proved; choosing defaults that change it must explicitly revisit that decision and DEBT-445's deployment contract.
2. **`SET LOCAL` before work in each explicit transaction.** It lasts for that transaction and fits transaction pooling; it does not cover standalone queries or establish session defaults. Rollback to a savepoint preceding the setting undoes it. ([PostgreSQL SET](https://www.postgresql.org/docs/current/sql-set.html))
   - There is no single transaction wrapper to patch. Callers include `lib/container/controllers.ts:36`, `lib/container/use-cases.ts:121`, `app/api/webhooks/clerk/route.ts:43`, the reconcile route and checkout-success dependency builder. Repositories also start transactions, including `drizzle-subscription-repository.ts:112` and `drizzle-practice-session-repository.ts:218`; some nest inside an existing transaction as savepoints. Inventory outer transactions, nesting and unwrapped reads before claiming application-wide coverage.
   - It adds setup work to each covered transaction and must precede the first protected statement/lock. Neither this option nor server defaults bound waiting for a client/backend connection, or the total duration of a busy multi-statement transaction.
3. **Database defaults.** These apply to new sessions for the database across roles, unless a more specific role/session setting overrides them. Their scope is broader than option 1; the database owner or a superuser can change them. They share the backend-refresh and migration questions. A separate migration role alone does not avoid the database defaults unless its settings override them. ([PostgreSQL ALTER DATABASE](https://www.postgresql.org/docs/current/sql-alterdatabase.html))

## Resolution

Not decided. Choose the smallest policy that covers the intended workload and preserves the reviewed migration behavior. The fix must define its scope, rollout to existing pooled backends, rollback and verification. It must update the Postgres integration document and avoid claiming that changing `lib/db.ts` changes the build's independent client.

## Verification

- [x] Independent dev observation on 2026-10-16 through the owner-designated pooled URL, inside `sql.begin("read only")`: read-only `on`, bounds `0`, `0`, `5min`; `TimeZone` `GMT`. Only `SHOW` statements ran inside the transaction.
- [x] Original author's production observation retained above as attributed evidence, not repeated in this challenge.
- [ ] Red first for the chosen fix: reproduce the mismatch through a representative transaction pooler, then prove effective settings and the three timeout outcomes on a disposable target. Keep load/lock/cancellation tests off the shared Neon dev branch unless separately authorized.
- [ ] Prove coverage of standalone queries, every outer transaction and nested rollback as applicable to the chosen option. Check existing versus fresh backend sessions.
- [ ] If defaults affect migrations, prove the actual managed Drizzle Kit connection's intended bounds and migration behavior; explicitly resolve DEBT-447's parked decision before rollout.
- [ ] After promotion, the authorized production check reports the intended 30s, 5s and 60s through the pooled path, with rollout evidence for preexisting backend sessions.

## Related

- DEBT-447: application bounds, accepted pool policy and parked migration-bound work.
- DEBT-445: the single-URL build/migration contract and deployment compatibility.
- DEBT-524: the structural assessment and deployment-fidelity gap.
- DEBT-502 item 2: proposed provisioning serialization.
