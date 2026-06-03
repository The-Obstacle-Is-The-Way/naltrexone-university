# BUG-241: Deploy Pipeline Has No Migration Step — Schema PRs Ship Code Without Applying Migrations (Green CI, Broken Runtime)

**Status:** Open
**Priority:** P2 (systemic process/infra gap; latent outage for every schema-bearing PR; high blast radius)
**Date:** 2026-06-03
**Family:** CI/CD / deploy / migrations
**Related:** [BUG-240](./bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) (the first outage this gap produced)

---

## Description

Applying migrations to the deployed databases is a **manual, documented-but-unenforced** operator step. There is no automated step that applies Drizzle migrations to the dev or production database on deploy, and nothing *gates* a deploy on migrations having been applied. As a result, a PR can add a migration, pass all of CI, merge, and deploy code that references a table/column that does not exist in dev/prod — with a fully green pipeline.

**The documentation is not the gap.** The runbook already exists and even names this exact failure:
- `docs/dev/deployment-procedure.md` §5 Pre-Deployment Checklist requires *"If schema changed: `pnpm db:migrate` run against the target deployed database immediately after deploy (forgetting this causes silent write failures)."*
- `docs/dev/deployment-environments.md` documents the symptom under **"Missing Database Migration Causes Silent Write Failures."**

The gap is that this is a **human checklist item with no automated enforcement** — exactly the kind of step that gets skipped under delivery pressure. [BUG-240](./bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) is the first confirmed outage from skipping it (SPEC-041's `question_feedback` table was never applied to dev/prod). Adjacent: [DEBT-391](../debt/debt-391-local-e2e-schema-drift-preflight.md) (local/e2e schema-drift preflight) is related drift-detection momentum that could be extended to deploy.

## Root Cause

- **CI migrates only a throwaway DB.** `.github/workflows/ci.yml:106` runs `pnpm db:migrate`, but `DATABASE_URL` for that job is the ephemeral CI Postgres `postgresql://postgres:postgres@localhost:5432/addiction_boards_test` (`.github/workflows/ci.yml:37`). It proves the migrations *apply cleanly*; it never touches dev or prod.
- **The deploy job is a no-op placeholder.** `.github/workflows/ci.yml:206-212` (`deploy`) only runs `echo "Production deploy is handled by Vercel Git integration on main."`. There is no `db:migrate` invocation against any real environment.
- **Vercel build does not migrate.** Production is built via Vercel Git integration running `next build` (`package.json` `build` script). There is no `predeploy`/`postinstall`/build hook that runs `pnpm db:migrate`. (`package.json` has only `db:migrate` as a manual script; no deploy wiring.)
- **Net effect:** applying migrations to dev/prod is an undocumented, manual, easily-forgotten human step. Local/CI tests migrate their own local DBs (:5434 / CI :5432), so they stay green and hide the omission until a user hits the live feature.

## Impact

- Every PR that adds a migration is a latent dev/prod outage that CI cannot detect.
- The failure mode is invisible until a user exercises the new schema in the running app (exactly how [BUG-240](./bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) surfaced).
- Risk scales with migration cadence and with how decoupled the code deploy is from the schema change.

## Expected Fix (options — pick per ops constraints; do it safely)

The goal: **a schema change cannot reach users before its migration is applied**, and the application is automated rather than relying on memory. Candidate approaches, roughly in order of robustness:

1. **Release-phase migration in the deploy pipeline.** Add an explicit, authenticated `pnpm db:migrate` step against the real target DB as part of the deploy (e.g. a Vercel deploy hook / GitHub Actions `deploy` job step that holds the prod `DATABASE_URL` as a secret), gated to run **before** the new code serves traffic. Forward-only, additive migrations make this safe for the common case; expand-then-contract for breaking changes.
2. **Pre-deploy migration gate / check.** A required step that verifies the target DB's `drizzle.__drizzle_migrations` head matches the repo's newest journal entry, failing the deploy if migrations are pending. (Detects drift even if step 1 isn't adopted.)
3. **Surface the existing runbook at the point of decision.** The release checklist already exists (`deployment-procedure.md` §5) but lives in a doc nobody opens at merge time. Add a **PR-template checkbox** that triggers when `db/migrations/` changed ("schema migration applied to dev/preview AND production after deploy"), and/or a CI warning that fails/annotates a PR touching `db/migrations/` until a human attests the deploy-time migration. This converts the forgettable checklist item into an in-flow gate. (This is the floor; options 1–2 are the durable fix.)

Whichever is chosen:
- **Never `drizzle-kit push`** in any environment — migration files only, recorded in `drizzle.__drizzle_migrations`.
- Migrations must run with an **explicit, host-verified `DATABASE_URL`** per environment, never implicit `.env.local` resolution for prod.
- Keep migrations **forward-only and additive** where possible; use expand/contract for destructive changes so code and schema can deploy independently.

## Verification

- [ ] A deliberately-added test migration on a throwaway branch is *not* deployable to a target environment without the migration being applied (the gate fails closed), OR the release-phase step applies it automatically and records it.
- [ ] Re-running the chosen mechanism is idempotent (no error when migrations are already applied).
- [ ] `docs/dev/` documents the mechanism and the manual fallback (host-verified explicit `DATABASE_URL`, never `push`).
- [ ] [BUG-240](./bug-240-question-feedback-migrations-not-applied-to-dev-prod.md) remediation (dev + prod migrated) is complete so the live regression is closed independently of this gate.

## Surfaces Confirmed

- The migration **files** themselves are correct and apply cleanly (CI proves this against its ephemeral DB). The gap is strictly *where* `db:migrate` is (not) run, not *what* it would do.
- This is an infra/process bug, not an application code bug; no `src/**` change is required to close it.
