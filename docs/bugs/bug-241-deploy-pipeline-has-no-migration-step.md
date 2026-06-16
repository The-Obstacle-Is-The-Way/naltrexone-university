# BUG-241: Deploy Pipeline Has No Migration Step — Schema PRs Ship Code Without Applying Migrations (Green CI, Broken Runtime)

**Status:** Open — fix implemented in `vercel.json` (`buildCommand`); pending preview-deploy verification, then resolve + archive
**Priority:** P2 (systemic process/infra gap; latent outage for every schema-bearing PR; high blast radius)
**Date:** 2026-06-03
**Family:** CI/CD / deploy / migrations
**Related:** [BUG-240](../_archive/bugs/bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) (the first outage this gap produced; remediated and archived), [DEBT-391](../_archive/debt/debt-391-local-e2e-schema-drift-preflight.md) (resolved local/E2E migration-ledger drift primitive to reuse)

---

## Description

Applying migrations to deployed databases is currently a **manual, documented-but-unenforced** operator step. There is no automated deploy step that applies Drizzle migrations to the Vercel-targeted Neon branches, and nothing gates a deployment on the target database having the repo's migration journal applied. A PR can add a migration, pass all required CI, merge through the protected `main` flow, and deploy code that references a table or column that does not exist in the deployed database.

**The runbook is not the gap.** `docs/dev/deployment-procedure.md` §5 still tells operators to run `pnpm db:migrate` against the target deployed database when schema changes, and `docs/dev/deployment-environments.md` documents the exact symptom under **"Missing Database Migration Causes Silent Write Failures."** The gap is that the runbook step is not enforced by CI or Vercel.

[BUG-240](../_archive/bugs/bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) is the first confirmed outage from this class: SPEC-041's `question_feedback` table was present in repo migrations but had not been applied to deployed dev/preview or production databases before code reached those environments.

## Verified Evidence

| Claim | Verified artifact | Result / correction |
|---|---|---|
| CI uses throwaway Postgres, not a deployed Neon branch. | `.github/workflows/ci.yml:35-37` sets the CI job's local `DATABASE_URL`; `.github/workflows/ci.yml:20-28` defines the Postgres service. | Confirmed. Do not treat CI migration success as deploy-target migration. |
| CI proves migrations apply cleanly only against that throwaway DB. | `.github/workflows/ci.yml:105-106` runs `pnpm db:migrate`; `.github/workflows/ci.yml:108-111` seeds placeholder content. | Confirmed. |
| The GitHub `deploy` job does not deploy or migrate. | `.github/workflows/ci.yml:218-224` defines `deploy` and only echoes that Vercel Git integration handles production deploys. | Corrected from the prior stale deploy-job citation. |
| The package build path is only Next build. | `package.json:9-10` defines `build` as `next build`; `package.json:24-25` defines `db:migrate` as a separate manual script. | Confirmed. There is no package-level deploy hook. |
| Vercel cloud project currently has no Build Command override, Install Command override, or Ignored Build Step. | Redacted Vercel project metadata audit on 2026-06-16. | Confirmed without printing project identifiers, hostnames, or env values. Therefore Vercel currently falls back to the package build script. |
| Vercel has `DATABASE_URL` scoped in Production, Preview, and Development. | Redacted Vercel env metadata audit on 2026-06-16. | Confirmed presence only: one `DATABASE_URL` entry in each scope, with no git-branch-specific override observed. Exact Neon branch behind each value is operator-must-verify. |
| Vercel Build Step has scoped env available. | `lib/env.ts:101-118` documents `VERCEL_ENV` availability during the Build Step and function execution; `DATABASE_URL` is required by `lib/env.ts:38-40`. | Confirmed. A Vercel Build Command migration is viable from the repo's env-loading perspective. |
| The migration ledger table and comparison primitive already exist in test helpers. | `tests/e2e/helpers/credential-health-check.ts:161-174` has `computeMissingMigrations()`, `:176-180` has `formatSchemaDriftMessage()`, and `:200-238` has `verifyMigrationLedger(sql)`. | Confirmed. Reuse this shipped primitive for the drift gate instead of inventing a second comparison. |
| The ledger comparison is precise. | `tests/e2e/helpers/credential-health-check.ts:205-214` queries `drizzle.__drizzle_migrations.created_at`; `db/migrations/meta/_journal.json:4-152` stores journal `entries[].when`; `drizzle.config.ts:14-21` leaves Drizzle migration schema/table defaults in place. | Confirmed. Compare journal `entries[].when` to `drizzle.__drizzle_migrations.created_at`, then map missing `when` values back to journal tags for messages. |
| Local test DBs are isolated from deploy DBs. | `scripts/e2e-local-orchestrator.ts:65-94` starts, migrates, seeds, and runs E2E against a resolver-scoped Docker target; `scripts/resolve-local-test-target.ts:32-39` derives per-worktree local DB ports from base `55400`; `docker-compose.yml:13` keeps `5434` only as the raw Compose fallback when `DB_TEST_PORT` is unset. | Corrected from stale fixed-local-port wording. CI still uses service port `5432`; normal local wrappers use resolver-scoped Docker targets. |
| No PR-template checkbox exists today. | `.github/` currently contains only `dependabot.yml` and `workflows/ci.yml`. | Confirmed. Any PR-template attestation would have to be created as implementation work; it is not an existing control. |

