# DEBT-430: Migrations 0021-0024 hold broad write-blocking locks for their entire combined transaction, including a non-concurrent unique index build

**Status:** Resolved
**Priority:** P2
**Date:** 2026-07-01

---

## Description

`0021_flaky_domino.sql:21-24` adds four `FOREIGN KEY` constraints from the new `practice_session_question_states` table to `practice_sessions`, `questions`, and `choices`, immediately after `CREATE TABLE` and *before* its own backfill `INSERT` (lines 27-103). Each `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` takes a `SHARE ROW EXCLUSIVE` lock on **both** the referencing table (the brand-new, empty `practice_session_question_states`) and the **referenced** table (`practice_sessions`, `questions`, `choices` — all live, actively-written tables) for the duration of the constraint's validation.

Drizzle's migrator wraps every pending migration file in **one transaction**, and Postgres locks are held for the life of the transaction, not just the statement that acquired them. So the `SHARE ROW EXCLUSIVE` lock taken at `0021:21-24` is held through the rest of `0021`'s backfill, all of `0022_confused_mandrill.sql`, `0023_soft_blue_marvel.sql`, and `0024_needy_jimmy_woo.sql` — the entire migration run.

Compounding this, `0022_confused_mandrill.sql:1` runs `CREATE UNIQUE INDEX "choices_id_question_id_uq" ON "choices" USING btree ("id","question_id")` **without** `CONCURRENTLY`. A standard non-concurrent `CREATE INDEX` takes a table-level `SHARE` lock: it blocks concurrent `INSERT`/`UPDATE`/`DELETE` on `choices` while the index is built, but it does **not** block ordinary reads. PostgreSQL's own `CREATE INDEX` docs state this as "locks out writes (but not reads)." Note structurally: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block at all, so as long as this migration set stays wrapped in Drizzle's single-transaction runner, there is no way to express a write-nonblocking version of this specific statement without splitting it into its own separately-applied migration run.

`SHARE ROW EXCLUSIVE` blocks all `INSERT`/`UPDATE`/`DELETE` on `practice_sessions`/`questions`/`choices` for the run's duration; the non-concurrent `CREATE INDEX` adds another writer-blocking lock on `choices`. Plain `SELECT` reads can still proceed.

## Impact

Neutralized today: the DEBT-425 audit confirms 0 practice sessions in production at the time of writing, so this migration set's actual runtime is currently short and its blocking window is not observably harmful. This is a template/pattern risk, not a live incident: any *future* migration written the same way (constraints before backfill, non-concurrent index build, all inside one multi-file transaction) against a table with real traffic would produce a genuine write outage for the duration of the batch. It is not a plain-read outage from the index build alone.

## Resolution

Converted to durable authoring guidance in [Migration Authoring](../../dev/migration-authoring.md):

- [Lock Scope](../../dev/migration-authoring.md#lock-scope) records that Drizzle's transaction keeps locks until commit, that foreign-key validation takes `SHARE ROW EXCLUSIVE` locks on referencing and referenced tables, and that ordinary `CREATE INDEX` blocks writes but not reads.
- The same section records the `CREATE INDEX CONCURRENTLY` constraint: it cannot run inside the normal transaction batch, so large live-table index builds need a separately-applied path.
- The section also requires migration-local comments when accepting lock cost because a table is known small or empty. `0026_track_a_tail_sweep.sql` is now the local example of documenting a bounded small-table cleanup.

This closes DEBT-430 as a process debt. No retroactive runtime lock capture is possible or useful for already-applied migrations 0021-0024.

## Verification

Closeout proof recorded 2026-07-04: [Migration Authoring](../../dev/migration-authoring.md#lock-scope) now carries the lock-scope checklist and `docs/dev/deployment-procedure.md` links migration authors to that runbook from the data-affecting migration section.

## Related

- PR #537, [DEBT-427](./debt-427-migration-fk-ordering-and-unaudited-cleanup.md) (adjacent finding — backfill-before-constraint ordering and cleanup audit trail on the same migration files)
- `db/migrations/0021_flaky_domino.sql:21-24`
- `db/migrations/0022_confused_mandrill.sql:1`
- Found via a systematic migration schema-evolution audit (2026-07-01), independently re-verified by reading the migration SQL directly
