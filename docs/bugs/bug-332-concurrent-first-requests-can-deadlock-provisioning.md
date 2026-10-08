# BUG-332: A New User's Concurrent First Requests Can Deadlock Provisioning

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — no "Failed to ensure user row" event in Sentry for two weeks after the deploy; due 2026-10-22
**Priority:** P2
**Date:** 2026-10-08
**Resolved:** —
**Verification receipts:** —

---

## Summary

A new user's first page load can send several requests at once. Each finds no `users` row and provisions one through the same upsert. When three or more do so together, Postgres can detect a deadlock among their inserts and abort one of them, with SQLSTATE `40P01`. That request fails with "Failed to ensure user row", and the user sees an error on their first visit.

[BUG-320](./bug-320-first-pricing-render-user-upsert-race.md) fixed the two-request case, where the loser trips the email index and retries once. Its retry does not cover a deadlock, and its verification watches only for "User could not be upserted", so this failure would not show there.

## Evidence

- **Found by DEBT-503 item 1's contract test** (`tests/integration/session-identity-contract.integration.test.ts`): six first requests for one new user, each on its own connection, released together, in 100 rounds per run.
- **Rate.** CI found it first: #1426's run 37746214211, on `274772b1` (2026-10-08 07:53Z), failed on this test. The local full gate failed on it once later that day, after passing four times. Rerun alone, the test then failed in 7 of 20 runs, each time in one round of the 100.
- **Cause, from the driver error.** SQLSTATE `40P01`, "deadlock detected": one process waits for a `ShareLock` on another's transaction while that one waits on a third. Each session's `INSERT … ON CONFLICT (clerk_user_id) DO UPDATE` inserts speculatively and then waits on the other sessions' unique-index entries, for `clerk_user_id` and for `users_email_uq`, so the waits can form a cycle.
- **Mapping.** `DrizzleUserRepository.mapDbError` keeps the driver error as the cause and reports `INTERNAL_ERROR`, "Failed to ensure user row" (`src/adapters/repositories/drizzle-user-repository.ts`). Nothing above it retries.
- **Before DEBT-503 item 1, too.** Every signed-in request ran the same upsert through `currentUser()`, so concurrent first requests raced it then as well. This is not a regression.
- **Production.** Sentry holds no "Failed to ensure user row" event in the last 30 days. Traffic is light.

## Impact

- A new user's first visit can fail once. A reload succeeds, because the row then exists.
- Nothing is lost or corrupted: the deadlock victim's transaction rolls back.

## Options

1. **Retry a deadlock victim** (recommended). Postgres's documentation expects applications to retry a transaction it aborts as a deadlock victim. The session gateway provisions outside any transaction, so it can retry the whole provisioning step, through the shared `retry` helper and its default attempts, when the error's SQLSTATE is `40P01`. Clerk is not asked again.
2. **Serialize provisioning per Clerk user** with a transaction-scoped advisory lock. This removes the cycle, but adds a lock whose order against the deletion path must be proven. [DEBT-502](../debt/debt-502-account-identity-and-action-hardening.md) item 2 already decided to provision under the existing tombstone lock, in one transaction, with both interleavings proven against real Postgres.
3. **Retry inside the repository.** Rejected: the repository can be bound to a caller's transaction, and a deadlock aborts that transaction, so an inner retry cannot recover it.

## Resolution

**Decided:** option 1 now, since it is local and adds no lock. Option 2 follows with DEBT-502 item 2, which removes the cause. Test-first:
- the session gateway retries provisioning after a `40P01` and then serves the row, with one Clerk lookup;
- it does not retry any other database error;
- the six-request contract test passes in every one of 30 consecutive runs.

## Verification

- [x] The unit tests above fail before the fix and pass after it (2026-10-08: the retry test failed without the retry; the other-failure test passes either way, so a broad retry would fail it).
- [x] The six-request contract test passes 30 consecutive runs locally (2026-10-08, on `87f54f7a`; before the fix it failed in 7 of 20).
- [ ] No "Failed to ensure user row" event in Sentry for two weeks after the deploy.

## Related

- [BUG-320](./bug-320-first-pricing-render-user-upsert-race.md): the two-request race this extends.
- [DEBT-503](../debt/debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 1: whose contract test found it.
- [DEBT-502](../debt/debt-502-account-identity-and-action-hardening.md) item 2: the locked provisioning that removes the cause.
