# BUG-240: SPEC-041 Question Feedback Is Dead End-to-End — Migrations 0019/0020 Never Applied to Dev/Prod DB

**Status:** Resolved (migrations applied to dev/prod and verified; archived 2026-06-03)
**Priority:** P0 (core new feature was 100% non-functional in every running environment)
**Date:** 2026-06-03
**Family:** Schema / migrations / deploy rollout
**Resolution State:** Root cause remediated 2026-06-03 — schema migrations `0019`/`0020` applied to both deployed databases (dev/preview Neon `dev` branch + production Neon `main` branch) and verified read-only (table + 3 enums + indexes; `drizzle.__drizzle_migrations` head `0020`). Dev confirmed end-to-end (persisted `report`/`"test"` row). PR #391 merged after CodeRabbit and green CI; the remaining systemic migration-enforcement gap stays open as BUG-241.
**Related:** [BUG-241](../../bugs/bug-241-deploy-pipeline-has-no-migration-step.md) (systemic cause — manual, unenforced migrate-on-deploy step), SPEC-041 ([docs/_archive/specs/spec-041-question-feedback.md](../specs/spec-041-question-feedback.md))

> **Update 2026-06-03 (fix applied):** This was a textbook instance of the documented known gotcha [deployment-environments.md → "Missing Database Migration Causes Silent Write Failures"](../../dev/deployment-environments.md). Both deployed DBs were migrated with the official migrator and verified:
> - **dev/preview (Neon `dev` branch, host `ep-still-frog-…`)** — used by local `pnpm dev`, the Vercel Preview deployment, and the `…aqc6vir8n…` deployment URL. Verified end-to-end: 6 `question_feedback` rows persisted post-migration, including a `report` row with comment `"test"`.
> - **production (Neon `main` branch, host `ep-withered-cell-…`, separate Vercel Production `DATABASE_URL`)** — read-only confirmed absent (head `0018`), migrated, re-verified (table + 3 enums present, head `0020`); pulled prod secrets wiped.

---

## Description

The SPEC-041 question-feedback feature (the "Was this a good question?" 👍/👎 row and the "Give feedback" report dialog) fails on **every interaction** in the running app. The user sees a red **"Couldn't save rating"** the instant they click a thumb; the optimistic UI flips then snaps back.

The feature code, tests, and migration **files** are all correct and merged. The defect is operational: **database migrations `0019_illegal_warbound` (the `question_feedback` table + enums) and `0020_fat_ironclad` (FK-path indexes) were committed to git but never applied to the database the running app actually connects to.** The table and its enum types do not exist on the dev DB, so every write (rate / report) and every read (rating hydration) throws at the database boundary.

This is **not mode-specific.** Because the entire table is absent, it fails identically in quick practice, tutor, exam, and the standalone question page. One fix (apply the migrations to each environment) repairs all surfaces at once.

## Evidence (read-only DB introspection — 2026-06-03)

Connected to the `DATABASE_URL` in `.env.local` (the DB `pnpm dev` and `lib/db.ts:8` use) and ran read-only catalog lookups:

| Object | Expected | Found on dev DB |
|---|---|---|
| `public.question_feedback` table | exists | **null (absent)** |
| `public.question_feedback_kind` enum | exists | **null (absent)** |
| `public.question_feedback_rating` enum | exists | **null (absent)** |
| `public.question_feedback_category` enum | exists | **null (absent)** |
| Last applied migration (`drizzle.__drizzle_migrations`) | `0020` (ts `1780410037334`) | **`0018` (ts `1779498169302`)** |

The newest migration recorded as applied on the dev DB is `0018_backfill-omitted-exam-attempts`. Migrations `0019` (ts `1780352345440`) and `0020` (ts `1780410037334`) — both present in `db/migrations/meta/_journal.json` — are **not** recorded as applied. The schema objects they create are absent. This is conclusive.

## Steps to Reproduce

