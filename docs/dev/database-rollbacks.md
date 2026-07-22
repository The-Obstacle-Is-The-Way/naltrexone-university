# Database Rollbacks (Drizzle Migrations)

This project uses Drizzle Kit migrations (`db/migrations/*.sql`). These migrations are **forward-only**.

Before authoring or reviewing a schema change, apply the N-1 and expand/contract
rules in [Migration Authoring → Deployed-Code Compatibility](./migration-authoring.md#deployed-code-compatibility).

## Why There Are No “Down” Migrations

- Drizzle Kit generates and applies forward migrations only.
- In production, rollback migrations are risky because they can lose data, hold locks for a long time, or only partially reverse the system state.

## Production Rollback Strategy

Preferred order of operations:

1. **Fix forward** by shipping a new migration.
2. If you must revert the app quickly, roll back application code first.
3. If old code is incompatible with the migrated schema, use provider-level recovery such as PITR or snapshot restore.

Treat schema rollback as incident response work, not a routine deploy step.

## Neon Instant Restore: Recovery-Point Loss and Reconciliation

**RPO warning:** [Neon Instant Restore](https://neon.com/docs/introduction/branch-restore)
is a complete overwrite, not a merge or refresh. The selected root branch's
schema and data are replaced by the chosen historical state, and every change
after that recovery point is excluded. The operation applies to every database
on the branch and temporarily interrupts connections.

Before restoring:

1. Record the target root branch, incident start, proposed timestamp/LSN, and
   the write window that will be lost. Ordinary child branches do not support
   Instant Restore.
2. Use Neon **Time Travel Assist** to run read-only queries at the proposed
   point and confirm both the data and schema are the intended recovery state.
3. Pause or hold unsafe billing retries and other non-idempotent operator work
   until the post-restore idempotency state is understood.

Neon automatically preserves the target branch's final pre-restore state in a
separate root backup branch named `{branch_name}_old_{head_timestamp}`. Keep
that branch available while reconciling post-point writes; it is the source for
diffing state that the overwrite removed. The restored target keeps its
connection details, but existing connections are interrupted and must recover.

After the restore, reconcile by operation rather than assuming provider retry
queues will reconstruct acknowledged work:

- Compare the backup branch with restored `users`, `practice_sessions`,
  `practice_session_question_states`, and `attempts`; restore or replay valid
  post-point user/practice writes deliberately.
- Compare `stripe_customers` and `stripe_subscriptions` with current Stripe
  customer/subscription state. Run and review the Stripe subscription
  reconciler before reopening normal billing operations.
- Audit `stripe_events` and `clerk_events` against retained Stripe and Clerk
  provider event history. Use provider-supported manual resend/replay only
  after determining whether the local effect and ledger row survived.
- Reconcile pending cleanup state, especially
  `pending_stripe_cancellations` and `deleted_clerk_users`, against both the
  provider and the backup branch so lost obligations are re-enqueued once.
- Diff `idempotency_keys` before retrying any application or billing command.
  A rewound key can make an already-completed operation executable again; hold
  unsafe billing retries until the local key, Stripe idempotency result, and
  provider event history agree.

The restore exercise itself remains OWNER-GATED: validate these steps only in a
disposable non-production Neon project on its root branch, and never turn the
exercise into a repository script or run it against Production as part of a
fix wave.

## Local / Test Database

For local integration testing, prefer recreating the database state:

```bash
pnpm db:test:reset
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
```

Notes:

- `pnpm db:test:reset` restarts the resolved Docker Compose Postgres service. It does **not** read `DATABASE_URL`.
- Drizzle commands such as `pnpm db:migrate` and `pnpm db:seed` **do** read `DATABASE_URL`, so prefix them explicitly when targeting the local test database.
- After a reset, rerun both migrations and seed data before running `pnpm test:integration`.
