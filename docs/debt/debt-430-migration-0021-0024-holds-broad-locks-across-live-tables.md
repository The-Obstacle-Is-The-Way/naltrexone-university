# DEBT-430: Migrations 0021-0024 hold a broad, multi-table lock for their entire combined transaction, including a non-concurrent unique index build

**Status:** Open
**Priority:** P2
**Date:** 2026-07-01

---

## Description

`0021_flaky_domino.sql:21-24` adds four `FOREIGN KEY` constraints from the new `practice_session_question_states` table to `practice_sessions`, `questions`, and `choices`, immediately after `CREATE TABLE` and *before* its own backfill `INSERT` (lines 27-103). Each `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` takes a `SHARE ROW EXCLUSIVE` lock on **both** the referencing table (the brand-new, empty `practice_session_question_states`) and the **referenced** table (`practice_sessions`, `questions`, `choices` — all live, actively-written tables) for the duration of the constraint's validation.

Drizzle's migrator wraps every pending migration file in **one transaction**, and Postgres locks are held for the life of the transaction, not just the statement that acquired them. So the `SHARE ROW EXCLUSIVE` lock taken at `0021:21-24` is held through the rest of `0021`'s backfill, all of `0022_confused_mandrill.sql`, `0023_soft_blue_marvel.sql`, and `0024_needy_jimmy_woo.sql` — the entire migration run.

Compounding this, `0022_confused_mandrill.sql:1` runs `CREATE UNIQUE INDEX "choices_id_question_id_uq" ON "choices" USING btree ("id","question_id")` **without** `CONCURRENTLY`. A non-concurrent index build takes `ACCESS EXCLUSIVE` on the target table for the scan-and-build duration — stronger than `SHARE ROW EXCLUSIVE`, and it blocks **reads** as well as writes on `choices` (every question render reads `choices`). Note structurally: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block at all, so as long as this migration set stays wrapped in Drizzle's single-transaction runner, there is no way to express a non-blocking version of this specific statement without splitting it into its own separately-applied migration run.

`SHARE ROW EXCLUSIVE` blocks all `INSERT`/`UPDATE`/`DELETE` on `practice_sessions`/`questions`/`choices` for the run's duration; `ACCESS EXCLUSIVE` additionally blocks reads on `choices`.

## Impact

Neutralized today: the DEBT-425 audit confirms 0 practice sessions in production at the time of writing, so this migration set's actual runtime is currently short and its blocking window is not observably harmful. This is a template/pattern risk, not a live incident: any *future* migration written the same way (constraints before backfill, non-concurrent index build, all inside one multi-file transaction) against a table with real traffic would produce a genuine write-outage (and, for the index case, a read-outage) for the duration of the batch.

## Resolution

For future migrations touching these tables: order operations so constraint-adding `ALTER TABLE` statements run *after* any backfill that could conflict with them (matching the safer pattern `0022`/`0023`/`0024` already use for their own cleanup-before-constraint UPDATEs, confirmed accurate per DEBT-427). Split `CREATE INDEX CONCURRENTLY` statements into their own single-file migration outside the multi-file transaction batch, or accept the `ACCESS EXCLUSIVE` cost only when the target table is known to be small/empty (as it is here today, but that assumption isn't documented anywhere near the SQL itself). Consider adding a comment at the top of any future FK-adding migration in this family noting the multi-file-transaction lock-duration hazard so it doesn't get silently repeated.

## Verification

No runtime verification possible retroactively for an already-applied migration; this is a process/review-checklist item for future migrations in this family. If desired, a `pg_locks` capture during a staging replay of this exact migration set (with representative row counts) would confirm the lock duration and blocked-statement set empirically.

## Related

- PR #537, [DEBT-427](./debt-427-migration-fk-ordering-and-unaudited-cleanup.md) (adjacent finding — backfill-before-constraint ordering and cleanup audit trail on the same migration files)
- `db/migrations/0021_flaky_domino.sql:21-24`
- `db/migrations/0022_confused_mandrill.sql:1`
- Found via a systematic migration schema-evolution audit (2026-07-01), independently re-verified by reading the migration SQL directly
