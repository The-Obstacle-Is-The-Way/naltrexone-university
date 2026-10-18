# Postgres Operations Source Map

This application uses postgres.js with Drizzle ORM against Neon Postgres. This
page records operational intent and points to checked-in sources; it does not
copy connection configuration or dependency versions that can drift.

## Sources of Truth

- [`lib/db.ts`](../../../lib/db.ts) owns the application connection singleton,
  postgres.js pool options, and Drizzle wiring.
- [`lib/db-connection-options.ts`](../../../lib/db-connection-options.ts) owns the
  intended PostgreSQL connection bounds. Migration
  [`0052_bug345_role_timeouts.sql`](../../../db/migrations/0052_bug345_role_timeouts.sql)
  installs them as role defaults; the pooled integration test rejects drift.
- [`package.json`](../../../package.json) owns the supported `db:*` command entry
  points and their target-safety wrappers.
- [Migration Authoring](../../guides/database/migrations.md) owns migration file,
  lock-scope, N-1 compatibility, and never-`push` rules.
- [Deployment Procedure](../../guides/release/promote-to-production.md) owns the deploy-time
  pre-check, migration, exact post-check, and build sequence.
- [Database Rollbacks](../../guides/operations/database-recovery.md) owns fix-forward, restore,
  recovery-point-loss, and reconciliation procedures.

Dependency versions are recorded only in `package.json` and the lockfile. Read
the installed postgres.js and Drizzle release notes when upgrading them; do not
add version copies to this page.

## Actual Connection Contract

The repository currently has one connection variable: `DATABASE_URL`. The same
explicit URL supplies application runtime connections and Drizzle Kit
migrations. There is no repo-defined `DIRECT_URL` split.

Neon runtime URLs are intended to use a pooled endpoint so serverless instances
share provider backend capacity. The repository deliberately pins the
per-instance postgres.js pool size, but it does not reject a direct Neon
hostname. Current Vercel/Neon values and connection headroom remain
owner-verifiable provider state, not facts proven by this repository.

The development singleton limits hot-reload connection proliferation. Timeout
startup options alone do not establish bounds through Neon's transaction pooler:
pooled `SHOW` on production and dev returned disabled statement/lock timeouts on
2026-10-16 (BUG-345).

Migration 0052 sets the connecting role's defaults in the current database:
30 seconds per statement, 5 seconds per lock wait and 60 seconds idle inside a
transaction. An ordinary role can set its own user-settable defaults. They apply
on **backend login**, including standalone queries and clients that import no
application options. Existing backends retain their old settings. Neither these
limits nor the application pool's size bounds connection acquisition or the total
duration of an actively working multi-statement transaction.

The application retains startup options for direct connections. Server defaults
provide the pooled guarantee after rollout verification. A direct connection can
override defaults with startup options; transaction-local overrides work through
the pooler and must run on the connection doing the work. Rolling back to an
earlier savepoint also rolls back `SET LOCAL`.

## Processes Using the Application Role

Inventory, 2026-10-17: all repository production clients use the explicit
`DATABASE_URL` or the managed seed's named-environment resolution. The same role
inherits the three defaults regardless of entry point.

| Process and source | Why the defaults fit |
| --- | --- |
| Pages, actions, webhooks and crons through `lib/db.ts` | These are the application's existing intended bounds. Database waits must not consume a whole invocation. Provider and job deadlines remain separate. |
| Vercel build: `vercel.json`, `scripts/internal/run-managed-db-migrate.ts`, `scripts/database-process.ts`, `drizzle.config.ts`; human `db:migrate` | Drizzle Kit creates its own client. The pooled integration test captures all three values inside its actual migration transaction and observes `55P03` under a held ledger lock. Accept the five-second lock bound: fail the deployment instead of queueing requests behind a waiting migration. The 30-second statement limit also fails an unplanned long rewrite. |
| Pre/post-build ledger checks, `scripts/verify-migration-ledger.ts` | Bounded metadata/shape reads; no intentional idle transaction. |
| `db:seed`, managed `db:seed:all`/`db:seed:prod`, `scripts/seed.ts` and `scripts/seed/question-syncer.ts` | Read and prepare files before per-question transactions. Each statement and lock wait is bounded; the whole seed may take longer than 30 seconds. |
| `scripts/content-release/{stage-release,activate-release,bootstrap-release,hold-questions}.ts`, shared `command-support.ts`, and `scripts/seed/withdraw-questions.ts` | Prepare input before database work. Release transactions serialize on the release pointer and issue successive SQL statements, without operator prompts or provider calls inside them. The lock limit prevents a release waiting indefinitely behind another writer. |
| `scripts/export-question-feedback.ts` | One joined read; file formatting/output follows the query. A slow export fails rather than keeping an unbounded query alive. |
| `db:studio`, `scripts/db-studio.ts`, and manual clients using this role | Individual operations inherit the bounds, including an interactive transaction left idle. Studio does not justify an unbounded default. `db:generate` uses local schema files and does not need a database session. |

