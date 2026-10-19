# DEBT-532: The Scripts Folder Has Inconsistent Shared Helpers and No Layout

**Status:** Open — owner reviews the structural proposals
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

`scripts/` holds 151 tracked files: 76 scripts and modules, 65 tests and test helpers, 9 fixtures, and its README. Forty-eight of the 76 sit in the root, beside five subfolders (`ci/`, `content-release/`, `fixtures/`, `internal/`, `seed/`). Its README has thirteen functional families plus a manual operator-tool section. Existing shared modules include `database-target.ts`, `database-process.ts`, `github-alert-issues.ts`, `seed/qid-command-args.ts` and `content-release/command-support.ts`; reuse is inconsistent, not absent. `scripts/README.md` holds the inventory, and `tests/scripts-directory.test.ts` checks file coverage and static caller references.

The scripts encode repository-specific behavior. Replacing one requires proof that its behavior survives; this audit does not establish that no platform could replace it. The debt is in how they are built:

- **Shared building blocks are unevenly reused:** GitHub CLI calls, issue handling, the direct-run guard, child processes, database-target rules and argument parsing still have independent implementations.
- **Some files do several jobs.**
- **Some modules sit in the wrong place.**
- **Some scripts stand in for configuration.**
- **Some code is dead.**

The initial review filed BUG-353 through BUG-356. The challenge separated the importer, IPv6 setup and ledger diagnostics into BUG-357, BUG-358 and BUG-359. BUG-360 on #1559 owns the independent deploy-target E2E reset; BUG-361 owns unreachable rule-register proofs. The review's method, recount commands and coverage are in its pull request.

Corrected 2026-10-19: recount files and references after dev integration, separate defects, bound platform claims, preserve existing helpers and caller-specific behavior, and correct deletion and migration proposals.

## Evidence

### Missing Shared Building Blocks

- **Entry points.**
  - Thirty-five copies of the direct-run guard (BUG-354). Error-reporting patterns include:
    - most print the message;
    - `merge-reviewed-pr.ts`, `verify-promotion.ts` and `documentation-archive.ts` let a stack trace through;
    - `export-question-feedback.ts` prints the whole error object;
    - `verify-migration-ledger.ts` preserves typed ledger code/message/remedy and uses a generic line for other errors.
  - BUG-359 owns the hidden safe usage and target diagnostics. Unknown errors must remain sanitized; a shared entry detector must not erase those distinctions.
- **GitHub.**
  - Eight files each wrap `execFileSync('gh', …)`, and three modules adapt GitHub issues:
    - `github-alert-issues.ts` uses GitHub's search;
    - `security-txt-renewal.mts:83-88` reads the repository's whole issue and pull-request list only inside its renewal window (`:44-52`). The advisory watch's memoized adapter (`upstream-advisory-watch.mts:639-644`) reads that list once per run when issue processing is reached; its workflow schedules every three hours. `github-alert-issues.ts:117-118` instead searches by title.
  - Three test fakes are each named `MemoryIssues`.
  - The two `.mts` jobs run under plain `node` with no install. They could import a `.ts` helper only by its full `.ts` name, which `tsconfig.json` does not allow today, and only one that uses nothing from `node_modules`. So each carries its own copy.
