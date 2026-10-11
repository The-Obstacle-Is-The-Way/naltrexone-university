# Postgres Operations Source Map

This application uses postgres.js with Drizzle ORM against Neon Postgres. This
page records operational intent and points to checked-in sources; it does not
copy connection configuration or dependency versions that can drift.

## Sources of Truth

- [`lib/db.ts`](../../lib/db.ts) owns the application connection singleton,
  postgres.js pool options, and Drizzle wiring.
- [`lib/db-connection-options.ts`](../../lib/db-connection-options.ts) owns the
  PostgreSQL startup/session parameters used by application connections.
- [`package.json`](../../package.json) owns the supported `db:*` command entry
  points and their target-safety wrappers.
- [Migration Authoring](../dev/migration-authoring.md) owns migration file,
  lock-scope, N-1 compatibility, and never-`push` rules.
- [Deployment Procedure](../dev/deployment-procedure.md) owns the deploy-time
  pre-check, migration, exact post-check, and build sequence.
- [Database Rollbacks](../dev/database-rollbacks.md) owns fix-forward, restore,
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

The development singleton limits hot-reload connection proliferation.
Database-side application session bounds limit abandoned transactions, lock
waits, and long-running statements after user-visible timers return. Those
application parameters do **not** prove equivalent coverage for Drizzle Kit's
migration transaction.

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
[`scripts/resolve-local-test-target.ts`](../../scripts/resolve-local-test-target.ts)
and follow [Integration Tests](../dev/integration-tests.md). Never hardcode a
shared local port.

## Primary Vendor References

- [postgres.js](https://github.com/porsager/postgres)
- [Drizzle with postgres.js](https://orm.drizzle.team/docs/get-started-postgresql#postgresjs)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [PostgreSQL client connection defaults](https://www.postgresql.org/docs/current/runtime-config-client.html)