## Deployment Topology

Disambiguate the three "dev" surfaces:

| Surface | Source | Database target contract | Migration behavior today |
|---|---|---|---|
| Local app runtime | Local checkout with `.env.local` | Expected to match Vercel Development and the Neon `dev` branch. Exact provider target is operator-must-verify before any mutation. | Manual when intentionally targeting this database. |
| Local integration / normal local E2E | Local checkout via `scripts/resolve-local-test-target.ts` | Resolver-scoped Docker Postgres, never a deployed Neon branch unless the operator explicitly opts into an existing database. | E2E wrapper starts, migrates, and seeds automatically; integration wrapper uses the resolver-scoped local target. |
| CI | GitHub Actions `test` job | Throwaway Postgres service on the CI runner. | CI runs `pnpm db:migrate` and seed against the throwaway DB only. |
| Git `dev` branch / feature branches | Vercel Preview | Expected shared non-production Neon `dev` branch DB. Vercel Preview `DATABASE_URL` presence is verified; exact branch target is operator-must-verify. | No deploy migration step today. |
| Vercel Development env | `vercel env pull` / local Vercel development scope | Expected shared non-production Neon `dev` branch DB. Vercel Development `DATABASE_URL` presence is verified; exact branch target is operator-must-verify. | No deploy migration step today. |
| Git `main` branch | Vercel Production | Expected Neon `main` branch DB. Vercel Production `DATABASE_URL` presence is verified; exact branch target is operator-must-verify. | No deploy migration step today. |

`main` is protected by an active GitHub `main-protection` ruleset requiring PRs and the `test` status check before merge. The local `origin/dev` and `origin/main` refs currently have identical trees, although `main` has merge commits on top of `dev`. Any fix must preserve this protected-main flow and must not rely on bypassing it.

## Root Cause

- **CI migrates only a throwaway DB.** `.github/workflows/ci.yml:105-106` runs `pnpm db:migrate` with the CI-local `DATABASE_URL` from `.github/workflows/ci.yml:35-37`. It proves the migration files apply; it never touches Vercel Preview, Vercel Development, or Vercel Production databases.
- **The GitHub `deploy` job is a no-op placeholder.** `.github/workflows/ci.yml:218-224` only emits a message that production deployment is handled by Vercel Git integration. It cannot block Vercel's git-triggered deployment with a migration.
- **Vercel currently builds only the app.** The Vercel project has no Build Command override, no Install Command override, and no Ignored Build Step. With `package.json:9-10`, the build is `next build`; with `package.json:24-25`, `pnpm db:migrate` remains a separate manual script.
- **The docs rely on human memory.** The current deployment runbook correctly describes manual migration, but the merge/deploy path does not enforce it.

## Fix (Implemented)

The fix is **Vercel release-phase migration in the Build Command**, configured in `vercel.json` as the project `buildCommand`:

```bash
pnpm db:migrate && pnpm build
```

