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
