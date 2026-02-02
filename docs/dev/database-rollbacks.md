# Database Rollbacks (Drizzle Migrations)

This project uses Drizzle Kit migrations (`db/migrations/*.sql`). These migrations are **forward-only**.

## Why There Are No “Down” Migrations

- Drizzle Kit generates *up* migrations, but does not generate or run *down* migrations.
- In practice, “down” migrations are risky in production (data loss, long locks, partial rollbacks).

## Production Rollback Strategy

Preferred order of operations:

1. **Fix forward**: ship a new migration that corrects the schema.
2. If you must roll back a deployment quickly:
   - **Roll back the application code** (redeploy the previous version).
   - If the schema change is incompatible with the previous code, use **database point-in-time recovery (PITR)** or restore a snapshot (provider-specific).

Notes:

- Always treat rollbacks as an incident response procedure (confirm impact, communicate, and capture a postmortem).
- Assume schema rollback can cause data loss; verify with stakeholders before restoring.

## Local / Test Database

For local integration testing, prefer recreating the database state:

- `pnpm db:test:reset` (Docker Postgres on port 5434)
- `pnpm db:migrate`

