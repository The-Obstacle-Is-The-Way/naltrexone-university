# DEBT-532: The Scripts Folder Grew Without Shared Building Blocks or a Layout

**Status:** Open — owner reviews the proposals; its four defects are BUG-353 to BUG-356
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`scripts/` holds 150 files: 76 scripts and modules, 65 tests and test helpers, and 9 fixtures. Forty-eight of the 76 sit in the root, beside five subfolders (`ci/`, `content-release/`, `fixtures/`, `internal/`, `seed/`), and its README sorts them into thirteen families. The folder grew one script at a time, with no shared building blocks and no layout rule. `scripts/README.md` now holds the inventory, and `tests/scripts-directory.test.ts` checks it.

Most scripts earn their place: the audit found no platform feature that replaces them (see What Stays a Script, below). The debt is in how they are built:

- **Shared building blocks are missing,** so each script rebuilds its own: GitHub CLI calls, issue handling, the direct-run guard, child processes, database-target rules and argument parsing. Several small defects are symptoms of that.
- **Some files do several jobs.**
- **Some modules sit in the wrong place.**
- **Some scripts stand in for configuration.**
- **Some code is dead.**

The same review found four defects that stand on their own, filed separately: BUG-353 (placeholders reaching the production seed), BUG-354 (scripts that exit 0 without running), BUG-355 (the lockfile union check) and BUG-356 (the records tests). The review's method and coverage are in its pull request.

## Evidence

### Missing Shared Building Blocks

- **Entry points.**
  - Thirty-five copies of the direct-run guard (BUG-354), with four error policies:
    - most print the message;
    - `merge-reviewed-pr.ts`, `verify-promotion.ts` and `documentation-archive.ts` let a stack trace through;
    - `export-question-feedback.ts` prints the whole error object;
    - `verify-migration-ledger.ts` prints one fixed line for every error.
  - That fixed line hides the ledger check's own usage and target errors: with no `DATABASE_URL` it prints only `Migration ledger verification failed.` (catch at `:55-58`). Those messages carry no credentials; only driver errors need the generic line.
- **GitHub.**
  - Eight files each wrap `execFileSync('gh', …)`, and three modules adapt GitHub issues:
    - `github-alert-issues.ts` uses GitHub's search;
    - `security-txt-renewal.mts:83-88` and `upstream-advisory-watch.mts:639-644` read the repository's whole issue and pull-request list on every run, which the search in `github-alert-issues.ts:117-118` was written to avoid. The advisory watch does so every three hours.
  - Three test fakes are each named `MemoryIssues`.
  - The two `.mts` jobs run under plain `node` with no install. They could import a `.ts` helper only by its full `.ts` name, which `tsconfig.json` does not allow today, and only one that uses nothing from `node_modules`. So each carries its own copy.
- **Alert assignees.**
  - Three jobs open issues with no assignee:
    - the operational watcher (`operational-alert-watcher.ts:341`);
    - the records due check (`documentation-due-checks.ts:121`);
    - the security.txt job (`security-txt-renewal.mts:133-134`).
  - The advisory watch assigns only urgent issues. The other jobs assign the owner, because only an assignee is notified whatever their watch settings (`github-alert-issues.ts:108-109`).
  - Delivery works today through the owner's watch settings and mail filter (DEBT-505), so this is hardening.
- **The npm registry path.** `upstream-fix-watch.ts:149` builds the registry path as if every package were scoped, while the advisory watch has a correct version. It is dormant, because the one watch is scoped.
- **Processes.** Four spawners:
  - `database-process.ts`;
  - `runProcess` in `seed-environment-runtime.ts`;
  - `spawnCommand` in `e2e-local-orchestrator.ts`;
  - the process tree in `run-stripe-provider-contracts.ts`.

  The last two manage process groups and have diverged.
- **Database targets.**
  - Five loopback checks disagree: `database-target.ts`, `e2e-local-orchestrator.ts`, `tests/shared/resolve-integration-database-url.ts`, `tests/integration/setup.ts` and `tests/integration/helpers.ts`.
    - `tests/integration/setup.ts:16-19` compares a hostname with `'::1'`, but `URL.hostname` is `[::1]`, so it refuses an IPv6 loopback URL.
  - Two rules decide whether a command may touch a remote database:
    - `DB_TARGET_ACK` names the exact hosts;
    - the boolean `ALLOW_NON_LOCAL_DATABASE_URL` admits any host, for the E2E passthrough and the integration helpers.

    `AGENTS.md` states only the first.
