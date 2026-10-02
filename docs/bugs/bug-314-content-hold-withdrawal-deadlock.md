# BUG-314: Content Writers Do Not Share One Serialization Boundary

**Status:** Open
**Priority:** P2
**Date:** 2026-10-02

## Evidence and reproduction

Confirmed against real Postgres in a disposable database created by
`tests/integration/disposable-database-test-helpers.ts`, on PR #1301 head
`6a9c5f2fc204edf05fd76c5a04b5f4a63345d0a7`.

`changeHolds` locks the release pointer, then the requested question rows,
then calls `activateRelease`, which locks every affected question in ID order.
`runContentWithdrawal` does not lock the pointer: it locks its batch in ID order.

The reproduction seeds and bootstraps questions, then pauses a hold of the
higher-ID question at an insert trigger using an advisory lock. A concurrent
withdrawal of the lower and higher question locks the lower and waits on the
higher. Releasing the hold's pause lets activation request the lower question.
Postgres detects the cycle and aborts one operation with SQLSTATE `40P01`.

Command: `pnpm test:integration content-audit-reproduction`.
Result: omission case passed; concurrent hold/withdrawal case failed with
`PostgresError: deadlock detected`, SQLSTATE `40P01`. Receipt:
`/tmp/content-audit-deadlock-red.log` (local, not a durable CI receipt).

A second disposable-database probe paused two identical new-only stages at a
question-insert trigger. Both held the pointer for share and saw no existing
question. Releasing the barrier produced one success and one `23505` uniqueness
failure. Sequential reuse does not guarantee concurrent reuse.

Two more real-Postgres probes establish learner-facing lock edges:

- An attempt transaction inserts the higher-ID question, acquiring its foreign
  key KEY SHARE lock, then inserts the lower question. Concurrent activation
  locks the lower question FOR UPDATE and waits on the higher. The attempt
  waits on the lower. Result: activation aborted with `40P01`.
- A hold pauses after locking the higher question. The real
  `DrizzlePracticeSessionRepository.create` takes FOR SHARE on the lower,
  then waits on the higher. Re-applying the release from the hold requests the
  lower: session creation aborted with `40P01`.
- With the physical heap deliberately reversed, session creation locks the
  higher question before waiting on the lower: an independent NOWAIT probe
  of the higher row fails (`55P03`). Its query lacks an ORDER BY.

These probes ran before changing the row-lock protocol. The initial operator
serialization fix is therefore necessary but insufficient.

## Failure scenario

A clinical hold overlaps an emergency withdrawal batch. One command fails,
leaving its requested clinical action unapplied until an operator notices and
retries. Transaction rollback prevents a partial write but does not provide
successful withdrawal delivery.

## Options and decision

- Retry deadlocks: hides an avoidable lock-order defect and requires bounded
  retry semantics across operator commands.
- Lock every affected question before changing a hold: duplicates activation's
  lock-set calculation and leaves future nested operations exposed.
- Serialize withdrawals on the release pointer before any question row:
  **chosen**. Use the same exclusive pointer lock as holds and activation.
  Staging and each direct-seed/placeholder transaction take it too, giving all
  supported content writers one serialization boundary before any row locks.
  These are operator commands, so serial execution is preferable to retries
  and multiple overlapping lock protocols. The direct seed remains per-question,
  not an atomic whole-bundle import.
  This establishes pointer-before-questions for release-era overlay writers.
  Recheck all seed, staging and archival writers; this change alone is not
  a claim that the entire repository is deadlock-free.

### Extended lock decision

Content writers change neither question IDs nor slugs. Use FOR NO KEY UPDATE
for their question locks, which still excludes other updates and session SHARE
locks but permits learner foreign-key KEY SHARE locks. Holds defer question row locks to activation, which takes the complete set
in sorted order. Their initial lookup needs no row lock because the pointer
already excludes other content writers. Pre-locking the whole set and then
locking it again in activation was considered and removed as redundant. Placeholder archival locks its
exact fixture set in the same order before updating. Session creation takes
its SHARE locks in question-ID order too. Do not make learner writes acquire
an operator lock or introduce retry loops.

The proof is scoped to supported content writers, session binding and attempt
FK writes, not arbitrary administrator SQL or concurrent DDL. Transaction-wide
atomicity does not promise one snapshot across separate reader statements at
READ COMMITTED.

## Verification required

Retain a deterministic cross-connection case, prove it red before fixing,
then green; remove the new lock and demonstrate red again. Full gate and
exact-head review remain required. No implementation changed at filing.

## Local implementation receipt — 2026-10-02

The recorded fix is implemented locally, with red/green and mutation evidence in
the [audit ledger](./assets/content-release-audit-2026-10-02.md). Focused
integration: 15 passed. Full exact-head gate, review and merge receipts are
recorded in the PR when complete. No production promotion is claimed; this
record remains open.