No current process requires a higher bound. This is a source/workload decision,
not a production-capacity measurement. Seed, content-release and runtime paths
retain their integration checks. If a future reviewed operation needs more,
prove that need and set a bounded `SET LOCAL` inside its own transaction before
the work. Do not raise the role default. A migration needing such an override
must put it inside Drizzle's migration transaction, not on a separate client.

## BUG-345 Rollout and Verification

1. Review and merge the migration with its tests. Every pushed PR head already
   migrates the shared Preview database during Vercel's build (DEBT-445). This
   change does not authorize a manual migration against any Neon branch.
2. Promote normally. The build applies 0052 as its current role in its current
   database. It changes no application tables and is compatible with the prior
   application, which already requests these bounds. The session applying the
   migration retains its prior settings; subsequent backend logins inherit the
   new ones. A rebuild or application-client reconnect alone does not prove that
   PgBouncer replaced its backends.
3. Allow the provider's normal backend renewal, then have the owner or an
   explicitly authorized operator check production through its pooled URL.
   Open several clients concurrently. Inside each `sql.begin('read only', ...)`,
   issue only `SHOW transaction_read_only`, `SHOW statement_timeout`,
   `SHOW lock_timeout` and `SHOW idle_in_transaction_session_timeout`.
   Keep each transaction open until all clients have read, then release them;
   this samples several occupied backends rather than repeatedly borrowing one.
   Require `on`, `30s`, `5s` and `1min` (60 seconds) on every sample. Repeat the
   batch after normal traffic has exercised the deployment. Record date,
   connection count and values only, never a URL or credential. These samples
   establish the observed backends, not an exhaustive census of the pool.
4. If any sample retains old values, the rollout is unverified. The owner
   must arrange any required Neon-side backend recycle using the provider's
   supported procedure and assess its connection-disruption risk, then repeat
   the checks.
   No agent may restart an endpoint or terminate production backends as part of
   this rollout. Do not assume a particular Neon backend lifetime or that local
   PgBouncer's admin commands are available there.
5. BUG-345 closed on 2026-10-18 on two such batches: one shortly after
   promotion #1551, and one about 20 hours later. A later migration that
   changes these role defaults repeats steps 2 to 4.

**Rollback:** a code rollback alone leaves role defaults in place. Prefer a
reviewed fix-forward transaction-local override for a proven exceptional
operation. If the defaults themselves must be reverted, use another reviewed
migration with `ALTER ROLE CURRENT_USER IN DATABASE … RESET` for each setting,
then verify new backends again. That restores inherited defaults, including the
original missing-bound risk; never silently reset them by hand.

## Operator Rules

Never use `drizzle-kit push` for this repository. It bypasses the checked-in
migration journal and can omit extensions, constraints, data repairs, custom
SQL, and ledger history. Generate a migration file, review it, and apply it
through the guarded `db:migrate` entry point instead.

Direct database commands require an explicitly supplied `DATABASE_URL`;
ignored dotenv files are not an authorization source. Loopback targets run as
local. `db:seed:all` and `db:seed:prod` instead resolve named Vercel environment
URLs internally, and `db:seed:prod` rejects a caller-supplied `DATABASE_URL`.
Remote migrate, seed, and Studio commands, including the provider-resolved seed
sets, require the exact credential-free `DB_TARGET_ACK` printed by the shared
target guard. Checked-in CI, Vercel, E2E, and resolver wrappers use the internal
managed boundary rather than a caller-selectable flag or environment bypass.

For local disposable Postgres, resolve the clone-specific target through
[`scripts/resolve-local-test-target.ts`](../../../scripts/resolve-local-test-target.ts)
and follow [Integration Tests](../../guides/testing/integration-tests.md). Never hardcode a
shared local port. CI pulls Postgres and the transaction-pooler stand-in through
one bounded registry-failover helper; Compose starts the selected PgBouncer
reference with pulls disabled. The [dependency update guide](../../guides/dependencies/updating-dependencies.md#cis-pgbouncer-image) owns the pooler pin
and its refresh duty (BUG-352).

## Primary Vendor References

- [postgres.js](https://github.com/porsager/postgres)
- [Drizzle with postgres.js](https://orm.drizzle.team/docs/get-started-postgresql#postgresjs)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [PostgreSQL client connection defaults](https://www.postgresql.org/docs/current/runtime-config-client.html)
