# BUG-345: The Database Timeouts Do Not Apply Through Neon's Pooler

**Status:** Open — decide where the bounds are set so the pooler keeps them, prove them through a pooled connection, then read production again
**Priority:** P3
**Date:** 2026-10-16

---

## Summary

DEBT-447 (2026-07-21) gave every application session three database-side bounds:
- a statement may run 30 seconds;
- a lock wait may last 5 seconds;
- a transaction left idle is ended after 60 seconds.

They are sent as connection startup parameters. Neon's pooler drops startup parameters, so none of the three applies in production. Production runs with no statement timeout, no lock timeout, and Neon's own 5-minute limit on an idle transaction.

DEBT-524's assessment found this.

## Evidence

- **The code.**
  - `lib/db-connection-options.ts` defines `statement_timeout`, `lock_timeout` and `idle_in_transaction_session_timeout`, beside `TimeZone`.
  - `lib/db.ts` passes them as postgres.js's `connection` option, which postgres.js sends as startup parameters.
- **Production, read on 2026-10-16.**
  - The connection used production's `DATABASE_URL`, a pooled Neon host, with the same `connection` options.
  - Inside a read-only transaction, the session reported:
    - `statement_timeout` `0`;
    - `lock_timeout` `0`;
    - `idle_in_transaction_session_timeout` `5min`;
    - `TimeZone` `GMT`.
  - No table was read.
- **The Neon `dev` branch, through its pooled host, gave the same values** the same day.
- **The same mechanism, seen before.** On 2026-10-11, `default_transaction_read_only`, passed the same way, did not apply through production's pooled host.
- **Why the tests pass.** `tests/integration/db-connection-session.integration.test.ts` proves SQLSTATE `57014`, `55P03` and `25P03` against direct local Postgres, which accepts startup parameters. No test connects through a pooler.
- **A document says otherwise.** `docs/architecture/integrations/postgres.md` says the application session bounds "limit abandoned transactions, lock waits, and long-running statements". That is true locally and not in production.
- **Time zone.** `GMT` is the same offset as `UTC`, so dropping that parameter changes nothing today.

## Impact

- **Lock waits and statements have no database-side bound.**
  - A request whose statement waits on a lock waits until its function's `maxDuration` ends.
  - DEBT-447 found that whether that ends the backend statement is unverified.
  - Deadlocks are still detected: Postgres's deadlock check does not depend on these settings.
- **An abandoned transaction holds its locks** for up to 5 minutes, not 60 seconds.
- **The locks proposed elsewhere rely on bounded waits.** DEBT-502 item 2 serializes provisioning under the tombstone lock.
- **No incident is known.** Traffic is low, and every advisory lock is per user.

## Options

1. **Role-level defaults** (`ALTER ROLE … SET`), which a pooled session inherits.
   - An ordinary role can set its own defaults, so a reviewed migration could set them.
   - DEBT-447 rejected relying on role settings that were changed by hand and never verified. A migration plus a check through the pooled URL makes them repository-owned and verified.
   - The same role runs Drizzle Kit's migrations in the Vercel build, so a 5-second lock bound would also apply to migrations. DEBT-447 parked a migration lock bound separately (in Waiting). This needs a decision: either a migration fails fast on a lock, or migrations get a separate role or URL.
2. **`SET LOCAL` at the start of each transaction,** in the transaction wrappers.
   - It works through a transaction-mode pooler, and the repository owns it.
   - It covers only statements inside explicit transactions; reads outside one stay unbounded.
3. **Database-level defaults** (`ALTER DATABASE … SET`). These have the same reach and the same migration question as option 1, and need the database owner.

## Resolution

Not decided. Whatever is chosen:
- the test must prove each bound through a pooled connection, not only against direct Postgres;
- the Postgres integration document must state where the bounds are set.

## Verification

- [x] Production's effective values read read-only through its pooled URL (2026-10-16): `0`, `0` and `5min`.
- [ ] The chosen fix, red first, with each bound proved through a pooled connection.
- [ ] After promotion, production reports 30s, 5s and 60s through the pooled URL.

## Related

- DEBT-447 (closed): the bounds, and the parked migration lock bound.
- DEBT-524: the assessment that found this.
- DEBT-502 item 2: a lock that relies on bounded waits.