- **Human and managed database paths.** Eleven files carry one policy.
  - `database-command.ts` and `internal/database-command-managed.ts` share their body, and the managed authorizer is a one-line alias.
  - `db-migrate.ts` and `db-seed.ts` each have a managed twin that differs only in the authorizer.
  - The rule that only automation reaches the managed path rests on its file path, checked by a source scan of four files (`database-command.test.ts`).
- **Command arguments.**
  - Six parsers are written by hand. Four files define `CommandIo`, and `stage-release.ts` a superset, `StageIo`.
  - `import-draft-questions.ts` ignores unknown flags. A mistyped `--dry-run` therefore writes, when the output folder is empty or absent; it refuses a non-empty one (`:90-103`).

### Duplicated Logic

BUG-351 and DEBT-531 already own the content planner, input freshness, normalization and hold scope. Beyond those records:

- **Content writers.**
  - The seed writer and the release builder each insert questions and compare tags, and the release-entries query appears twice.
  - "Placeholder" is defined three ways: by glob, by folder and prefix, and by an exact slug list. BUG-315 came from such a split.
  - `draft-question-import.ts` re-declares the choice rules, difficulty (`:34`) and choice labels that `lib/content/schemas.ts` and the domain own. DEBT-531 covers its status, tag kind and slug pattern.
- **Placeholder archival.** The archiver's `UPDATE` (`seed/placeholder-archiver.ts:35-42`) has no status filter. Every run without placeholders rewrites `updated_at` on fixtures that are already archived and counts them again. `docs/architecture/content-pipeline.md:609` says a rerun "writes nothing", and `:611` calls archival a deliberate side effect of every run.
- **Withdrawal dry run.** The dry run of `seed/withdraw-questions.ts` skips the writes. Every release command's dry run runs the real transaction and rolls it back (`content-release/command-support.ts`).
- **Environment seeds.** `seed-all-environments.ts` and `seed-production.ts` share their whole `main`.
- **Merge and promotion.** The merge guard and the promotion verifier repeat argument checks, the green-checks predicate and the merge call.
- **Records.**
  - `next-record-id.ts` restates the records paths that `documentation-archive.ts` exports (`RECORDS`).
  - It also has its own copy of the ledger pattern, which that file keeps private.
- **CodeRabbit.** `coderabbit-learnings-review.ts` sets `HOLD_DAYS = 30` beside `.coderabbit.yaml`'s `approval_delay: 30`, and nothing ties the two together.

### Mixed Responsibilities

- **`merge-reviewed-pr.ts` (843 lines).**
  - It mixes GitHub reads, push dating, check policy, approval and carry policy, the decision, learnings links and the command line.
  - `verify-promotion.ts` imports it as a library.
- **`documentation-archive.ts` (784 lines).**
  - It mixes Markdown scanning, status parsing, the records lifecycle, link audits, file discovery and an unused command line.
  - Its name predates the archive's removal.
- **`upstream-advisory-watch.mts` (1,004 lines).**
  - It holds the dependency map, manifest and lockfile readers, npm resolution, three GitHub adapters, a range evaluator, and policy with orchestration.
  - Its four test files already split along those lines.
- **`content-release/release-activation.ts` (592 lines).** `activateRelease` computes and applies a plan in about 275 lines.
- **`e2e-local-orchestrator.ts` (326 lines).**
  - It holds the E2E plan and also the command runner that `db:test:*` and `test:integration` use, so those commands log `[local-e2e]`.
  - It spawns `run-local-test-db.ts` as a child that resolves the target again, the mechanism behind BUG-329.

### Placement

- **Test-only modules.** `rule-to-test-register.ts`, `documentation-asset-budget.ts` and the link half of `documentation-archive.ts` serve only tests. The convention for such modules is `tests/*-source-scan.ts`.
- **Tests in the wrong place, or named for files that do not exist.**
  - `validate-header-safe-secret.test.ts` holds the only unit tests of `src/adapters/shared/header-secret.ts`.
  - The unit tests of `migration-ledger.ts` live in `tests/e2e/helpers/`.
  - `seed.test.ts` tests `seed/question-parser.ts` and `seed/tag-manager.ts`, not `seed.ts`.
  - `content-release/release-command-args.test.ts`, `draft-question-body.test.ts` and `draft-question-split.test.ts` have no source file of those names.