1. Run the app against the dev DB (`pnpm dev`, which resolves `DATABASE_URL` from `.env.local`).
2. Sign in as an entitled user and open any question review surface (quick practice shown in the report; tutor / exam / question page behave identically).
3. Click 👍 or 👎 under "Was this a good question?".
4. Observe the optimistic selection flip, then revert, with red **"Couldn't save rating"** text appearing.
5. (Corroboration) Check the client error reporter / Sentry — there is a stream of `INTERNAL_ERROR` events from the feedback path, because the hydration `getQuestionRating` call on load also fails against the missing table and is reported via `reportClientError` (`app/(app)/app/practice/hooks/use-practice-question-feedback.ts:109,126`).

## Root Cause

Tracer-bullet path (write side, rating):

1. Client `rateQuestionForQuestion(...)` calls the `rateQuestion` server action and, on `!result.ok`, rolls the rating back and sets status `'error'` → renders "Couldn't save rating" ([question-feedback-actions.ts:74-86](../../../app/(app)/app/shared/question-feedback-actions.ts#L74)).
2. `rateQuestion` action passes auth + rate-limit, then calls `rateQuestionUseCase.execute(...)` ([question-feedback-controller.ts:124-161](../../../src/adapters/controllers/question-feedback-controller.ts#L124)).
3. The use case calls `repo.record(event)` → `db.insert(questionFeedback)…returning()` ([drizzle-question-feedback-repository.ts:20-33](../../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L20)).
4. Postgres rejects the insert with `undefined_table` (SQLSTATE `42P01`) because `public.question_feedback` does not exist on this DB.
5. The repository catches and wraps it: `throw new ApplicationError('INTERNAL_ERROR', 'Failed to insert question feedback', undefined, { cause })` ([drizzle-question-feedback-repository.ts:34-41](../../../src/adapters/repositories/drizzle-question-feedback-repository.ts#L34)).
6. `createAction` converts the thrown `ApplicationError` into `{ ok: false, error: { code: 'INTERNAL_ERROR' } }`, which the client treats as a save failure.

The hydration (read) side fails the same way: `getQuestionRating` → `findLatestRatingByUser` → `INTERNAL_ERROR 'Failed to load latest question rating'` against the same missing table.

**Why it happened (the real root cause):** applying migrations to the deployed databases is a **documented manual operator step that was skipped** for SPEC-041. The runbook exists and even names this failure:
- `deployment-procedure.md` §5 Pre-Deployment Checklist, item: *"If schema changed: `pnpm db:migrate` run against the target deployed database **immediately after deploy** (forgetting this causes silent write failures)."* This step was not performed for SPEC-041's dev/preview **or** production DBs.
- `deployment-environments.md` documents the exact symptom under **"Missing Database Migration Causes Silent Write Failures"** (pages load, auth works, writes fail with generic Internal error).
- Nothing automated covers the gap: CI (`.github/workflows/ci.yml:106`) migrates only a **throwaway CI Postgres** (`…localhost:5432/addiction_boards_test`, line 37); the `deploy` job (`ci.yml:206-212`) only `echo`s; Vercel build runs `next build` — **no `db:migrate`**. Local/integration tests migrate the local :5434 DB, so everything stayed green and masked the omission.
- Environment→DB mapping (`deployment-procedure.md` §4): **Preview/Development → Neon `dev` branch**; **Production → Neon `main` branch** (separate Vercel-scoped `DATABASE_URL`s — confirmed via `vercel env ls`). So dev and prod must each be migrated explicitly.

The step being **manual and unenforced** (not undocumented) is the systemic issue, filed separately as [BUG-241](../../bugs/bug-241-deploy-pipeline-has-no-migration-step.md).

## Impact

- **Dev environment: confirmed broken.** Every rate/report/hydrate against the dev DB fails. The flagship SPEC-041 feature is 100% non-functional for anyone hitting the dev DB.
- **Production: presumed broken (must verify before and as part of the fix).** Prod is served by the same pipeline with no auto-migrate, so unless someone manually migrated prod, the `question_feedback` table is absent there too. This MUST be verified read-only against the prod `DATABASE_URL` before concluding — do not assume either way.
- No data loss and no corruption: every write is rejected atomically by Postgres; no partial rows are created. This is a pure availability failure of the new feature, not a data-integrity bug. The rest of the app is unaffected (no other code path depends on `question_feedback`).

## Expected Fix (do it the proper way — no shortcuts)

Apply the **committed migration files** to each environment with the official migrator, in order, recorded in `drizzle.__drizzle_migrations`:

```bash
# PROPER — runs 0019 then 0020 from db/migrations, transactionally, and records them.
# Set DATABASE_URL EXPLICITLY to the exact target. Verify the host first.
DATABASE_URL="<target-env-connection-string>" pnpm db:migrate
```

Hard rules for this fix:
- **NEVER `drizzle-kit push`.** It diffs live schema and bypasses the migration files (can miss `pgcrypto`/`gen_random_uuid()`, CHECK constraints, partial indexes) and does not record migration history. The repo bans it (`CLAUDE.md` → Integration Test DB; AGENTS.md).
- **Always prefix the exact `DATABASE_URL`.** Without it, drizzle reads `.env.local` (dev) — fine for dev, dangerous if you intend prod. Verify the resolved hostname before running (`new URL(url).hostname`).
- **Migrate dev and prod separately and explicitly**, each with its own connection string. Confirm `.env.local` is non-production before relying on it.
- The migrations are **additive and forward-only** — `CREATE TYPE` (3 enums), `CREATE TABLE question_feedback`, FK constraints, and `CREATE INDEX`. No destructive operations, no mutation/backfill of existing rows. Risk is low, but it still mutates a shared remote DB, so it requires explicit owner sign-off before running (per `seed-content-gitignored` memory / AGENTS.md: never migrate remote without explicit OK).

Recommended order:
1. **Verify** (read-only) dev and prod for the table + last-applied migration (same catalog lookups as the Evidence section).
2. With owner OK, `DATABASE_URL=<dev> pnpm db:migrate`. Re-verify the table/enums now exist and last-applied = `0020`.
3. Smoke-test the live feature against dev (rate + report + hydrate succeed).
4. Repeat verify → migrate → re-verify → smoke-test for **prod**.
5. Land [BUG-241](../../bugs/bug-241-deploy-pipeline-has-no-migration-step.md) so future schema PRs cannot ship without their migrations.

## Verification

- [x] Read-only catalog check confirms `question_feedback` table + 3 enums **absent** on dev before the fix (done 2026-06-03 — see Evidence).
- [x] After `DATABASE_URL=<dev> pnpm db:migrate`: `to_regclass('public.question_feedback')` non-null, all 3 enums exist, both CHECK constraints + 7 indexes present, and `drizzle.__drizzle_migrations` head = `0020` (ts `1780410037334`). Verified 2026-06-03 against Neon `dev` branch host `ep-still-frog-…-pooler.c-3.us-east-1.aws.neon.tech`.
- [x] Live smoke test on dev/preview: 👍/👎 persists, retract works, "Give feedback" report submits. Confirmed by read-back: 6 `question_feedback` rows persisted incl. `report`/`other`/comment `"test"`.
- [x] **Production (Neon `main` branch) — DONE 2026-06-03:** read-only confirmed table absent (host `ep-withered-cell-…`, head `0018`) → `DATABASE_URL=<prod via vercel env pull> pnpm db:migrate` → re-verified table + 3 enums present, head `0020`; pulled prod secrets wiped.
- [x] Post-merge repository state verified: PR #391 merged, dev/main aligned, and the `.env.local` target DB still reports `question_feedback` + all 3 enums + 7 indexes with migration head `0020`.
- [ ] Client error reporter / Sentry shows the `INTERNAL_ERROR` feedback-path stream stops (operator to confirm in dashboard; expected now both DBs are migrated). Recommend a prod smoke-test (rate + report on the production alias).
- [ ] [BUG-241](../../bugs/bug-241-deploy-pipeline-has-no-migration-step.md) enforcement landed so this cannot silently recur.

## Surfaces Confirmed Clean (deliberately NOT filed as bugs)

- **Feature code and tests are correct.** Domain model, controller, repository, hooks, and UI are all sound and fully covered; the failure is purely the un-applied migration. No code change is required to fix this bug.
- **Observability works.** The hydration failure is reported via `reportClientError`, so operators have a signal — this is not a silent-telemetry bug.
- **No mode-specific defect.** The table being absent fails all modes identically; there is no separate tutor/exam bug to file from this symptom.