- **Alert assignees.**
  - Three jobs open issues with no assignee:
    - the operational watcher (`operational-alert-watcher.ts:341`);
    - the records due check (`documentation-due-checks.ts:121`);
    - the security.txt job (`security-txt-renewal.mts:133-134`).
  - The advisory watch assigns only urgent issues. Other alert jobs pass the owner to `createGithubAlertIssues`; assignment adds a notification reason, but does not guarantee email delivery. GitHub also notifies for subscriptions, mentions and participation ([notification rules](https://docs.github.com/en/subscriptions-and-notifications/concepts/about-notifications)).
  - Owner watch settings and mail delivery were not rechecked here. A shared transport should preserve each job's assignment policy unless the owner changes it.
- **The npm registry path.** `upstream-fix-watch.ts:149` assumes a scoped package. Its sole configured watch is scoped, so no configured watch is broken. Adding an unscoped watch requires correcting and testing this path first.
- **Processes.** Four spawners:
  - `database-process.ts`;
  - `runProcess` in `seed-environment-runtime.ts`;
  - `spawnCommand` in `e2e-local-orchestrator.ts`;
  - the process tree in `run-stripe-provider-contracts.ts`.

  The last two manage process groups and have diverged.
- **Database targets.**
  - Five loopback checks disagree: `database-target.ts`, `e2e-local-orchestrator.ts`, `tests/shared/resolve-integration-database-url.ts`, `tests/integration/setup.ts` and `tests/integration/helpers.ts`.
    - BUG-358 owns the setup's IPv6 loopback rejection.
  - Two rules decide whether a command may touch a remote database:
    - `DB_TARGET_ACK` names the exact remote host, port and database identities;
    - the boolean `ALLOW_NON_LOCAL_DATABASE_URL` admits any host, for the E2E passthrough and the integration helpers.

    `AGENTS.md` states only the first.
- **Human and managed database paths.** The wrappers share target parsing but retain different authorization contracts.
  - `database-command.ts` reads an environment and demands acknowledgment; `internal/database-command-managed.ts` takes a URL directly and calls the managed authorizer. Both log targets and execute a callback.
  - `db-migrate.ts` and `db-seed.ts` have managed counterparts with similar execution bodies. #1559 adds a managed-only remote-placeholder refusal, so consolidation must preserve that distinction.
  - The rule that only automation reaches the managed path rests on its file path, checked by a source scan of four files (`database-command.test.ts`).
- **Command arguments.**
  - Handwritten parsers occur in the release commands, QID commands, importer, feedback export, quality report, lockfile CLI and environment seeds. Four files define `CommandIo`, and `stage-release.ts` a superset, `StageIo`.
  - BUG-357 owns ignored importer arguments. #1559 separately fixes the environment seeds' leading pnpm separator. Sharing low-level parsing must preserve command-specific validation.

### Duplicated Logic

BUG-351 and DEBT-531 already own the content planner, input freshness, normalization and hold scope. Beyond those records:

- **Content writers.**
  - The seed writer and the release builder each insert questions and compare tags, and the release-entries query appears twice.
  - "Placeholder" is defined three ways: by glob, by folder and prefix, and by an exact slug list. BUG-315 came from such a split.
  - `draft-question-import.ts` re-declares the choice rules, difficulty (`:34`) and choice labels that `lib/content/schemas.ts` and the domain own. DEBT-531 covers its status, tag kind and slug pattern.
- **Placeholder archival.** The archiver's `UPDATE` (`seed/placeholder-archiver.ts:35-42`) has no status filter. A successful seed without placeholders and without an active release updates and counts matching fixtures even if already archived. The pipeline's old "writes nothing" claim is corrected on #1559; changing the deliberate archival behavior would need its own red-first justification.
- **Withdrawal dry run.** The dry run of `seed/withdraw-questions.ts` skips the writes. Every release command's dry run runs the real transaction and rolls it back (`content-release/command-support.ts`).
- **Environment seeds.** `seed-all-environments.ts` and `seed-production.ts` repeat argument parsing, temporary-directory lifecycle and error handling; their target runners differ, and production also passes its environment for the ambient-URL refusal.
- **Merge and promotion.** The merge guard and the promotion verifier repeat argument checks, the green-checks predicate and the merge call.
- **Records.**
  - `next-record-id.ts` restates the records paths that `documentation-archive.ts` exports (`RECORDS`).
  - It independently extracts ledger ID prefixes; that is narrower than the full receipt validation in `documentation-archive.ts`.
- **CodeRabbit.** `coderabbit-learnings-review.ts` sets `HOLD_DAYS = 30` beside `.coderabbit.yaml`'s `approval_delay: 30`, and nothing ties the two together.

### Mixed Responsibilities

- **`merge-reviewed-pr.ts` (843 lines).**
  - It mixes GitHub reads, push dating, check policy, approval and carry policy, the decision, learnings links and the command line.
  - `verify-promotion.ts` imports it as a library.
- **`documentation-archive.ts` (784 lines).**
  - It mixes Markdown scanning, status parsing, the records lifecycle, link audits, file discovery and a manually usable command line with no automated gate caller.
  - Its name predates the archive's removal.
- **`upstream-advisory-watch.mts` (1,004 lines).**
  - It holds the dependency map, manifest and lockfile readers, npm resolution, three GitHub adapters, a range evaluator, and policy with orchestration.
  - Its four test files already split along those lines.
- **`content-release/release-activation.ts` (594 lines).** `activateRelease` computes and applies a plan in about 275 lines.
- **`e2e-local-orchestrator.ts` (326 lines).**
  - It holds the E2E plan and also the command runner that `db:test:*` and `test:integration` use, so those commands log `[local-e2e]`.
  - It spawns `run-local-test-db.ts` as a child that resolves the target again, the mechanism behind BUG-329.

### Placement

- **Test-only modules.** `rule-to-test-register.ts` and `documentation-asset-budget.ts` serve only tests. The link half of `documentation-archive.ts` also serves its CLI. A split into `tests/*-source-scan.ts` is appropriate only if that CLI responsibility is deliberately retired or retained outside test support.
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
| `validate-header-safe-secret.ts` | No checked-in automation caller since `0ba85539` (2026-09-19) removed its CI step. It remains a documented operator tool. Hex generation produces header-safe characters, but the tool also catches copy/paste whitespace before deployment; request handlers validate the configured secret before comparing a bearer token. | Owner decides whether to retain that preflight. If deleted, update the operator guide and preserve `validateHeaderSecret` tests beside `src/adapters/shared/header-secret.ts`. |
| `db-generate.ts` | `drizzle-kit generate` reads schema and previous snapshots and writes migrations without needing a database connection ([Drizzle documentation](https://orm.drizzle.team/docs/drizzle-kit-generate)). The wrapper exists because `drizzle.config.ts` requires a URL and loads dotenv fallbacks. | Separate offline generation from connected migrate/studio configuration, retaining their explicit-target requirements. Prove generation works without credentials before deleting the wrapper. |
| `validateSeedQuestionTags` in `seed/tag-manager.ts`, and its five tests in `seed.test.ts` | It re-checks rules that `QuestionFrontmatterSchema` has already applied. The function runs; its rejection branches appear redundant. | Show that no input passes the schema and fails the validator. |
| `fixtures/trial-clock-smoke-report-passed.json` and `-mixed-failure.json` | The test already builds reports from the case titles. The mixed-failure file reaches only the first check. | Keep `-skipped.json` as the one real-shape sample. |
| The `documentation-archive.ts` command line and its spawn tests | No package script, workflow or hook invokes it; it remains usable manually and runs in this audit. | BUG-356 first, then an explicit decision about the standalone audit. Preserve all findings and exit behavior needed by operators. |
| Unused exports and compatibility aliases | `resolveLocalE2EDatabaseUrl` and `documentationLinks` have no tracked caller outside their tests. `formatMigrationContentDriftMessage` is called within `migration-ledger.ts`, so only its export is a candidate. `E2E_INSTANCE` and `E2E_APP_PORT` have no tracked external caller; operator environments are not observable from source. | Keep the internally used formatter. Check operator use and document migration before removing environment aliases. |
| `prepare-seed-corpus.ts` and the environment seeds | They currently support both production and non-production draft import/seeding. | Replace every still-needed target workflow, satisfy BUG-351's source freshness requirements, and handle DEBT-483's bootstrap separately before deletion. |
| `upstream-fix-watch.ts` and its workflow | Its only watch is DEBT-500's. | DEBT-500 closes and no other watch is added. |

### Scripts Standing In for Configuration

- **CI's database.**
  - `ci/start-postgres.sh` rebuilds `docker-compose.yml`'s `db` service by hand: the same environment and health check, plus a poll that `docker compose up --wait` already does. It also forces `ci.yml` to `docker network connect` the container for PgBouncer.
  - Preserve the registry failover shipped by BUG-352 in #1555:
    - give `db` the `${…_IMAGE_REPOSITORY}@sha256:` form that `pgbouncer` already uses;
    - pull it with `ci/pull-image.sh`;
    - start both with `docker compose up -d --wait --pull never`.

    CI and local then share one database definition.
- **One migrate path.**
  - Vercel runs the ledger check before and after the managed migrate (`vercel.json`). CI and local E2E run the managed migrate bare.
  - The pre-specific verifier lacks a real-Postgres test path; the shared query adapter and post-verifier do run in E2E credential preflight. A deploy should not be the first proof of the pre-specific behavior.
  - Proposal: one managed migrate command that checks, migrates and checks again, used by all three, with real-Postgres tests for fresh, partially migrated, current and drifted ledgers before adoption.
- **The Stripe provider lane.**
  - `run-stripe-provider-contracts.ts` overrides its config's 10-second timeout with `--testTimeout=20000` and repeats the config's file list. It also builds a process tree by hand to run Vitest and parse its JSON.
  - A custom Vitest reporter could own case validation, but deleting the wrapper also removes its five-minute local process-tree bound, environment gate, `DATABASE_URL` removal and failure diagnostics. A job timeout covers only CI.
  - Evaluate the reporter only with equivalent local and CI time bounds, teardown, diagnostics and every fail-closed missing/duplicate/skipped/nonpassing-case check. Keep the wrapper if the replacement is not simpler after those requirements.
- **The integration lane.**
  - `run-local-integration.ts` neither starts, migrates nor seeds its database, though the E2E command does. So `AGENTS.md` carries a five-command recipe.
  - Prepare the database as E2E does, with an opt-out for quick reruns.
- **The production seed (owner ruling needed).**
  - `db:seed:prod` is an operator command that pulls only Production's `DATABASE_URL` through the pinned preinstalled Vercel CLI; `db:seed:all` pulls all three Vercel environments to exclude Production. Both import the operator's drafts (BUG-351).
  - Proposed target: a manually dispatched GitHub Actions job in a protected Environment, with the owner as required reviewer. Pin content and app commits, stage and preview the release, then bind the approved activation to its release ID, expected active release, preview plan ID, reason and authority. Each database first needs DEBT-483's separate, owner-approved bootstrap, which adopts existing live content.
  - Costs:
    - It would make a production database URL a new CI secret consumer under the CI Secret Standard (`docs/architecture/environments.md`), which `tests/ci-workflow.test.ts` enumerates.
    - It needs read access to the content repository.
  - This could deliver BUG-351 Part 3's staging after the bootstrap prerequisite. An Actions job still inherits environment inputs; relocating it alone does not create an environment allowlist. Keep required operator paths until the replacement has evidence.
- **The merge guard (owner decision).**
  - Live `main-and-dev-protection` rules require the `test` check, an up-to-date branch and resolved threads, so the merge button is constrained. The custom guard's CodeRabbit and carry predicates are not themselves a required status (read-only ruleset check during this audit).
  - A workflow could run the same check on pull-request, review and CI events, and post a commit status that the ruleset requires.
  - Cost: Actions time on every review event, and a broken guard blocks every merge.

### What Stays a Script

Retain these responsibilities until a replacement proves equivalent behavior. The list is not a claim that platform alternatives do not exist:

- **The merge guard and the promotion verifier.** They implement the repository's bot identity, exact-head/carried-approval, ADR-020 exemption, linked-learning and source-PR proof rules. GitHub can preserve approvals when the diff is unchanged; that is not the same as this repository's carry algorithm ([rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)).
- **The lockfile union check.** pnpm and git merge drivers produce a lockfile; neither proves it is the union of its sources.
- **The advisory watch.** It queries upstream repository advisories directly, then checks reviewed ranges against locked versions. A replacement must be evaluated against the missing/lagging advisories documented in DEBT-509; [OSV aggregates multiple sources](https://google.github.io/osv.dev/data/), so it is inaccurate to treat every scanner as the same reviewed database.
- **The operational alert watcher.** It checks monitor state, alert configuration, drill freshness, quota and dropped events. Current account capabilities and delivery were not revalidated; the owner can compare a platform replacement against those checks.
- **The release watch.** It checks for absent/passing CI and successful GitHub production deployment records after a grace period. That addresses missing events as well as reported failures; it does not independently prove which bytes Vercel serves.
- **The learnings review.** It creates an aggregate owner-assigned review issue from CodeRabbit's learning replies. CodeRabbit already marks [learning responses](https://docs.coderabbit.ai/knowledge-base/learnings); the added benefit is the aggregate review queue.
- **The CRAP report and the mutation integrity check.**
  - The CRAP script combines this repository's coverage lanes with its own complexity analysis; replacement requires the same measurement and missing-coverage checks.
  - The mutation check requires a valid positive `testsCompleted` count for each survivor. Stryker has other gates, including rejecting an [empty initial dry run](https://stryker-mutator.io/docs/stryker-js/configuration/#allowempty); a score threshold or initial-run check does not prove per-mutant test execution.
- **`ci/install-playwright-chromium.sh` and `ci/scan-playwright-output.ts`.** Preserve the Ubuntu package/mirror handling and the explicit check of upload-eligible output before artifact publication.
- **`resolve-local-test-target.ts`.** Preserve this repository's deterministic clone-path mapping to project names and ports; this is not a claim that Compose cannot assign ports.
- **`security-txt-renewal.mts`.** Its scheduled warning avoids coupling unrelated PRs to a renewal window. Reuse transport where useful, preserving its renewal lifecycle.

## Impact

- **Cost of change.**
  - Eight GitHub wrappers and three issue adapters to keep in step.
  - Eight test files still mock `node:child_process`; some modules already inject runners, so each remaining default-transport test needs a deliberate replacement.
  - Forty-eight script/module files at the root (102 tracked root files including tests and README).
  - At the merge base, 12 Markdown files mentioned `resolve-local-test-target.ts` 31 times. Moving that script changes those references unless stable commands replace them first.
- **Risk.** The building blocks each script rebuilt have drifted. The defects listed above, and BUG-353 to BUG-356, are the drift that has shown so far.

## Options

- **A. Fix the separately recorded defects only.** Smaller scope, but duplicated policies remain and can diverge again.
- **B. In order: the defects, shared building blocks, the configuration replacements that remove scripts, deletions, then the layout one family at a time.** Each step is a small pull request, and the directory test keeps the file list true across every move. Recommended.
- **C. One reorganization.** Rejected:
  - it would invalidate the file and line evidence that BUG-351 and DEBT-531 cite in `seed/` and `content-release/`;
  - it would touch the affected guides, configuration and path contracts in one review.

## Resolution (proposed)

Pending the owner's review. Recommended: option B, in this order.

1. **The separately recorded defects,** each fixed red first; owner-dependent production and E2E decisions remain with the owner.
2. **Package scripts for every hand-run command,** with documents switched to them. A move still updates `package.json`, `vercel.json`, the workflows, the local E2E plan and the suites that pin paths.
3. **Shared building blocks in `scripts/lib/`:**
   - reusable `gh` and issue transport, preserving distinct issue lifecycles, assignment and redaction policies;
   - BUG-354's entry detector, with caller-owned error reporting;
   - process primitives that preserve each caller's environment, timeout and process-group lifecycle;
   - one loopback predicate; separately review human, managed and test-lane remote authorization before changing those policies.

   First choose one runtime for the scheduled jobs:
   - **zero-install `.mts`,** with `allowImportingTsExtensions` and helpers that use nothing from `node_modules`;
   - **or `tsx` after `pnpm install`.** Keep credentials step-scoped under the CI Secret Standard and evaluate dependency-install execution and scheduled-job availability before changing the zero-install jobs.
4. **The configuration replacements that remove or merge scripts:**
   - one managed migrate with ledger checks;
   - prove credential-free generation while preserving connected-command guards, then consider deleting `db-generate.ts`;
   - Compose for CI's database, preserving BUG-352's registry failover;
   - the Stripe reporter only if it preserves the wrapper's local and CI safeguards.
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
   - `documentation-archive.ts`: the records lifecycle to `scripts/records/`; move links to a `tests/` source scan only if the operator CLI no longer needs them;
   - the advisory watch.
8. **The dispatched seed job,** with BUG-351 Part 3, after the owner rules on its secrets.
9. **Later, after BUG-351 and the bootstrap.** The content write side moves behind ports into `src/application` and `src/adapters`, with the planner in `src/domain`, leaving thin commands here.

## Verification

- [ ] Separately recorded defects fixed and their remaining owner checks resolved.
- [ ] Every hand-run command has a package script, and no guide names a script's path where one exists.
- [ ] One `gh` runner and one issue transport, and no suite mocks `node:child_process`.
- [ ] The deletions done, or declined by the owner with the reason recorded here.
- [ ] The layout complete, with `tests/scripts-directory.test.ts` green after each move.
- [ ] Each configuration replacement merged, or declined with its reason.

## Related

- **Defects found by the review and challenge:** BUG-353 through BUG-361.
- **Closed prerequisite:** BUG-352 shipped registry failover in #1555; its remaining owner/watch follow-ups do not block evaluating the Compose consolidation.
- **Content writers:** BUG-351 owns the planner and input freshness, DEBT-531 normalization and hold scope, and DEBT-483 the bootstrap.
- **Scripts touched by open records:**
  - BUG-329: the local target that changes in child processes;
  - DEBT-500: the upstream fix watch;
  - DEBT-505: the operational watcher;
  - DEBT-509: the advisory watch;
  - DEBT-523: the release watch.
- **Decisions:**
  - ADR-023: a list kept in a document needs a test;
  - ADR-024: review, merge and promotion;
  - ADR-025: test doubles;
  - ADR-019: the quality reports.
