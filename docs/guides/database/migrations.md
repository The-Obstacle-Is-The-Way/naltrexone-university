# Migration Authoring


This guide is the durable review checklist for Drizzle migration files. It was `docs/dev/migration-authoring.md` until 2026-10-11, and two applied migrations, `0027` and `0028`, still cite that path; applied migrations never change. It
complements [Deployment Procedure](../release/promote-to-production.md), which describes
when migrations run. This file describes how to write migrations so data cleanup,
constraints, and lock scope are explicit before a PR merges.

---

## Pre-Flight Data Proof

Before adding a migration that tightens constraints, backfills derived rows, or
changes a JSON/data invariant, run read-only proof queries against the target
shape of the current data.

At minimum, count the rows that could fail the migration:

- dangling references the new foreign key will reject;
- duplicate keys the new unique constraint will reject;
- malformed JSON/data shapes a parser or cast will reject;
- rows a cleanup statement intends to mutate.

Record the counts in the bug/debt/spec document that justifies the migration.
The migration should then either fail loudly when the precondition is violated
or include a deterministic cleanup before the constraint that depends on it.

## Operation Ordering

Backfills and cleanups that make data satisfy a constraint must run before the
constraint is added. Do not add a foreign key, unique constraint, or check
constraint first and hope the later backfill explains the failure.

`0021_flaky_domino.sql` is the documented caution: it added foreign keys before
its own legacy-data backfill. That had already applied successfully in the
deployed branches, but the ordering is not the authoring pattern to repeat.

Safer examples are the cleanup-before-constraint steps in `0022`, `0023`, and
`0024`; they normalize inconsistent data before adding the constraints that
would otherwise reject it.

## Cleanup Audit Trail

Every data-mutating cleanup statement in a migration should emit an affected-row
count. For hand-authored SQL, use a `DO` block with `GET DIAGNOSTICS ... =
ROW_COUNT` and `RAISE NOTICE` for each cleanup.

`0026_track_a_tail_sweep.sql` is the local exemplar:

- it marks the cleanup block;
- it fails loudly if string-typed `params_json` cannot parse to an object;
- it records the count of normalized string rows;
- it records the count of stripped stale `params_json.questionStates` keys.

Those notices make deploy logs useful months later, when the old state of the
table can no longer be reconstructed from the migration ledger alone.

## Lock Scope

Drizzle applies pending migration files in a transaction. PostgreSQL locks taken
inside that transaction are held until the transaction commits, not merely until
the statement finishes.

Review lock scope before merging migrations that touch live tables:

- `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` takes
  `SHARE ROW EXCLUSIVE` locks on the referencing and referenced tables while the
  constraint is added and validated. This blocks concurrent writes.
- Standard `CREATE INDEX` takes a `SHARE` lock. It blocks concurrent writes but
  not ordinary reads.
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. If a large
  live table needs a write-nonblocking index build, split it into a
  separately-applied migration path rather than putting it in the normal Drizzle
  transaction batch.

Small or empty tables can accept the standard lock cost, but the migration must
say so in a nearby SQL comment. `0026_track_a_tail_sweep.sql` does this for its
bounded cleanup over the small `practice_sessions` table.

Application startup options in `lib/db-connection-options.ts` alone do not
configure Drizzle Kit's separate client. Migration 0052 installs the same bounds
as defaults for the connecting role in the current database: 30-second
statements, five-second lock waits and 60 seconds idle in a transaction.
BUG-345's pooled integration test proves those values inside the actual managed
Drizzle migration transaction and a lock failure with SQLSTATE `55P03`.

Keep the five-second lock bound: a migration should fail instead of queueing
requests behind its waiting lock. If a reviewed operation needs a longer
statement limit, prove the need and put a bounded `SET LOCAL` inside its own
migration transaction; do not raise the role default or set a different client.
Existing backend sessions retain old defaults until renewal, including the
session applying 0052. The [Postgres operations guide](../../architecture/integrations/postgres.md#bug-345-rollout-and-verification)
owns rollout and production verification. Do not claim deployed coverage from
the migration ledger alone.

## Deployed-Code Compatibility

Every migration PR must answer this N-1 question explicitly: **after the
migration commits, can the currently serving deployment continue to read and
write correctly until the new deployment is promoted?** The deploy pipeline
migrates before it builds and promotes replacement code, so old code and the
new schema necessarily overlap.

Use expand/contract across deployments for contracting changes:

1. Expand with an additive schema that both N-1 and new code can use.
2. Deploy code that reads/writes the expanded shape and stops depending on the
   old shape.
3. Contract only in a later migration after N-1 code can no longer serve.

Do not introduce a constraint that rejects writes the serving code can still
produce. Common failure codes are `23514` for a CHECK violation, `23502` for a
NOT NULL violation, and `23503` for a foreign-key violation.

One-shot backfills have the same compatibility window. A scan that runs during
migration cannot see rows that N-1 code inserts or updates after that scan
commits. When the serving code can still create the legacy shape, prefer a
re-runnable bounded post-cutover backfill or schedule a deliberate follow-up
sweep after promotion; do not describe the pre-build scan as complete coverage.

## Deployment Contract

Never use `drizzle-kit push` for this repository. It bypasses checked-in
migration files and can miss extensions, constraints, custom SQL, and ledger
history.

The supported migration-generation entry is `pnpm db:generate`. Supply the
database target explicitly; the command refuses dotenv fallback, classifies the
target through the same human database boundary as migrate/studio/seed, prints
only a credential-free target identity, and requires the exact `DB_TARGET_ACK`
it reports before using a remote target:

```bash
DATABASE_URL="<verified target connection string>" pnpm db:generate
```

Do not invoke the raw dependency CLI for repository work. It loads
`drizzle.config.ts` directly and therefore does not provide the package entry's
human acknowledgement boundary.

Git-triggered Vercel Preview and Production deploys run the Build Command in
`vercel.json`, which `vercel.test.ts` pins. It checks a configured Clerk JWT key
against Clerk's published keys and fails on a mismatch. With no key set it skips
the check, and when Clerk's keys cannot be read it logs that the key went
unchecked; either way the build continues.
It then runs a content/ledger pre-check, applies the
checked-in migration journal, runs an exact post-check, and then builds:

```bash
pnpm exec tsx scripts/check-clerk-jwt-key.ts \
  && pnpm exec tsx scripts/verify-migration-ledger.ts pre \
  && pnpm exec tsx scripts/internal/run-managed-db-migrate.ts \
  && pnpm exec tsx scripts/verify-migration-ledger.ts post \
  && pnpm build
```

This guide is the only place that writes the command out; other documents link
here.

For any manual fallback or operator-run migration, pass the intended database
explicitly:

```bash
DATABASE_URL="<verified target connection string>" pnpm db:migrate
```

Verify the target host without printing credentials before mutating any remote
database. CI migration success only proves the journal applies to CI's
throwaway Postgres container; it does not migrate Vercel Preview or Production
databases.
