# DEBT-391: Local E2E Needs a Full Schema-Drift Preflight

**Priority:** P2
**Created:** 2026-05-23
**Source:** Local authenticated E2E failed after SPEC-040 because the Neon `dev` branch behind `.env.local` had not been migrated to migrations `0017`/`0018`.
**Related:** [Deployment Environments](../../dev/deployment-environments.md), [Deployment Procedure](../../dev/deployment-procedure.md), [Testing Infrastructure](../../dev/testing-infrastructure.md), [SPEC-040](../specs/spec-040-omitted-exam-answer-scoring.md), [DEBT-390](./debt-390-omitted-exam-questions-recorded-as-unattempted-not-incorrect.md)

**Status:** **Resolved 2026-06-07.** Shipped as PR #408 (squash-merged to `main` as `6c2f9791`, then `dev` fast-forwarded). See Resolution below.

---

## Resolution (2026-06-07)

Shipped as **PR #408**, squash-merged to `main` as `6c2f9791` and fast-forwarded onto `dev`. CodeRabbit approved the exact head with zero unresolved threads.

- `tests/e2e/helpers/credential-health-check.ts`: added `verifyMigrationLedger(sql)` to `CredentialHealthCheckServices` + `defaultServices`, wired into the `database` validator **between** `checkDatabaseConnectivity(sql)` and `verifyIdempotencySchema(sql)` so a single Postgres connection covers connectivity → ledger drift → idempotency. It reads `db/migrations/meta/_journal.json` as the source of truth and compares journal `entries[].when` against `drizzle.__drizzle_migrations.created_at` (the same value Drizzle's migrator records). Pure helpers `computeMissingMigrations()` and `formatSchemaDriftMessage()` are separately unit-tested. A missing `drizzle` schema (`3F000`) or missing `__drizzle_migrations` table (`42P01`) is treated as drift (all journal tags missing), not an unhandled crash. Failures throw `E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS`, naming the missing migration tags with no `DATABASE_URL`, hostnames, passwords, or Drizzle `hash`.
- `tests/e2e/helpers/credential-health-check.test.ts`: added coverage for every acceptance criterion below — no missing migrations, missing ledger rows, absent schema, absent table, secret-free message formatting, and the connectivity → ledger → idempotency ordering on one shared connection.
- Gate green on Node 24: typecheck, lint, `pnpm test --run` (331 files / 2651 tests), and `pnpm build`. The change is test-helper-only — no production app code touched.

All Acceptance Criteria below were met.

---

## Problem

Local authenticated E2E can run against a database that is behind the checked-out migration journal.

The current local E2E path loads `.env.local`: `playwright.config.ts:4-7` says it prefers `.env.local` and then `.env`. The setup project runs before the Chromium project because `playwright.config.ts:24-34` declares the `setup` project and makes Chromium depend on it. The setup body is still the pre-mutation choke point: `tests/e2e/global.setup.ts:7-11` calls `runE2ECredentialHealthCheck()`, `seedTestSubscription()`, `runE2EUserStateReset()`, and `clerkSetup()`.

That preflight catches connectivity and one historical schema contract, but not full migration drift. `tests/e2e/helpers/credential-health-check.ts:141-149` verifies `SELECT 1`, `credential-health-check.ts:152-181` checks only whether `idempotency_keys.completed_at` exists, and `credential-health-check.ts:371-386` wires only those two database checks into the `database` validator. There is no comparison between `db/migrations/meta/_journal.json` and Drizzle's migration ledger table (`drizzle.__drizzle_migrations` for this repo's Postgres migrator), and no contract check for the current write-path tables.

SPEC-040 made this visible. Migration `db/migrations/0017_flaky_ser_duncan.sql:1-4` makes `attempts.selected_choice_id` nullable, adds `attempts.is_omitted`, and adds the two CHECK constraints. Migration `db/migrations/0018_backfill-omitted-exam-attempts.sql:2-42` backfills omitted-incorrect attempts where no session/question attempt exists. When local `.env.local` targeted the Neon `dev` branch before those migrations had been applied, pages and auth still loaded, but answer-submission E2E paths failed with a generic "Failed to insert attempt" instead of a targeted "this database is behind migrations" error. The live journal has since advanced through SPEC-041 (`db/migrations/meta/_journal.json:138-150` adds `0019_illegal_warbound` and `0020_fat_ironclad`), so the fix must compute missing migrations from the journal dynamically rather than hard-coding the SPEC-040 names.

