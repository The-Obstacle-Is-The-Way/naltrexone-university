# Integration Tests

**Last Updated:** 2026-09-24

Integration tests run against a real PostgreSQL database to verify repository queries, controller actions, and database constraints.

---

## Local Setup

From a fresh local test database, all four steps are required. Skipping any step causes test failures that look like real bugs but aren't.

### 1. Start the Test Database

```bash
pnpm db:test:up
```

This resolves the current clone's local test target, then runs Docker Compose with that target's project name and `DB_TEST_PORT`. Different clones get different Compose projects and host ports by default.

Readiness uses Compose `--wait --wait-timeout 60`; local E2E delegates to the same command and never migrates after a failed readiness check. There is no second Docker inspection/polling layer.

### Interrupted local E2E runs

On the supported macOS/Linux hosts, the orchestrator forwards `SIGINT`/`SIGTERM` to the active command's process groups, including Playwright's separately detached web server, then kills survivors after a two-second grace period. It snapshots descendant ancestry before signalling so a parent exiting early does not strand a server. An interruption is a failed run, never a successful setup. `reuseExistingServer: false` remains mandatory.

If process discovery itself fails, cleanup can still kill the known root group and reports the error; separately detached descendants cannot be discovered on that path. Use the same cwd-verified orphan check below before restarting.

Before another authenticated E2E run, check for running Playwright/`run-local-e2e` processes in every `naltrexone-university*` clone and wait if one is active (the provider user is shared). For a listener left by an uncatchable interruption such as `SIGKILL`, get this clone's app port from `pnpm exec tsx scripts/resolve-local-test-target.ts json`. Inspect it with `lsof -nP -iTCP:<resolved-app-port> -sTCP:LISTEN`, then check each candidate with `lsof -a -p <pid> -d cwd`. Terminate only a confirmed orphan whose cwd is this clone; never kill another clone's processes or use a blanket port kill.

### 2. Run Migrations

```bash
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
```

This applies migration files from `db/migrations/` in order, including extensions like `pgcrypto`. **Do not use `drizzle-kit push`** — it creates tables from the schema but skips migration files, so extensions and constraints defined in migrations will be missing (e.g., `pgcrypto` for `gen_random_uuid`).

### 3. Seed Test Data

```bash
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
```

Seeds question content and tags from `content/questions/`. Required for `tag-taxonomy-census.integration.test.ts` which validates that all tags have canonical kinds. Without seeding, that test file fails with `INTEGRATION_SEED_MISSING`.

CI seeds with `SEED_INCLUDE_PLACEHOLDERS=true`. Local integration tests pass with plain `pnpm db:seed`, but you can add the flag for exact CI seed parity:

```bash
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
```

### 4. Run Tests

```bash
pnpm test:integration
```

If the database is unreachable, the test setup fails fast with a clear error message and the exact commands to fix it.

### Live Stripe Provider Contracts (TEST Mode)

The ordinary integration lane remains provider-credential-free: with both `RUN_STRIPE_*` flags off, its eleven live Stripe cases are reported as skipped. To request all eleven cases explicitly, use the dedicated fail-closed entry point:

```bash
pnpm test:stripe-provider
```

The runner loads `.env.local` with `override: false`, so an explicitly exported value wins. It accepts only a non-dummy `sk_test_` key and non-dummy `price_` Price, runs the two provider files through `vitest.stripe-provider.config.mts` without database setup, injects both opt-in flags only into the bounded child, and rejects missing prerequisites, skips, partial results, malformed reports, timeouts, and non-passing cases. It preserves the POSIX process-group termination, parent-signal forwarding, and escalation contracts needed to clean up Vitest workers.

The success receipt is:

```text
[stripe-provider] PASS executed=11 passed=11 skipped=0
```

The 2026-09-25 PaymentMethod and Subscription-default run produced that exact receipt (10:21:44Z–10:23:03Z), after the eighth and ninth Checkout contract scenarios raised the requirement from nine cases. The customer Search runs earlier that day produced the nine-case receipt (07:56:32Z–07:57:33Z, 07:57:51Z–07:59:01Z, and 08:38:19Z–08:39:17Z after the shared-bound review correction), after the seventh scenario raised it from eight. The Subscription-cancel run earlier that day produced the eight-case receipt (00:13:39Z–00:14:19Z), the 2026-09-24 run the seven-case receipt at 16:53:58Z, and the 2026-08-26 activation run the six-case one. Any `PROVIDER_KEY_INVALID` or `PROVIDER_PRICE_INVALID` result is a configuration failure; do not treat it as an expected skip and do not use a live-mode key.

### One-Liner (Full Setup)

```bash
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)" && pnpm db:test:up && DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate && SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed && pnpm test:integration
```

### Reset (Nuclear Option)

If the database gets into a bad state:

```bash
pnpm db:test:reset
```