This is set as `buildCommand` in `vercel.json` (overriding Vercel's default `next build`), so it applies to Production and Preview builds. It is live on Preview/Development builds immediately and on Production once this change is on `main`. The Install Command is left unset, and no Ignored Build Step is configured, so every deploy build runs the migration; if an ignore rule is ever added it must explicitly refuse to skip builds when `db/migrations/**` or `db/schema.ts` changes.

This mechanism is the accepted fix because Vercel already owns the traffic switch for both Preview and Production git deployments. Running `pnpm db:migrate` in the Vercel Build Command uses the environment-scoped `DATABASE_URL` that Vercel injects for the build, applies migrations to the same Neon branch the deployment will use, and fails the deployment closed before the new build can serve traffic if migration fails. The mechanism works in the Vercel build because `drizzle-kit` is installed for the build and `drizzle.config.ts` loads env files with `override: false`, so Vercel's injected environment-scoped `DATABASE_URL` wins over local file fallbacks. GitHub Actions cannot currently provide that ordering because the existing `deploy` job does not trigger or block Vercel's git integration.

Required implementation constraints:

1. Use the Vercel-scoped `DATABASE_URL` for the build target. **Verified 2026-06-16** by a value-free Vercel host comparison (booleans only; no connection strings or hostnames recorded): the **Production** `DATABASE_URL` host is distinct from **Preview** and **Development**, and Preview and Development share one non-production host. A Preview or Development build therefore migrates the shared non-production (Neon `dev`) database, never production — the catastrophic failure mode (a Preview build resolving to the production database) is ruled out. Re-run the same value-free host comparison if Vercel env scoping or the Neon integration is ever reconfigured.
2. Never use `drizzle-kit push` in any environment. Use checked-in migration files only.
3. Treat migrations as forward-only. Additive migrations are the norm; destructive changes must use expand/contract so the currently served deployment remains compatible if the migration succeeds but a later build step fails.
4. Rely on Drizzle's migration ledger for idempotency. Re-runs must be no-ops when `drizzle.__drizzle_migrations.created_at` already contains the journal `entries[].when` values.
5. Accept the concurrency caveat explicitly: all Preview builds use the shared Neon `dev` branch, so every Preview build can attempt the same pending migration; two quick `main` merges can also run two Production builds against Neon `main`. Recorded migrations prevent normal double-apply on rerun, but there is no repo-verified global lock across concurrent Preview or Production builds. This is acceptable only with the forward-only/additive and idempotent rules above.
6. Keep the protected-main flow intact: PR → required `test` check → merge to `main` → Vercel Production build runs migration, then build.

### Floor Fallback

If the Build Command migration cannot be enabled immediately, the minimum acceptable fallback is a **required deploy-target drift gate** that reuses the DEBT-391 helper primitive:

- Read expected migrations from `db/migrations/meta/_journal.json`.
- Query the target database's `drizzle.__drizzle_migrations.created_at`.
- Use `computeMissingMigrations()` and `formatSchemaDriftMessage()` from `tests/e2e/helpers/credential-health-check.ts` rather than writing a second comparison.
- Fail closed when any journal `entries[].when` value is missing from the target ledger.
- Print only missing migration tags and remediation text; never print `DATABASE_URL`, hostnames, passwords, Drizzle hashes, or provider identifiers.

This floor detects drift but does not apply migrations. It is a stopgap until the Vercel Build Command migration exists, not the final fix.

### Rejected Alternatives

- **GitHub Actions `deploy` job migration as the primary fix.** Rejected because Vercel's git integration deploys independently on `main` pushes. The current GitHub `deploy` job cannot order a migration before Vercel serves traffic, and adding deploy DB secrets to GitHub would increase secret surface without solving Preview/Production ordering.
- **Drift gate as the primary fix.** Rejected because it only detects pending migrations. It still leaves a human to apply them and would preserve the exact manual step that caused BUG-240. It is acceptable only as the floor fallback above.
- **PR-template checkbox / CI annotation as the floor.** Rejected as the enforcement floor because no PR template exists today, a checkbox does not inspect the target database, and human attestation is the weakest control for a step already known to be skipped. A template may be added later as supplemental release hygiene, but it cannot close BUG-241.
- **Keep the manual runbook only.** Rejected because the current runbook already existed when BUG-240 occurred.

## Verification

- [x] Vercel Project Build Command is set to `pnpm db:migrate && pnpm build` for git-triggered Preview and Production builds (set as `buildCommand` in `vercel.json`; live on Preview immediately, on Production when merged to `main`).
- [x] Redacted provider audit confirms `DATABASE_URL` is present in Production, Preview, and Development scopes (verified 2026-06-16); a value-free host comparison confirmed Production is isolated from the shared Preview/Development non-production host, with no connection strings or hostnames recorded.
- [ ] A throwaway additive migration on a test branch is not servable before migration: the Preview build either applies and records it before `pnpm build`, or fails closed before the deployment reaches READY.
- [ ] Re-running the same Vercel build or redeploy is idempotent: Drizzle sees the matching `drizzle.__drizzle_migrations.created_at` values and does not re-apply already-recorded migrations.
- [ ] A deliberately invalid migration fails the Vercel build before the new deployment serves traffic.
- [ ] The floor drift gate, if implemented before the Build Command change, reports missing tags by comparing `db/migrations/meta/_journal.json` `entries[].when` to `drizzle.__drizzle_migrations.created_at` without logging secrets or hostnames.
- [x] `docs/dev/deployment-procedure.md` and `docs/dev/deployment-environments.md` consistently state the Vercel Build Command migration is the deploy contract, with `pnpm db:seed` and any out-of-band migration remaining the documented manual fallback.
- [x] [BUG-240](../_archive/bugs/bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) remediation is complete so the live regression is closed independently of this gate.

## Surfaces Confirmed

- Migration files exist under `db/migrations/`, and the repo journal is `db/migrations/meta/_journal.json`.
- CI applies the current migration journal to a throwaway Postgres service.
- The migration-ledger comparison primitive shipped with resolved [DEBT-391](../_archive/debt/debt-391-local-e2e-schema-drift-preflight.md).
- This remains an infra/process bug. No `src/**` change is required to specify the fix.

## Operator-Must-Verify Facts

- **Resolved 2026-06-16** (was a hard precondition before implementation): a value-free Vercel host comparison confirmed the Production `DATABASE_URL` host is distinct from Preview/Development and that Preview and Development share one non-production host, so production is isolated from preview/development builds. The literal Neon branch *names* (`main` for production, `dev` for the shared non-production branch) are confirmable in the Neon/Vercel dashboards but are not safety-critical given the verified isolation. Re-verify with the same value-free comparison if Vercel/Neon scoping is reconfigured.
- Whether Preview Deployment Protection beyond Git fork protection is enabled. The available redacted Vercel protection metadata exposed Git fork protection, but not a clear Preview Standard Protection boolean.
