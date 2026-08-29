# Migration Authoring

**Last Updated:** 2026-08-29

This guide is the durable review checklist for Drizzle migration files. It
complements [Deployment Procedure](./deployment-procedure.md), which describes
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

The application-session bounds in `lib/db-connection-options.ts` apply only to
connections created by `lib/db.ts`. They are not evidence that Drizzle Kit's
migration transaction has a statement or lock timeout. Do not claim migration
timeout coverage unless it is proven on the actual `pnpm db:migrate` connection.

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

Git-triggered Vercel Preview and Production deploys run a content/ledger
pre-check, the checked-in migration journal, an exact post-check, and then the
application build through the configured Build Command:

```bash
pnpm exec tsx scripts/verify-migration-ledger.ts pre \
  && pnpm exec tsx scripts/internal/run-managed-db-migrate.ts \
  && pnpm exec tsx scripts/verify-migration-ledger.ts post \
  && pnpm build
```

For any manual fallback or operator-run migration, pass the intended database
explicitly:

```bash
DATABASE_URL="<verified target connection string>" pnpm db:migrate
```

Verify the target host without printing credentials before mutating any remote
database. CI migration success only proves the journal applies to CI's
throwaway Postgres service; it does not migrate Vercel Preview or Production
databases.