CI did not catch this local drift because CI uses its own fresh Postgres service. `.github/workflows/ci.yml:35-38` sets a CI-local `DATABASE_URL`, `.github/workflows/ci.yml:105-109` runs `pnpm db:migrate` and `pnpm db:seed`, and `.github/workflows/ci.yml:189-193` runs `pnpm test:e2e` only after that setup.

---

## Why Existing Docs Were Not Enough

The source-of-truth docs already say the right operational rule. `docs/dev/deployment-environments.md:101-140` documents that missing migrations cause write failures and that the fix is running `pnpm db:migrate` against the exact target database. `docs/dev/deployment-procedure.md:8-16` states that Vercel deploys code only and does not run migrations or seeds. `docs/dev/deployment-procedure.md:40-45` makes target-environment migration a manual operator step, separate from CI.

The gap is automation and placement:

- Local E2E starts successfully even when the target database is behind the current migration journal.
- The failure appears later as an application write error, not as an environment/setup error.
- The quick E2E instructions historically listed credentials but did not force the operator to think about `.env.local` schema freshness.

---

## Required Remediation

Implement a local E2E schema-drift preflight before any mutating E2E setup runs.

The preflight should:

1. Read the expected migration list from `db/migrations/meta/_journal.json`, using `entries[].idx`, `entries[].tag`, and `entries[].when` as the source of truth.
2. Query `drizzle.__drizzle_migrations` on the active `DATABASE_URL`. This repo's `drizzle.config.ts:14-21` sets `schema`, `out`, `dialect`, and `dbCredentials` only, with no custom `migrationsSchema` or `migrationsTable`; `package.json:25` runs `db:migrate` as `drizzle-kit migrate`, so the Postgres ledger remains the Drizzle default `drizzle.__drizzle_migrations`.
3. Compare repo journal entries to ledger rows by numeric `entries[].when` (`db/migrations/meta/_journal.json`) and `created_at` (`drizzle.__drizzle_migrations`). The applied ledger table stores `id`, `hash`, and `created_at` (`bigint`), not the human-readable `tag`, so map any missing `when` values back to journal `tag` values for the error message.
4. Treat a missing `drizzle` schema or missing `drizzle.__drizzle_migrations` table as schema drift, not as an unexpected setup crash.
5. Fail fast when the target database is missing migrations present in the repo.
6. Print a clear, non-secret remediation message, such as:

```text
E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS
The database used by E2E is behind the repo migration journal.
Missing migrations: 0019_illegal_warbound, 0020_fat_ironclad.
For local runs, confirm .env.local points at the intended non-production database, then run: DATABASE_URL="<verified target>" pnpm db:migrate
```

This belongs in the E2E preflight path before `seedTestSubscription()` because `tests/e2e/global.setup.ts:7-11` currently calls the credential health check before seeding and user-state reset. Add the check to the database validator in `tests/e2e/helpers/credential-health-check.ts:371-386`, after `checkDatabaseConnectivity(sql)` and before `verifyIdempotencySchema(sql)`, so one Postgres connection covers connectivity, full ledger drift, and the historical idempotency-column contract. The check should be independently unit-tested alongside `tests/e2e/helpers/credential-health-check.test.ts`.

---

## Public-Safety Boundary

Do document environment roles, branch names such as Neon `main`/`dev`, and commands.

Do not commit:

- full `DATABASE_URL` values
- Neon endpoint hostnames
- database passwords
- account ids
- Vercel/Neon project ids
- Clerk or Stripe secrets

The existing environment docs intentionally follow this rule: `docs/dev/deployment-environments.md:5-7` says the repo records the contract while provider-specific private values stay in the providers.

---

## Acceptance Criteria

- `pnpm test:e2e` fails before the Playwright browser project when `.env.local` points at a database missing repo migrations.
- The failure message names the missing migration tags without printing credentials.
- A missing `drizzle` schema or missing `drizzle.__drizzle_migrations` table produces the same schema-drift error path, with migration tags derived from the repo journal.
- A fully migrated local E2E database continues through the existing credential, Stripe, Clerk, and reset checks.
- The check works for CI's fresh Postgres path as well as `.env.local`.
- The implementation preserves the rule that CI validates migrations on CI Postgres but does not migrate Vercel/Neon Preview or Production databases.
- Unit coverage proves at least these cases: no missing migrations, one or more missing `created_at` values, absent ledger table/schema, and error formatting that omits `DATABASE_URL`, hostnames, passwords, and Drizzle `hash` values.