- **Production code that serves tests.** `choiceIdByLabel` in `seed/question-revision-writer.ts` is used only by `tests/shared/question-fixtures.ts`.
- **Repository policy in script suites.**
  - At least thirteen script suites pin the contents of `package.json`, workflows or `vercel.json`. Examples: `check-clerk-jwt-key.test.ts` (which repeats `vercel.test.ts`), `e2e-local-orchestrator.test.ts`, `database-command.test.ts`, `mutation-report-integrity.test.ts` and `production-release-watch.test.ts`.
  - `docs/architecture/environments.md:47` names several of them as the workflow contracts, so moving them to `tests/` changes that text too.
- **Scripts that import test support.** `ci/scan-playwright-output.ts` and `run-stripe-provider-contracts.ts` import `tests/shared/`. A layout must keep that direction deliberate.
- **Content.**
  - `seed-helpers.ts` sits in the root but serves only `seed/`, and it repeats `lib/content`'s newline normalization.
  - `seed/withdraw-questions.ts` is a release-style operator command inside `seed/`.
  - `seed/` and `content-release/` import from each other.
  - The read side of ADR-021 and ADR-022 lives in `src/`, while their write side lives entirely in `scripts/`, as Drizzle code with no ports. DEBT-531's two owners of hold scope are one symptom.
- **Smaller items.**
  - `docker-compose.yml` publishes the test database on every interface; the pooler binds `127.0.0.1`.
  - `migration-ledger.ts` prefixes every error code with `E2E_PREFLIGHT:`, though it gates every Vercel deploy.
  - `fixtures/trial-clock-smoke-report-passed.json` declares 11 tests but holds 14 results; it has been hand-edited for each added case.

### Candidates to Delete

| What | Why | Before deleting |
| --- | --- | --- |
| `validate-header-safe-secret.ts` | No caller since `0ba85539` (2026-09-19) removed its CI step. The secret-rotation procedure never calls it, `openssl rand -hex` output is header-safe, and both cron handlers validate the secret on every request. | Move its `validateHeaderSecret` tests to `src/adapters/shared/`. The owner decides, because `docs/architecture/environments.md` keeps it as an operator tool. |
| `db-generate.ts` | It guards a command that never connects to a database: `drizzle-kit generate` reads only schema files (`docs/architecture/integrations/postgres.md:73`). It exists because `drizzle.config.ts` throws without `DATABASE_URL`, and falls back to `.env.local` and `.env`. | Change `drizzle.config.ts` to pass credentials only when `DATABASE_URL` is set, and to load no dotenv file. Confirm `drizzle-kit generate` accepts that config. |
| `validateSeedQuestionTags` in `seed/tag-manager.ts`, and its five tests in `seed.test.ts` | It re-checks rules that `QuestionFrontmatterSchema` has already applied before it runs, so it appears unreachable. | Show that no input passes the schema and fails the validator. |
| `fixtures/trial-clock-smoke-report-passed.json` and `-mixed-failure.json` | The test already builds reports from the case titles. The mixed-failure file reaches only the first check. | Keep `-skipped.json` as the one real-shape sample. |
| The `documentation-archive.ts` command line and its spawn tests | Nothing runs it. | BUG-356 first, so its findings stay asserted. |
| Dead exports and aliases | `resolveLocalE2EDatabaseUrl`, `formatMigrationContentDriftMessage` and `documentationLinks` have no caller outside their own file and tests. The `E2E_INSTANCE` and `E2E_APP_PORT` aliases have no user. | None. |
| `prepare-seed-corpus.ts` and the environment seeds | They exist because production content comes from a laptop's drafts folder. | BUG-351 Part 3 and DEBT-483's bootstrap. |
| `upstream-fix-watch.ts` and its workflow | Its only watch is DEBT-500's. | DEBT-500 closes and no other watch is added. |

### Scripts Standing In for Configuration

- **CI's database.**
  - `ci/start-postgres.sh` rebuilds `docker-compose.yml`'s `db` service by hand: the same environment and health check, plus a poll that `docker compose up --wait` already does. It also forces `ci.yml` to `docker network connect` the container for PgBouncer.
  - After BUG-352 closes:
    - give `db` the `${…_IMAGE_REPOSITORY}@sha256:` form that `pgbouncer` already uses;
    - pull it with `ci/pull-image.sh`;
    - start both with `docker compose up -d --wait --pull never`.

    CI and local then share one database definition.
