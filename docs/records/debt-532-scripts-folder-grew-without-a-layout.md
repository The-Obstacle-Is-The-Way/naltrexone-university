# DEBT-532: The Scripts Folder Grew Without a Layout, So Its Tools Repeat Each Other and Some Fail Open

**Status:** Open — owner reviews the proposals; then the defects in items 1–8 first, each red first in its own pull request
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`scripts/` holds 150 files: 76 scripts and modules, 65 tests and test helpers, and 9 fixtures. Forty-eight of the 76 sit flat in the root, beside four subfolders (`ci/`, `content-release/`, `internal/`, `seed/`). Twelve concerns share the folder. The folder had no inventory and no layout rule. `scripts/README.md` now holds the inventory, which `tests/scripts-directory.test.ts` checks. This record holds the work the audit found.

Most scripts earn their place: no platform feature replaces them (see What Stays a Script, below). The debt is in how they grew:

- **Defects.** Eight, from a dormant production-content hazard to a merge-guard command that reports success when mistyped (items 1–8).
- **Duplicated building blocks.** Eight GitHub CLI wrappers, three issue adapters, four process spawners, five loopback checks and 33 copies of the direct-run guard.
- **Mixed responsibilities.** Five files of 590 to 1,004 lines each do several jobs.
- **Misplaced modules.** Test-only code in `scripts/`, release commands in `seed/`, and two folders that depend on each other.
- **Scripts standing in for configuration.** A hand-built CI database, a laptop-run production seed, and a test runner that re-implements its Vitest config.

## Evidence

The audit read every file, traced every caller (package scripts, workflows, `vercel.json`, documents and imports), and reran each defect below at the source on 2026-10-18.

### Defects

1. **The production seed inherits the shell's `SEED_INCLUDE_PLACEHOLDERS`.**
   - `seedDatabase` copies the whole `process.env` into the child seed and removes only `DB_TARGET_ACK` (`seed-environment-runtime.ts:122-133`).
   - `runSeed` reads the variable itself (`seed.ts:14`).
   - All 10 committed placeholder questions are `status: published`.
   - So if an operator's shell exports `SEED_INCLUDE_PLACEHOLDERS=true`, `pnpm db:seed:prod` publishes the synthetic questions to production and skips their archival. Several guides show the variable, though inline rather than exported.
   - Fix: make `includePlaceholders` a parameter of `runSeed`; the environment seeds pass `false`. BUG-351 owns the seed's input freshness, not this.
2. **The direct-run guard reports success when the path omits its extension.**
   - `pnpm exec tsx scripts/merge-reviewed-pr` exits 0 and prints nothing, while the `.ts` form exits 1 with its usage error. `pnpm exec tsx scripts/next-record-id debt` likewise prints nothing and exits 0.
   - The guard compares `import.meta.url` with `process.argv[1]`, which differ when the extension is left off. Thirty-three files copy it, in three variants.
   - `verify-lockfile-union.ts:3-5` already avoids the problem by running unconditionally.
   - Node's `import.meta.main` is not a fix here: it is `undefined` for a `.ts` file under `tsx`, because this package declares no module type (measured on Node 24.21).
   - Fix: one shared entry helper that resolves the executed path, extension included, before comparing. Add package scripts for the hand-run commands (the merge guard, the promotion verifier, the record ID), so documents stop naming file paths.
3. **The lockfile union check rejects its own guide's single-source procedure in the expected case.**
   - Step 6 of `docs/guides/dependencies/updating-dependencies.md` says to pass the base again as a second source for a single-source bundle. The check requires two sources (`lockfile-union.ts:441`).
   - When pnpm reproduces the source lockfile exactly, which is the hoped-for result, the duplicate-candidate refusal (`:562-569`) exits 2: "a bundle must combine its sources". Reproduced with the repository's fixtures.
   - Every Dependabot pull request is now re-authored as a bundle, so a single source is common.
   - Fix: accept one source, and keep the duplicate refusal only where it adds information.
4. **Three record checks are never asserted on the live tree.**
   - `documentation-archive.ts` computes `malformedLedgerLines`, `invalidStatus` and `invalidQueueReview`, but only its command line fails on them, and nothing runs that command.
   - `tests/documentation-archive.test.ts` and `tests/documentation-records.test.ts` assert every other field of the live audit. So a malformed ledger line or an unknown status passes `pnpm test`.
   - Fix: one list of blocking findings that the command and the live-tree test share.
