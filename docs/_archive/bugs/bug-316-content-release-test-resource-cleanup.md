# BUG-316: Content Release Test Failures Leak or Block Resources

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved
**Priority:** P3
**Date:** 2026-10-02
**Resolved:** 2026-10-02
**Verification receipts:** [Verified closeout](#verified-closeout--2026-10-02-utc)

## Evidence and reproduction

Two failures were reproduced on disposable local Postgres at `3ecc1283`:

1. `createDisposableDatabase` creates a database before running migrations.
   Pointing migration lookup at a directory without migrations throws before
   the helper returns its drop function. Database inventory increased by one.
   The probe explicitly dropped its leaked database afterwards.
2. The cross-connection visibility test in
   `content-release-verification.integration.test.ts` pauses activation on
   advisory lock 483. On an assertion failure its finally block tries to drop
   the receipt trigger before releasing that lock. A separate connection
   confirmed DROP TRIGGER waiting on activation's relation lock while activation
   waited on the test's advisory lock. Releasing the advisory lock completed
   cleanup. The probe then dropped its database.

The visibility poll also searches all ungranted advisory locks in the cluster,
without identifying the activator. A different database's wait can satisfy it;
that is not evidence that this activation reached its final write.

## Failure scenario

A migration or assertion failure leaves resources behind or hangs teardown,
masking the original failure and weakening the visibility proof.

## Options and decision

- Longer timeouts: rejected; they do not break a dependency cycle.
- Rely on forced database deletion in afterAll: rejected; setup may never return
  its handle, and cleanup must release blockers before waiting for completion.
- **Chosen:** own cleanup immediately after database creation, clean up migration
  failures while preserving their cause, and expose a migration-folder option
  on this test helper for real failing-migration tests. In the visibility test,
  identify the activation backend and advisory key; unlock and settle activation
  before dropping trigger/function, and close connections in an outer finally.

## Verification required

Real failing-migration red/green, a cleanup-on-assertion-failure case, both
visibility outcomes, and mutation checks. No implementation changed at filing.
Keep open until required merge/promotion receipts exist.

## Local implementation receipt — 2026-10-02

The recorded fix is implemented locally, with red/green and mutation evidence in
the [audit ledger](../../bugs/assets/content-release-audit-2026-10-02.md). Focused
integration: 15 passed. Full exact-head gate, review and merge receipts are
recorded in the PR when complete. No production promotion is claimed; this
record remains open.

## Review follow-up

The first PR #1302 CI test job passed, but Codecov correctly identified the
uncovered combined migration/cleanup-error branch (96.66% patch coverage against
97.42%). A real-Postgres case now transfers the test database from its temporary
creator to the local administrator before the migration throws. The creator's
cleanup is refused; the helper must retain both errors and the original cause.
The administrator then removes only this test's database and temporary role.
The test bounds its catalog wait with a PostgreSQL statement timeout.

CodeRabbit's follow-up environment-isolation finding was valid: the new test's
manual DATABASE_URL reset preserved its value, but did not follow the mandatory
`.claude/rules/test-isolation.md` snapshot/afterEach pattern. The test now uses
the shared helpers so the whole original environment is restored.

## A race in the combined-error case — 2026-10-02

After #1302 merged, the combined migration/cleanup-error case failed in CI run
`36965916479` on #1305, a docs-only PR. The migration's error was
`permission denied for database it_disposable_…`, not the injected failure.
The same case had failed once in 8 local combined runs earlier that day, with
no output captured.

**Cause.** The test waited only until the role-owned database existed, then
transferred its ownership. Drizzle's migrator first creates its own schema as
the creating role, before the injected migration's wait loop runs. When the
transfer won that race, the role had lost CREATE on the database, and the
migration failed on permission instead.

**Reproduced before fixing.** 24 runs, 6 at a time: 12 failed, each with
that permission error.

**Fix.** The test transfers ownership only once a backend of its temporary
role is running the injected migration, as `pg_stat_activity` shows. By then
the migrator's setup is done. The wait allows 10 s, the migration's statement
timeout is 15 s, and the case's own timeout is 20 s, to allow for CI load.
After the fix: 24 runs, 6 at a time, none failed, and no database or role was
left behind before or after.

## Verified closeout — 2026-10-02 UTC

A disposable database is dropped when its migration fails, keeping both errors when cleanup fails too. The visibility test releases and settles activation before its cleanup, and its wait names its own backend and key. Tests only; no runtime path. Each Verification item was re-run against `main`'s code before archival (the archiving branch differs from `7dcb9331` only in documentation), with the release, withdrawal, seed and cleanup integration suites: 15 files, 163 cases, all passed.

| Verification | Holds | Receipt on `main`'s code |
| --- | --- | --- |
| A failed migration leaves no database behind | Yes | `disposable-database-cleanup`: *drops a disposable database when its migration fails* |
| Both errors survive when cleanup also fails | Yes | `disposable-database-cleanup`: *preserves the migration error when database cleanup also fails*, whose race was fixed in #1305 (12 of 24 concurrent runs failed before, none after) |
| The visibility test cleans up after a failure and waits on its own activation | Yes | `content-release-verification`: *shows a reader no part of an activation that fails*, *…that commits* and *…that observation fails* |

**Increments.** #1302 (**5388054704** on `69733bb9`; merged `93f8104a`); the combined-error race was fixed in #1305 (**5388559241** on `fe9beea1`; merged `e2d61472`).

**Release.** Released through promotion #1312 (`7dcb9331`, merged **09:41:39Z** after a passing `verify-promotion` receipt): main CI **36991253547** `test` passed **09:55:00Z**, production assigned **09:55:02.296Z**, trees `d1e952d0`, healthy production.

