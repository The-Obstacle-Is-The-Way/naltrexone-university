# Integration Tests

**Last Updated:** 2026-03-17

Integration tests run against a real PostgreSQL database to verify repository queries, controller actions, and database constraints.

---

## Local Setup

From a fresh local test database, all four steps are required. Skipping any step causes test failures that look like real bugs but aren't.

### 1. Start the Test Database

```bash
pnpm db:test:up
```

This runs `docker compose up -d --wait`, which starts a PostgreSQL 16 container on port **5434** (the canonical local port).

### 2. Run Migrations

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:migrate
```

This applies migration files from `db/migrations/` in order, including extensions like `pgcrypto`. **Do not use `drizzle-kit push`** — it creates tables from the schema but skips migration files, so extensions and constraints defined in migrations will be missing (e.g., `pgcrypto` for `gen_random_uuid`).

### 3. Seed Test Data

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:seed
```

Seeds question content and tags from `content/questions/`. Required for `tag-taxonomy-census.integration.test.ts` which validates that all tags have canonical kinds. Without seeding, that test file fails with `INTEGRATION_SEED_MISSING`.

CI seeds with `SEED_INCLUDE_PLACEHOLDERS=true`. Local integration tests pass with plain `pnpm db:seed`, but you can add the flag for exact CI seed parity:

```bash
SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:seed
```

### 4. Run Tests

```bash
pnpm test:integration
```

If the database is unreachable, the test setup fails fast with a clear error message and the exact commands to fix it.

### One-Liner (Full Setup)

```bash
pnpm db:test:up && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:migrate && SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:seed && pnpm test:integration
```

### Reset (Nuclear Option)

If the database gets into a bad state:

```bash
pnpm db:test:reset
```

This runs `docker compose down -v && docker compose up -d --wait` — destroys the volume and starts fresh. You'll need to re-run migrations and seeding (steps 2-3) afterward.

---

## Port Configuration

| Environment | Port | How Set |
|-------------|------|---------|
| **Local** | 5434 | `docker-compose.yml` default (`${DB_TEST_PORT:-5434}:5432`) |
| **CI** | 5432 | GitHub Actions PostgreSQL service (`.github/workflows/ci.yml`) |

The `.env.test` file (committed) hardcodes `localhost:5434`. CI overrides `DATABASE_URL` with its own service on port 5432.

To use a non-default local port, set `DB_TEST_PORT` before starting Docker and override `DATABASE_URL` on the command line when running migrations/tests. Do not edit committed `.env.test` just for a one-off local port.

---

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) spins up its own PostgreSQL 16 service container on every run. It does not depend on local Docker state. The pipeline runs:

1. `pnpm db:migrate` — applies migrations to the CI database
2. `SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed` — seeds test data, including placeholder content used by CI parity checks
3. `pnpm test:integration:coverage` — runs all integration tests with coverage

Integration tests are part of every PR and every push to `main`.

---

## Test Files

| File | Tests | What It Covers |
|------|-------|----------------|
| `tests/integration/db.integration.test.ts` | 4 | Schema constraints (pgcrypto, NOT NULL, foreign keys) |
| `tests/integration/question-repository.integration.test.ts` | 13 | DrizzleQuestionRepository CRUD + candidate filters |
| `tests/integration/session-attempt-repository.integration.test.ts` | 19 | DrizzlePracticeSessionRepository + DrizzleAttemptRepository lifecycle |
| `tests/integration/bookmark-repository.integration.test.ts` | 1 | DrizzleBookmarkRepository idempotent add/remove |
| `tests/integration/stripe-repositories.integration.test.ts` | 5 | Stripe customer, event, and subscription repos |
| `tests/integration/user-repository.integration.test.ts` | 7 | DrizzleUserRepository upsert + clock-guard semantics |
| `tests/integration/idempotency-key-repository.integration.test.ts` | 4 | DrizzleIdempotencyKeyRepository claim/store/reclaim |
| `tests/integration/rate-limiter.integration.test.ts` | 1 | DrizzleRateLimiter sliding window |
| `tests/integration/tag-repository.integration.test.ts` | 1 | DrizzleTagRepository ordered listing |
| `tests/integration/bug-regression.integration.test.ts` | 10 | Bug regression tests (BUG-186, 187, 188, 192, 195) |
| `tests/integration/controllers.integration.test.ts` | 10 | Controller → repository → DB round trips |
| `tests/integration/actions.stripe.integration.test.ts` | 2 | Stripe billing controller actions |
| `tests/integration/tag-taxonomy-census.integration.test.ts` | 4 | Tag taxonomy validation (requires seed data) |

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

**Refused non-local DATABASE_URL**

`tests/integration/setup.ts` refuses to run against a non-local host by default. If `DATABASE_URL` points at Neon or any other remote host, the suite aborts before running tests. This is intentional protection against hitting shared environments by mistake.

Only use `ALLOW_NON_LOCAL_DATABASE_URL=true` when you explicitly intend to run against a non-local database and understand the risk.

**`drizzle-kit push` was used instead of `pnpm db:migrate`**

Symptoms: `pgcrypto` extension missing (`db.integration.test.ts` fails), `gen_random_uuid()` errors, or missing constraints. `drizzle-kit push` infers schema from TypeScript but does not run migration SQL files. Fix: reset and re-run migrations.

```bash
pnpm db:test:reset
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:migrate
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/addiction_boards_test pnpm db:seed
```

**`tag-taxonomy-census` fails / `INTEGRATION_SEED_MISSING`**

The tags table is empty because `pnpm db:seed` was not run. See Step 3 above.

**`drizzle.config.ts` reads `.env.local` first**

`drizzle-kit` commands without an explicit `DATABASE_URL` prefix will use `.env.local`, which points to your remote Neon database — not the local test container. Always prefix drizzle-kit and db:migrate/db:seed commands with the test DATABASE_URL when targeting the local test DB.