5. **`verify-migration-ledger.ts` hides its own usage and target errors.**
   - With no `DATABASE_URL` it prints only `Migration ledger verification failed.` (catch at `:55-58`).
   - Those messages carry no credentials by design (`database-target.ts`). Only driver errors need the generic line.
6. **`upstream-fix-watch.ts:149` builds the npm registry path as if every package were scoped.**
   - An unscoped package would request the wrong path and fail every run.
   - Dormant: its one watch is scoped. The advisory watch builds the path correctly.
7. **Two alert issues have no assignee.**
   - `operational-alert-watcher.ts:341` and `documentation-due-checks.ts:121` create issues without one.
   - The other alert jobs assign the repository owner, because only an assignee is notified whatever their watch settings (`github-alert-issues.ts:108-109`). The operational watcher's issue is the backstop for alert delivery itself.
8. **The placeholder archiver rewrites rows that are already archived.**
   - Its `UPDATE` (`seed/placeholder-archiver.ts:35-42`) has no status filter. Every run without placeholders rewrites `updated_at` and reports the fixtures archived again.
   - `docs/architecture/content-pipeline.md:609` says a rerun "writes nothing".

Smaller defects, each a short fix:

- `import-draft-questions.ts` ignores unknown flags, so a mistyped `--dry-run` performs a real write. Every other content command throws on an unknown argument.
- `seed/withdraw-questions.ts`'s dry run skips the writes. Every release command's dry run runs the real transaction and rolls it back (`content-release/command-support.ts`), so a constraint failure appears only with `--apply`.
- `tests/integration/setup.ts` compares a URL's hostname with `'::1'`, but `URL.hostname` is `[::1]`, so it refuses an IPv6 loopback URL.
- `docker-compose.yml` publishes the test database on every interface (`'${DB_TEST_PORT:-5434}:5432'`), while the pooler binds `127.0.0.1`.
- `migration-ledger.ts` prefixes every error code `E2E_PREFLIGHT:`, though it now gates every Vercel deploy.
- `fixtures/trial-clock-smoke-report-passed.json` declares 11 tests and holds 14 results. It has been hand-edited for each added case.

### Duplication

- **GitHub.**
  - Eight files each wrap `execFileSync('gh', …)`: the merge guard, the promotion verifier, the learnings review, the release watch, the alert-issue helper, the security.txt job, the advisory watch and the fix watch.
  - Three modules adapt GitHub issues with three listing strategies (`github-alert-issues.ts`, `security-txt-renewal.mts`, `upstream-advisory-watch.mts`), and three test fakes are each named `MemoryIssues`.
  - The root cause: a `.mts` script that a workflow runs with plain `node` cannot import a `.ts` helper.
- **Entry points.** Thirty-three copies of the direct-run guard (item 2). The scheduled jobs each wrap their run in their own try-report-exit block, with different rules for what an error prints.
- **Processes.** Four spawners: `database-process.ts`, `runProcess` in `seed-environment-runtime.ts`, `spawnCommand` in `e2e-local-orchestrator.ts`, and the process tree in `run-stripe-provider-contracts.ts`. The last two manage process groups and have diverged.
- **Database targets.**
  - Five loopback checks disagree: `database-target.ts`, `e2e-local-orchestrator.ts`, `tests/shared/resolve-integration-database-url.ts`, `tests/integration/setup.ts` and `tests/integration/helpers.ts`.
  - Two rules decide whether a command may touch a remote database. `DB_TARGET_ACK` names the exact hosts; the boolean `ALLOW_NON_LOCAL_DATABASE_URL` admits any host for the E2E passthrough and the integration helpers. `AGENTS.md` states only the first.
- **Human and managed database paths.**
  - Eleven files carry one policy:
    - `database-command.ts` and `internal/database-command-managed.ts` share their body;
    - the managed authorizer is a one-line alias;
    - each `db-*.ts` entry point and its `internal/run-managed-db-*.ts` twin differ only in the authorizer.
  - The rule that only automation reaches the managed path rests on its file path. A source scan of four files checks it (`database-command.test.ts`).
- **Content.**
  - The seed writer and the release builder each insert questions and compare tags. The release-entries query appears twice.
  - Six command parsers are written by hand, and five files define `CommandIo`.
  - "Placeholder" is defined three ways: by glob, by folder and prefix, and by exact slug list (BUG-315 came from such a split).
  - `draft-question-import.ts` re-declares choice rules, difficulty and labels that `lib/content/schemas.ts` and the domain already own.
