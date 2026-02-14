# Integration Tests

**Last Updated:** 2026-02-14

Integration tests run against a real PostgreSQL database to verify repository queries, controller actions, and database constraints.

---

## Local Setup

### 1. Start the Test Database

```bash
pnpm db:test:up
```

This runs `docker compose up -d --wait`, which starts a PostgreSQL 16 container on port **5434** (the canonical local port).

### 2. Run Migrations

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:migrate
```

### 3. Run Tests

```bash
pnpm test:integration
```

If the database is unreachable, the test setup fails fast with a clear error message and the exact commands to fix it.

### Reset (Nuclear Option)

If the database gets into a bad state:

```bash
pnpm db:test:reset
```

This runs `docker compose down -v && docker compose up -d --wait` — destroys the volume and starts fresh. You'll need to re-run migrations afterward.

---

## Port Configuration

| Environment | Port | How Set |
|-------------|------|---------|
| **Local** | 5434 | `docker-compose.yml` default (`${DB_TEST_PORT:-5434}:5432`) |
| **CI** | 5432 | GitHub Actions PostgreSQL service (`.github/workflows/ci.yml`) |

The `.env.test` file (committed) hardcodes `localhost:5434`. CI overrides `DATABASE_URL` with its own service on port 5432.

To use a non-default local port, set `DB_TEST_PORT` before starting Docker and update `.env.test` to match.

---

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) spins up its own PostgreSQL 16 service container on every run. It does not depend on local Docker state. The pipeline runs:

1. `pnpm db:migrate` — applies migrations to the CI database
2. `pnpm db:seed` — seeds test data
3. `pnpm test:integration:coverage` — runs all integration tests with coverage

Integration tests are part of every PR and every push to `main`.

---

## Test Files

| File | Tests | What It Covers |
|------|-------|----------------|
| `tests/integration/db.integration.test.ts` | 4 | Schema constraints (pgcrypto, NOT NULL, foreign keys) |
| `tests/integration/repositories.integration.test.ts` | 39 | All Drizzle repository implementations |
| `tests/integration/controllers.integration.test.ts` | 5 | Controller → repository → DB round trips |
| `tests/integration/actions.stripe.integration.test.ts` | 2 | Stripe billing controller actions |

---

## Troubleshooting

**"Cannot connect to test database at localhost:5434"**

The test setup checks database connectivity before running any tests. If you see this error:

1. Is Docker running? Check with `docker ps`
2. Is the container on the right port? Should be `0.0.0.0:5434->5432/tcp`
3. If not, restart: `pnpm db:test:up`
4. If the container exists but tables are missing: re-run migrations (see above)

**Stale containers on wrong ports**

If you see a container on a port other than 5434, it may be from an old Docker Compose project. Stop it manually with `docker stop <name> && docker rm <name>`, then run `pnpm db:test:up` to start the correct one.

**Wrong DATABASE_URL (shell overrides .env.test)**

Integration tests load `.env.test` but do **not** override an already-set `DATABASE_URL` (this is required so CI can inject its own database URL). If your shell already exports `DATABASE_URL`, unset it or run tests with an explicit override:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm test:integration
```