- **One migrate path.**
  - Vercel runs the ledger check before and after the managed migrate (`vercel.json`). CI and local E2E run the managed migrate bare.
  - So the pre-check's database path first meets real Postgres in a Vercel Preview build, against the rule that production runs the path the tests run.
  - Fix: one managed migrate command that checks, migrates and checks again, used by all three.
- **The Stripe provider lane.**
  - `run-stripe-provider-contracts.ts` overrides its config's 10-second timeout with `--testTimeout=20000` and repeats the config's file list. It also builds a process tree by hand to run Vitest and parse its JSON.
  - Instead, a custom Vitest reporter in `vitest.stripe-provider.config.mts` could fail on any skipped or missing case, and the package script becomes `vitest run --config …`, bounded by the job's timeout.
  - Each fail-closed case must carry over.
- **The integration lane.**
  - `run-local-integration.ts` neither starts, migrates nor seeds its database, though the E2E command does. So `AGENTS.md` carries a five-command recipe.
  - Prepare the database as E2E does, with an opt-out for quick reruns.
- **The production seed (owner ruling needed).**
  - `db:seed:prod` runs from a laptop. It pulls each environment's `DATABASE_URL` through a pinned Vercel CLI (`59.16.0`), and it reads the operator's untracked drafts (BUG-351).
  - Target: a manually dispatched GitHub Actions job in a protected Environment, with the owner as required reviewer. It checks out the content at a pinned commit and runs `stage-release`; a second, approval-gated job runs `activate-release`.
  - Costs:
    - It would make a production database URL a new CI secret consumer under the CI Secret Standard (`docs/architecture/environments.md`), which `tests/ci-workflow.test.ts` enumerates.
    - It needs read access to the content repository.
  - It would deliver BUG-351 Part 3's staging and DEBT-483's bootstrap. Keep the laptop path until then.
- **The merge guard (owner decision).**
  - Nothing technically blocks the merge button; the guard is a convention.
  - A workflow could run the same check on pull-request, review and CI events, and post a commit status that the ruleset requires.
  - Cost: Actions time on every review event, and a broken guard blocks every merge.

### What Stays a Script

The audit looked for a platform feature to replace each of these and found none:

- **The merge guard and the promotion verifier.** Rulesets cannot:
  - require a bot's approval of the exact head;
  - carry an approval across an unchanged diff;
  - apply ADR-020's exemption;
  - require linked learnings;
  - prove that each source pull request was reviewed (ADR-024).
- **The lockfile union check.** pnpm and git merge drivers produce a lockfile; neither proves it is the union of its sources.
- **The advisory watch.** Dependabot, `pnpm audit`, OSV and Renovate read the reviewed advisory database, which DEBT-509 measured missing advisories and lagging (`docs/policies/supply-chain.md`).
- **The operational alert watcher.** On Sentry's current plan nothing alerts on a muted monitor, alert-rule drift or a silent alert path, and Vercel's equivalents need Pro.
- **The release watch.** No platform alerts on a push that never got checks, or on a deployment that was never created. Hobby crons run only daily.
- **The learnings review.** CodeRabbit sends no notice when it records a learning.
- **The CRAP report and the mutation integrity check.**
  - Codecov computes no complexity from this repository's coverage and gives no CRAP ranking.
  - Stryker's only gate is a score threshold, which ADR-019 rules out.
- **`ci/install-playwright-chromium.sh` and `ci/scan-playwright-output.ts`.** Browser caching does not cover the system packages, and GitHub does not scan artifacts for credentials.
- **`resolve-local-test-target.ts`.** Compose cannot derive per-clone ports.
- **`security-txt-renewal.mts`.** A hard expiry test cannot give 90 days' notice without failing unrelated pull requests. It should still be rebuilt on the shared issue helper.

## Impact

- **Cost of change.**
  - Eight GitHub wrappers and three issue adapters to keep in step.
  - Eight test files that mock `node:child_process` because no runner is injected.
  - A 48-file root that hides thirteen families.
  - Documents that name scripts by path: before this record, 12 Markdown files mentioned `resolve-local-test-target.ts` 30 times, so every move edits them.
- **Risk.** The building blocks each script rebuilt have drifted. The defects listed above, and BUG-353 to BUG-356, are the drift that has shown so far.

## Options