- **Commands.**
  - `seed-all-environments.ts` and `seed-production.ts` share their whole `main`.
  - The merge guard and the promotion verifier repeat argument checks, the green-checks predicate and the merge call.
  - `next-record-id.ts` restates the records paths and ledger pattern that `documentation-archive.ts` exports.
  - `coderabbit-learnings-review.ts` sets `HOLD_DAYS = 30` beside `.coderabbit.yaml`'s `approval_delay: 30`, and nothing ties the two together.

### Mixed Responsibilities

- **`merge-reviewed-pr.ts` (843 lines).** It mixes GitHub reads, push dating, check policy, approval and carry policy, the decision, learnings links and the command line. `verify-promotion.ts` imports it as a library, and its tests split three ways partly to stay under Biome's 800-line warning.
- **`documentation-archive.ts` (784 lines).** It mixes Markdown scanning, status parsing, the records lifecycle, link audits, file discovery and an unused command line. Its name predates the archive's removal.
- **`upstream-advisory-watch.mts` (1,004 lines).** It holds eight jobs: the dependency map, manifest and lockfile readers, npm resolution, three GitHub adapters, a range evaluator, and policy with orchestration. Its four test files already split along those lines.
- **`e2e-local-orchestrator.ts`.** It holds the E2E plan and the general command runner that `db:test:*` and `test:integration` also use. Those commands log `[local-e2e]`. It also spawns `run-local-test-db.ts` as a child that resolves the target again, which is how BUG-329 arises.
- **`content-release/release-activation.ts` (592 lines).** `activateRelease` computes and applies a plan in about 275 lines.

### Placement

- **Test-only modules.** `rule-to-test-register.ts`, `documentation-asset-budget.ts` and the link half of `documentation-archive.ts` serve only tests. The convention for such modules is `tests/*-source-scan.ts`.
- **Misplaced tests.** `validate-header-safe-secret.test.ts` holds the only unit tests of `src/adapters/shared/header-secret.ts`. `migration-ledger.ts`'s tests live in `tests/e2e/helpers/`.
- **Test-only production code.** `choiceIdByLabel` in `seed/question-revision-writer.ts` is used only by `tests/shared/question-fixtures.ts`.
- **Repository policy in script suites.** Script suites pin `package.json`, workflow and `vercel.json` contents: `e2e-local-orchestrator.test.ts`, `database-command.test.ts` and `check-clerk-jwt-key.test.ts` (which repeats `vercel.test.ts`). These pins belong in `tests/`.
- **Content files in the wrong folder.**
  - `seed-helpers.ts` sits in the root but serves only `seed/`, and it repeats `lib/content`'s newline normalization.
  - `seed/withdraw-questions.ts` is a release-style operator command inside `seed/`.
  - `seed/` and `content-release/` import from each other, so neither can change alone.
- **Content logic outside the architecture.** The read side of ADR-021 and ADR-022 lives in `src/`. Their write side (revisions, withdrawals, holds, activation) lives entirely in `scripts/` as Drizzle code with no ports. DEBT-531's two owners of hold scope are one symptom.

### Candidates to Delete

| What | Why | Before deleting |
| --- | --- | --- |
| `validate-header-safe-secret.ts` | No caller since `0ba85539` (2026-09-19) removed its CI step. The secret-rotation procedure never calls it, `openssl rand -hex` output is header-safe, and both cron handlers validate the secret on every request. | Move its `validateHeaderSecret` tests to `src/adapters/shared/`. The owner decides, because `docs/architecture/environments.md` keeps it as an operator tool. |
| `db-generate.ts` | It guards a command that never connects: `drizzle-kit generate` reads only schema files (`docs/architecture/integrations/postgres.md:73`). It exists because `drizzle.config.ts` throws without `DATABASE_URL` and falls back to `.env.local` and `.env`. | Change `drizzle.config.ts` to pass credentials only when `DATABASE_URL` is set, and to load no dotenv file. Confirm that `drizzle-kit generate` accepts that config. |
| `validateSeedQuestionTags` in `seed/tag-manager.ts`, and its five tests | It re-checks rules `QuestionFrontmatterSchema` has already applied by the time it runs, so it appears unreachable. | Show that no input passes the schema and fails the validator. |
| `fixtures/trial-clock-smoke-report-passed.json` and `-mixed-failure.json` | The test already builds reports from the case titles. The mixed-failure file exercises only the first gate. | Keep `-skipped.json` as the one real-shape sample. |
| The `documentation-archive.ts` command line and its spawn tests | Nothing runs it. | Item 4 first, so its findings stay asserted. |
| Dead exports | `resolveLocalE2EDatabaseUrl`, `formatMigrationContentDriftMessage` and `documentationLinks` have no caller outside their own file and tests. The `E2E_INSTANCE` and `E2E_APP_PORT` aliases have no user. | None. |
| `prepare-seed-corpus.ts` and the environment seeds | They exist because production content comes from a laptop's drafts folder. | BUG-351 Part 3 and DEBT-483's bootstrap. |
| `upstream-fix-watch.ts` and its workflow | Its only watch is DEBT-500's. | DEBT-500 closes with no other watch added. |