This runs `docker compose -p <resolved-project> down -v` and then starts the resolved `db` service again. You'll need to re-run migrations and seeding (steps 2-3) afterward.

---

## Port Configuration

| Environment | Port | How Set |
|-------------|------|---------|
| **Local** | Per-clone derived port | `scripts/resolve-local-test-target.ts` exports `DB_TEST_PORT` into `pnpm db:test:*` and local integration/E2E wrappers |
| **CI** | 5432 | GitHub Actions PostgreSQL service (`.github/workflows/ci.yml`) |

The committed `.env.test` file deliberately contains no `DATABASE_URL`. Local wrappers inject the resolver-owned target, and CI opts into its service target with `INTEGRATION_USE_EXISTING_DATABASE=true`. A raw Vitest invocation with no explicit database therefore fails closed instead of guessing a shared local target.

To use a named local target, set `LOCAL_TEST_INSTANCE` before starting Docker. To force a specific DB port, set `DB_TEST_PORT` and use `pnpm exec tsx scripts/resolve-local-test-target.ts database-url` when prefixing migration/seed commands. Do not edit committed `.env.test` just for a one-off local port.

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
| `tests/integration/controllers.integration.test.ts` | 4 | Question submission, exam finalization, and transactional rollback |
| `tests/integration/controllers-history.integration.test.ts` | 3 | Stats aggregation and attempted-question review queries |
| `tests/integration/controllers-webhooks.integration.test.ts` | 4 | Stripe subscription updates and Clerk deletion/idempotency cleanup |
| `tests/integration/container-stripe-wiring.integration.test.ts` | 3 | Container price configuration through real SDK/signature handling and Postgres; injected SDK use. Canned HTTP input is wiring-only, not provider parity. |
| `tests/integration/container-webhook-transaction.integration.test.ts` | 1 | Real repository overrides share the callback transaction; failed callbacks propagate their error and leave no event row. |
| `tests/integration/actions.stripe.integration.test.ts` | 2 | Stripe billing controller actions |
| `tests/integration/tag-taxonomy-census.integration.test.ts` | 4 | Tag taxonomy validation (requires seed data) |

---

## Troubleshooting

**"Cannot connect to test database"**

The test setup checks database connectivity before running any tests. If you see this error:

1. Is Docker running? Check with `docker ps`
2. Inspect the resolved target with `pnpm exec tsx scripts/resolve-local-test-target.ts env`
3. Is the Compose service running for that project? Check with `docker compose -p <COMPOSE_PROJECT_NAME> ps`
4. If not, restart: `pnpm db:test:up`
5. If the container exists but tables are missing: re-run migrations (see above)

**Stale containers on wrong ports/projects**

If you see an old Compose project, stop it with `COMPOSE_PROJECT_NAME=<old-project> docker compose down` or remove the specific container intentionally. Do not remove another clone's active project. Run `pnpm exec tsx scripts/resolve-local-test-target.ts env` to confirm the project for this clone, then `pnpm db:test:up`.

**Wrong DATABASE_URL (explicit passthrough only)**

Normal `pnpm test:integration` ignores an inherited `DATABASE_URL` and uses this clone's resolver-owned target, even when `CI` happens to be set. To intentionally use an existing database, opt in explicitly; remote targets also require the separate non-local override:

```bash
INTEGRATION_USE_EXISTING_DATABASE=true ALLOW_NON_LOCAL_DATABASE_URL=true DATABASE_URL="<verified-target>" pnpm test:integration
```

**Refused non-local DATABASE_URL**

`tests/integration/setup.ts` refuses to run against a non-local host by default. If `DATABASE_URL` points at Neon or any other remote host, the suite aborts before running tests. This is intentional protection against hitting shared environments by mistake.

Only combine `INTEGRATION_USE_EXISTING_DATABASE=true` and `ALLOW_NON_LOCAL_DATABASE_URL=true` when you explicitly intend to run against a non-local database and understand the risk.

**`drizzle-kit push` was used instead of `pnpm db:migrate`**

Symptoms: `pgcrypto` extension missing (`db.integration.test.ts` fails), `gen_random_uuid()` errors, or missing constraints. `drizzle-kit push` infers schema from TypeScript but does not run migration SQL files. Fix: reset and re-run migrations.

```bash
pnpm db:test:reset
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
```

**`tag-taxonomy-census` fails / `INTEGRATION_SEED_MISSING`**

The tags table is empty because `pnpm db:seed` was not run. See Step 3 above.

**Raw Drizzle Kit configuration reads `.env.local` first**

The supported `db:generate`, `db:migrate`, `db:studio`, and `db:seed` package entries refuse an implicit target and require an explicit `DATABASE_URL`; remote human targets also require the exact redacted `DB_TARGET_ACK` reported by the command. A raw dependency-CLI invocation loads `drizzle.config.ts` directly and can still resolve `.env.local`, so do not use it for repository work. Always prefix the supported package command with the resolver-selected test `DATABASE_URL` when targeting the local test database.
