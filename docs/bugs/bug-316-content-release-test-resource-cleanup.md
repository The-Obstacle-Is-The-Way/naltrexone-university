# BUG-316: Content Release Test Failures Leak or Block Resources

**Status:** Open
**Priority:** P3
**Date:** 2026-10-02

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
the [audit ledger](./assets/content-release-audit-2026-10-02.md). Focused
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