### Scripts Standing In for Configuration

- **CI's database.**
  - `ci/start-postgres.sh` rebuilds `docker-compose.yml`'s `db` service by hand: the same environment and health check, plus a poll that `docker compose up --wait` already does. It also forces `ci.yml` to `docker network connect` the container for PgBouncer.
  - After BUG-352 closes: give `db` the `${…_IMAGE_REPOSITORY}@sha256:` form `pgbouncer` already uses, pull it with `ci/pull-image.sh`, and start both with `docker compose up -d --wait --pull never`. CI and local then share one database definition.
- **The production seed.**
  - `db:seed:prod` runs from a laptop. It pulls each environment's `DATABASE_URL` through a pinned Vercel CLI (`59.16.0`), reads the operator's untracked drafts (BUG-351), and leaks the shell environment into the child (item 1).
  - Target: a manually dispatched GitHub Actions job in a protected Environment, with the owner as required reviewer and the database URL as an environment secret. It checks out the content at a pinned commit and runs `stage-release`, then a second approval-gated job runs `activate-release`.
  - It would carry out BUG-351 Part 3 and DEBT-483's bootstrap. Keep the laptop path until then.
- **The migrate path.**
  - Vercel runs the ledger check before and after the managed migrate (`vercel.json`). CI and local E2E run the managed migrate bare.
  - So the ledger pre-check first meets real Postgres in a Vercel Preview build, against the rule that production runs the path the tests run.
  - Fix: one managed migrate command that checks, migrates and checks again, used by all three.
- **The Stripe provider lane.**
  - `run-stripe-provider-contracts.ts` overrides its config's 10-second timeout with `--testTimeout=20000`, repeats the config's file list, and hand-builds a process tree to run Vitest and parse its JSON.
  - A custom Vitest reporter in `vitest.stripe-provider.config.mts` could fail on any skipped or missing case. The package script then becomes `vitest run --config …`, bounded by the job's timeout.
  - Each fail-closed case must carry over.
- **The integration lane.** `run-local-integration.ts` does not start, migrate or seed its database, though the E2E command does, so `AGENTS.md` carries a five-command recipe. Prepare the database as E2E does, with an opt-out for quick reruns.
- **The merge guard (owner decision).**
  - Nothing technically blocks the merge button; the guard is a convention.
  - A workflow could run the same check on pull-request, review and CI events, and post a commit status the ruleset requires.
  - Cost: Actions time on every review event, and a broken guard blocks every merge.

### What Stays a Script

The audit looked for a platform feature to replace each of these and found none:

- **The merge guard and the promotion verifier.** Rulesets cannot require a bot's approval of the exact head, carry an approval across an unchanged diff, apply ADR-020's exemption, require linked learnings, or prove each source pull request was reviewed (ADR-024).
- **The lockfile union check.** pnpm and git merge drivers produce a lockfile; neither proves it is the union of its sources.
- **The advisory watch.** Dependabot, `pnpm audit`, OSV and Renovate read the reviewed advisory database, which DEBT-509 measured missing advisories and lagging (`docs/policies/supply-chain.md`).
- **The operational alert watcher.** On Sentry's current plan, nothing alerts on a muted monitor, alert-rule drift or a silent alert path, and Vercel's equivalents need Pro.
- **The release watch.** No platform alerts on a push that never got checks or a deployment that was never created, and Hobby crons run only daily.
- **The learnings review.** CodeRabbit sends no notice when it records a learning.
- **The CRAP report and the mutation integrity check.** Codecov has no complexity metric, and Stryker's only gate is the score threshold that ADR-019 rules out.
- **`ci/install-playwright-chromium.sh` and `ci/scan-playwright-output.ts`.** Browser caching does not cover the system packages, and GitHub does not scan artifacts for credentials.
- **`resolve-local-test-target.ts`.** Compose cannot derive per-clone ports.
- **`security-txt-renewal.mts`.** A hard expiry test cannot give 90 days' notice without failing unrelated pull requests. It should still be rebuilt on the shared issue helper.