- **A. Fix BUG-353 to BUG-356 only.** Cheap, but each new script copies the building blocks again.
- **B. In order: the defects, shared building blocks, the configuration replacements that remove scripts, deletions, then the layout one family at a time.** Each step is a small pull request, and the directory test keeps the file list true across every move. Recommended.
- **C. One reorganization.** Rejected:
  - it would invalidate the file and line evidence that BUG-351 and DEBT-531 cite in `seed/` and `content-release/`;
  - it would touch every guide in one review.

## Resolution (proposed)

Pending the owner's review. Recommended: option B, in this order.

1. **BUG-353 to BUG-356,** each red first in its own pull request.
2. **Package scripts for every hand-run command,** with documents switched to them. A move still updates `package.json`, `vercel.json`, the workflows, the local E2E plan and the suites that pin paths.
3. **Shared building blocks in `scripts/lib/`:**
   - one `gh` runner, and one issue transport with two lifecycles (one issue per condition, one per event), assigning the owner by default;
   - BUG-354's entry helper;
   - one process runner;
   - one loopback check, and one remote-target rule (`DB_TARGET_ACK`).

   First choose one runtime for the scheduled jobs:
   - **zero-install `.mts`,** with `allowImportingTsExtensions` and helpers that use nothing from `node_modules`;
   - **or `tsx` after `pnpm install`.** This installs dependencies inside jobs that hold issue-write tokens, including the job that watches advisories. Weigh that.
4. **The configuration replacements that remove or merge scripts:**
   - one managed migrate with ledger checks;
   - `drizzle.config.ts`, then delete `db-generate.ts`;
   - Compose for CI's database, after BUG-352;
   - the Stripe reporter.
5. **The deletions above,** once each precondition holds.
6. **The layout, one family per pull request, with its README rows:**

   ```text
   scripts/
     lib/           shared building blocks (step 3)
     database/      target, command, migrate, seed, studio, migration ledger; managed/ for automation
     deploy/        the Clerk key and server-action manifest checks
     test-lanes/    target, test database, integration, E2E, command plan, Stripe provider lane
     ci/            image pull, Chromium install, output scan
     content/       source/, drafts/, store/, seed/ (with environments/), release/
     feedback/      the feedback export
     review/        merge guard, promotion verifier, diff hunks, CodeRabbit learnings and their review
     dependencies/  lockfile union and its fixtures
     records/       record ID, records lifecycle, due checks
     watchers/      alert issues, operational, release, advisory, upstream fix, security.txt
     quality/       CRAP report, mutation integrity
   ```

   - `database/` avoids echoing the top-level `db/`.
   - `test-lanes/` holds lanes that CI also runs.
   - `review/` avoids a third meaning of "release" beside content releases and deploys.
   - In `content/`, `seed/` and `release/` depend on `store/` and never on each other.
   - Content moves wait for BUG-351 and DEBT-531.
7. **The splits:**
   - the merge guard, in its own pull request with its tests unchanged;
   - `documentation-archive.ts`: the records lifecycle to `scripts/records/`, and the links to a `tests/` source scan;
   - the advisory watch.
8. **The dispatched seed job,** with BUG-351 Part 3, after the owner rules on its secrets.
9. **Later, after BUG-351 and the bootstrap.** The content write side moves behind ports into `src/application` and `src/adapters`, with the planner in `src/domain`, leaving thin commands here.

## Verification

- [ ] BUG-353 to BUG-356 closed.
- [ ] Every hand-run command has a package script, and no guide names a script's path where one exists.
- [ ] One `gh` runner and one issue transport, and no suite mocks `node:child_process`.
- [ ] The deletions done, or declined by the owner with the reason recorded here.
- [ ] The layout complete, with `tests/scripts-directory.test.ts` green after each move.
- [ ] Each configuration replacement merged, or declined with its reason.

## Related

- **Defects found by the same review:** BUG-353, BUG-354, BUG-355 and BUG-356.
- **Content writers:** BUG-351 owns the planner and input freshness, DEBT-531 normalization and hold scope, and DEBT-483 the bootstrap.
- **Scripts touched by open records:**
  - BUG-329: the local target that changes in child processes;
  - BUG-352: CI's image registries;
  - DEBT-500: the upstream fix watch;
  - DEBT-505: the operational watcher;
  - DEBT-509: the advisory watch;
  - DEBT-523: the release watch.
- **Decisions:**
  - ADR-023: a list kept in a document needs a test;
  - ADR-024: review, merge and promotion;
  - ADR-025: test doubles;
  - ADR-019: the quality reports.