## Impact

- **Live risk:**
  - a dormant path for synthetic questions to reach production (item 1);
  - a mistyped merge-guard command that reads as a pass (item 2);
  - a dependency procedure that fails in its common case (item 3);
  - record checks the tests do not enforce (item 4).
- **Cost:**
  - eight GitHub wrappers to keep in step;
  - eight test files that mock `node:child_process` because no runner is injected;
  - a 48-file root that hides twelve concerns;
  - documents that call scripts by path: about 20 name `resolve-local-test-target.ts`, so every move edits them.

## Options

- **A. Fix the defects only.** Cheap, but the duplication keeps growing with each new script.
- **B. In order: defects, shared building blocks, deletions, the layout one family at a time, then the configuration replacements.** Each step is a small pull request, and the directory test keeps the README true across every move. Recommended.
- **C. One reorganization.** Rejected: it would invalidate the file and line evidence in BUG-351 and DEBT-531, which cite about 40 locations in `seed/` and `content-release/`, and it would touch every guide in one review.

## Resolution (decided)

Pending the owner's review. Recommended: option B, in this order.

1. **Defects 1–8, then the smaller defects.** Each is fixed red first, in its own pull request.
2. **Package scripts for every hand-run command.** Documents switch to them, so later moves change only `package.json`.
3. **Shared building blocks in `scripts/lib/`:**
   - one `gh` runner, and one issue transport with two lifecycles (one issue per condition, one per event);
   - the entry helper from item 2;
   - one process runner;
   - one loopback check.

   Plain-`node` scripts get these through `.mts` modules and `allowImportingTsExtensions`, or by moving those jobs to `tsx`. Choose one runtime for all scheduled jobs.
4. **The deletions above, once each precondition holds.**
5. **The layout, one family per pull request, with its README rows:**

   ```text
   scripts/
     lib/           shared building blocks (step 3)
     db/            target, command, migrate, seed, studio, migration ledger; managed/ for automation
     deploy/        the Clerk key and server-action manifest checks
     local-test/    target, database, integration, e2e, command plan, Stripe provider lane
     ci/            image pull, Chromium install, output scan
     content/       source/, drafts/, store/, seed/ (with environments/), release/
     feedback/      the feedback export
     release/       merge guard, promotion verifier, diff hunks, CodeRabbit, release watch
     dependencies/  lockfile union and its fixtures
     records/       record ID, records lifecycle, due checks
     watchers/      alert issues, operational, advisory, upstream fix, security.txt
     quality/       CRAP report, mutation integrity
   ```

   In `content/`, `seed/` and `release/` depend on `store/` and never on each other. Content moves wait for BUG-351 and DEBT-531.
6. **The splits.** The merge guard goes in its own pull request with its tests unchanged. Then `documentation-archive.ts` (records lifecycle in `scripts/records/`, links in a `tests/` source scan), then the advisory watch.
7. **The configuration replacements:**
   - Compose for CI's database, after BUG-352;
   - one managed migrate with ledger checks;
   - the Stripe reporter;
   - `drizzle.config.ts`;
   - the dispatched seed job, with BUG-351 Part 3.
8. **Later, after BUG-351 and the bootstrap.** The content write side moves behind ports into `src/application` and `src/adapters`, with the planner in `src/domain`, leaving thin commands here.

## Verification

- [ ] Items 1–8 fixed, each with a test that failed first.
- [ ] Every hand-run command has a package script, and no guide names a script's path where one exists.
- [ ] One `gh` runner and one issue transport, and no test mocks `node:child_process`.
- [ ] The deletions done, or declined by the owner with the reason recorded here.
- [ ] The layout complete, with `tests/scripts-directory.test.ts` green after each move.
- [ ] Each configuration replacement merged, or declined with its reason.

## Related

- **Content writers.** BUG-351 owns the planner and input freshness, DEBT-531 normalization and hold scope, and DEBT-483 the bootstrap.
- **Scripts touched by open records:**
  - BUG-329: the local target that changes in child processes;
  - BUG-352: CI's image registries;
  - DEBT-500: the upstream fix watch;
  - DEBT-505: the operational watcher;
  - DEBT-509: the advisory watch;
  - DEBT-523: the release watch.
- **Decisions.** ADR-023 (a list kept in a document needs a test); ADR-024 (review, merge and promotion); ADR-025 (test doubles); ADR-019 (quality reports).
