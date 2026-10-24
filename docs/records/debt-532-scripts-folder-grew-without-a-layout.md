# DEBT-532: The Scripts Folder Has Inconsistent Shared Helpers and No Layout

**Status:** Open — the content families' move waits for BUG-351; DEBT-531 resolved 2026-10-23
**Priority:** P3
**Date:** 2026-10-18

---

## Summary

At audit baseline `0680cb2d`, `scripts/` held 155 tracked files: 78 scripts and modules, 67 tests and test helpers, 9 fixtures, and its README. Forty-nine of the 78 sit in the root, beside five subfolders (`ci/`, `content-release/`, `fixtures/`, `internal/`, `seed/`). Its README has thirteen functional families plus a manual operator-tool section. Existing shared modules include `database-target.ts`, `database-process.ts`, `github-alert-issues.ts`, `seed/qid-command-args.ts` and `content-release/command-support.ts`; reuse is inconsistent, not absent. `scripts/README.md` holds the inventory, and `tests/scripts-directory.test.ts` checks file coverage and static caller references.

The scripts encode repository-specific behavior. Replacing one requires proof that its behavior survives; this audit does not establish that no platform could replace it. At that baseline, the debt was in how they were built:

- **Shared building blocks are unevenly reused:** GitHub CLI calls, issue handling, the direct-run guard, child processes, database-target rules and argument parsing still have independent implementations.
- **Some files do several jobs.**
- **Some modules sit in the wrong place.**
- **Some scripts stand in for configuration.**
- **Some code is dead.**

The initial review filed BUG-353 through BUG-356. The challenge separated the importer, IPv6 setup and ledger diagnostics into BUG-357, BUG-358 and BUG-359. BUG-360, filed with #1559, owns the independent deploy-target E2E reset; BUG-361 owns unreachable rule-register proofs. The review's method and coverage are in its pull request.

Corrected 2026-10-19: recount files and references after dev integration, separate defects, bound platform claims, preserve existing helpers and caller-specific behavior, and correct deletion and migration proposals.
Corrected 2026-10-19: a second challenge widened the error-reporting, loopback and test-name evidence, corrected citations and BUG-352's and DEBT-500's references, and ordered the steps by their dependencies.

## Evidence

Counts, line references and descriptions in this evidence section describe audit baseline `0680cb2d`, before the fixes below. The directory describes the current working tree.

### Missing Shared Building Blocks

- **Entry points.**
  - Thirty-six copies of the direct-run guard (BUG-354). Error-reporting patterns include:
    - most print the message;
    - `merge-reviewed-pr.ts`, `verify-promotion.ts` and `documentation-archive.ts` let a stack trace through, as do `check-server-action-manifest.ts` on a malformed manifest and `ci/scan-playwright-output.ts` on an unreadable directory;
    - `export-question-feedback.ts` prints the whole error object;
    - `verify-migration-ledger.ts` and `documentation-due-checks.ts` print their own typed errors and a generic line for the rest; the operational, learnings, security.txt and advisory watchers print only a generic line.
  - BUG-359 owns the hidden safe usage and target diagnostics. Unknown errors must remain sanitized; a shared entry detector must not erase those distinctions.
- **GitHub.**
  - Eight files run `gh` through their own `execFileSync` wrapper (`verify-promotion.ts` through a generic `run`), and three modules adapt GitHub issues:
    - `github-alert-issues.ts` uses GitHub's search;
    - `security-txt-renewal.mts:83-88` reads the repository's whole issue and pull-request list only inside its renewal window (`:45`, list at `:53`). The advisory watch's adapter (`upstream-advisory-watch.mts:636-672`) reads that list afresh on each call: once per run to close reviewed issues (`:793`), and again when new advisories need checking (`:280`); its workflow runs every three hours. `github-alert-issues.ts:118-131` instead searches by title.
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
  - At least seven database loopback checks disagree: `database-target.ts`, `e2e-local-orchestrator.ts`, `tests/shared/resolve-integration-database-url.ts`, `tests/integration/setup.ts`, `tests/integration/helpers.ts`, and the E2E evidence helpers `tests/e2e/helpers/checkout-consent.ts` and `portal-cancellation.ts`, which accept only `localhost` and `127.0.0.1`.
    - BUG-358 owns the setup's IPv6 loopback rejection; the installed postgres.js URL parser produces `[` for a bracketed IPv6 literal. That does not rule out a named host resolving to IPv6.
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
  - BUG-357 owns ignored importer arguments. #1567 settled the pnpm separator for strict parsers: they refuse a forwarded `--`, and documentation passes arguments directly. #1559 follows it for the environment seeds. Sharing low-level parsing must preserve command-specific validation.

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
- **`content-release/release-activation.ts` (560 lines).** `activateRelease` computes and applies a plan in about 245 lines.
- **`e2e-local-orchestrator.ts` (326 lines).**
  - It holds the E2E plan and also the command runner that `db:test:*` and `test:integration` use, so those commands log `[local-e2e]`.
  - It spawns `run-local-test-db.ts` as a child that resolves the target again, the mechanism behind BUG-329.

### Placement

- **Test-only modules.** `rule-to-test-register.ts` and `documentation-asset-budget.ts` serve only tests. The link half of `documentation-archive.ts` also serves its CLI. A split into `tests/*-source-scan.ts` is appropriate only if that CLI responsibility is deliberately retired or retained outside test support.
- **Tests in the wrong place, or named for files that do not exist.**
  - `validate-header-safe-secret.test.ts` holds the only unit tests of `src/adapters/shared/header-secret.ts`.
  - The unit tests of `migration-ledger.ts` live in `tests/e2e/helpers/`.
  - `seed.test.ts` tests `seed/question-parser.ts` and `seed/tag-manager.ts`, not `seed.ts`.
  - `content-release/release-command-args.test.ts`, `content-release/bootstrap-manifest.test.ts` (which tests `release-manifest.ts`), `draft-question-body.test.ts` and `draft-question-split.test.ts` have no source file of those names.
- **Production code that serves tests.** `choiceIdByLabel` in `seed/question-revision-writer.ts` is used only by tests: `tests/shared/question-fixtures.ts` and its own unit test.
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
| Unused exports and compatibility aliases | `resolveLocalE2EDatabaseUrl` has no tracked caller outside its tests, and `documentationLinks` has none at all. `formatMigrationContentDriftMessage` is called within `migration-ledger.ts`, so only its export is a candidate. `E2E_INSTANCE` and `E2E_APP_PORT` have no tracked external caller; operator environments are not observable from source. | Keep the internally used formatter. Check operator use and document migration before removing environment aliases. |
| `prepare-seed-corpus.ts` and the environment seeds | They currently support both production and non-production draft import/seeding. | Replace every still-needed target workflow, satisfy BUG-351's source freshness requirements, and handle DEBT-483's bootstrap separately before deletion. |
| `upstream-fix-watch.ts` and its workflow | Its only watch is the Stryker fix that DEBT-500's Waiting row waits for (#1500); the record itself is closed. | That watch fires, #1500 closes with the patch removed, and no other watch is added. |

### Scripts Standing In for Configuration

- **CI's database.**
  - `ci/start-postgres.sh`, which `ci.yml` and `stripe-hosted-checkout-smoke.yml` run, rebuilds `docker-compose.yml`'s `db` service by hand: the same environment and health check, plus a poll that `docker compose up --wait` already does. It also forces `ci.yml` to `docker network connect` the container for PgBouncer.
  - Preserve the registry failover that DEBT-516 (#1454) and BUG-352 (#1552) shipped:
    - give `db` the `${…_IMAGE_REPOSITORY}@sha256:` form that `pgbouncer` already uses;
    - pull it with `ci/pull-image.sh`;
    - start both with `docker compose up -d --wait --pull never`;
    - align `DB_TEST_PORT` with the workflows' `DATABASE_URL`, which uses 5432 while Compose defaults to 5434.

    CI and local then share one database definition.
- **One migrate path.**
  - Vercel runs the ledger check before and after the managed migrate (`vercel.json`). CI, the hosted Checkout smoke workflow and local E2E run the managed migrate bare.
  - The pre-specific verifier lacks a real-Postgres test path; the shared query adapter and post-verifier do run in E2E credential preflight. A deploy should not be the first proof of the pre-specific behavior.
  - Proposal: one managed migrate command that checks, migrates and checks again, used by all four, with real-Postgres tests for fresh, partially migrated, current and drifted ledgers before adoption.
- **The Stripe provider lane.**
  - `run-stripe-provider-contracts.ts` overrides its config's 10-second timeout with `--testTimeout=20000` and repeats the config's file list. It also builds a process tree by hand to run Vitest and parse its JSON.
  - A custom Vitest reporter could own case validation, but deleting the wrapper also removes its five-minute local process-tree bound, environment gate, `DATABASE_URL` removal and failure diagnostics. A job timeout covers only CI.
  - Evaluate the reporter only with equivalent local and CI time bounds, teardown, diagnostics and every fail-closed missing/duplicate/skipped/nonpassing-case check. Keep the wrapper if the replacement is not simpler after those requirements.
- **The integration lane.**
  - `run-local-integration.ts` neither starts, migrates nor seeds its database, though the E2E command does. So `AGENTS.md` carries a five-command recipe.
  - Prepare the database as E2E does, with an opt-out for quick reruns.
- **The production seed (alternative evaluated below).**
  - `db:seed:prod` is an operator command that pulls only Production's `DATABASE_URL` through the pinned preinstalled Vercel CLI; `db:seed:all` seeds `.env.local`'s database and Vercel Development and Preview, and pulls Production only to refuse a matching target. Both import the operator's drafts (BUG-351).
  - Proposed target: a manually dispatched GitHub Actions job in a protected Environment, with the owner as required reviewer. Pin content and app commits, stage and preview the release, then bind the approved activation to its release ID, expected active release, preview plan ID, reason and authority. Each database first needs DEBT-483's separate, owner-approved bootstrap, which adopts existing live content.
  - Costs:
    - It would make a production database URL a new CI secret consumer under the CI Secret Standard (`docs/architecture/environments.md`). `tests/ci-workflow.test.ts` checks only the workflows it names, so the new workflow needs its own consumer list there.
    - It needs read access to the content repository.
  - This could deliver BUG-351 Part 3's staging after the bootstrap prerequisite. An Actions job still inherits environment inputs; relocating it alone does not create an environment allowlist. Keep required operator paths until the replacement has evidence.
- **The merge guard (alternative evaluated below).**
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

These costs describe the audit baseline; the implementation and retained boundaries are recorded in Resolution.

- **Cost of change.**
  - Eight GitHub wrappers and three issue adapters to keep in step.
  - Eight test files still mock `node:child_process`; some modules already inject runners, so each remaining default-transport test needs a deliberate replacement.
  - Forty-nine script/module files at the root (104 tracked root files including tests and README), at the start of implementation.
  - At the merge base, 12 Markdown files mentioned `resolve-local-test-target.ts` 31 times. Moving that script changes those references unless stable commands replace them first.
- **Risk.** The building blocks each script rebuilt have drifted. The defects listed above, and BUG-353 through BUG-361, are the drift that has shown so far.

## Options

- **A. Fix the separately recorded defects only.** Smaller scope, but duplicated policies remain and can diverge again.
- **B. In order: the defects, package scripts, shared building blocks, the configuration replacements that remove scripts, deletions, the layout one family at a time, then the splits.** Keep each step independently verifiable and the directory test green across every move. The owner has requested the safe steps together in this PR; content-owner prerequisites remain separate. Selected, with the decisions and limits below.
- **C. One reorganization.** Rejected:
  - it would invalidate the file and line evidence that BUG-351 and DEBT-531 cite in `seed/` and `content-release/`;
  - it would change every family and content boundary at once, preventing the family-by-family reference and behavior checks used by option B.

## Decisions

The owner delegated these choices for this application on 2026-10-19; the owner can overrule them. These decisions change no accepted ADR text.

1. **Keep the header-secret operator preflight.** Principle: delete redundancy, not an independent safety check. `environments.md` uses it before deployment; `validateHeaderSecret` also detects copy/paste whitespace that hex generation alone cannot prevent. Keep the value-free CLI and move the validator's unit tests beside its source. Reversal costs deleting that CLI and updating the guide after choosing another value-free preflight.
2. **Keep production seeding as an operator command.** Principle: data correctness and explicit authority before automation. BUG-351 still owns source admission, DEBT-531 owns normalization/hold semantics, and DEBT-483 owns each database's irreversible bootstrap. A protected Actions job would add production credentials and content-repository access without supplying those missing invariants. Decline that job in this PR; retain target acknowledgment and the target-only `--plan`, without claiming a content preview or source-freshness guarantee. Reversal requires the source/plan contract, target bootstrap and an independently reviewed workflow plus owner settings; no Environment or secret is created here.
3. **Keep the merge verdict as a documented pre-merge command.** Principle: enforce the decision at the action. ADR-024 requires the command to revalidate immediately before merging; a previously published status can become stale when reviews or threads change. The checked-in guard also requires exact-head `test`, main ancestry and resolved threads. A supplementary required status adds another event-driven state machine without replacing the command. Decline it here. Reversal requires event/freshness tests, a workflow, and the owner's ruleset change; protection stays intact.
4. **Keep native zero-install `.mts` for the two scheduled jobs.** Principle: preserve availability and minimize the credential-bearing dependency surface. Both workflows currently set up only Node; a pure entry helper needs only built-ins. Enable explicit TypeScript-extension imports under the existing `noEmit` compiler option and test the native runtime. Other commands retain `tsx`. Reversal costs adding credential-free installation steps and changing the workflow/runtime contract tests.
5. **Move one non-content family at a time; retain the content paths for their owners.** Principle: small behavior-preserving refactorings, inward dependencies and one reason to change. Package commands stabilize operator usage first; real shared primitives need at least two callers. Keep `seed/` and `content-release/` where BUG-351 and DEBT-531 cite them until those records settle the planner and store boundary; this record's Verification keeps their move open. Decline a wholesale reorganization and an incidental rewrite of their evidence. Each moved family's imports, callers, guides and directory rows must pass together. Reversal is a mechanical family move with the same reference checks.
6. **Classify BUG-358 as P4.** Principle: severity follows demonstrated impact. The default resolver uses IPv4; Node returns `[::1]`, but postgres.js 3.4.9 parses that URL's host as `[` without connecting. Correcting classification repairs the diagnosis, not a supported broken lane. Keep the full lane on its exact resolver URL; a driver-level named-host possibility does not satisfy that lane’s stricter target contract. Reversal costs a priority change supported by a working IPv6-literal driver path and demonstrated impact.

Corrected 2026-10-19: fix the root census, bound the IPv6 claim and adopt the delegated decisions; retain content-owner prerequisites, the frozen-input audit exception and accepted ADRs.

## Resolution

Option B is implemented locally in #1560, with the retained boundaries below. This is not a merge, hosted-CI or production receipt. Each behavior change has red-first proof; each family move passed the directory check and its focused suites before the next family moved. Full-gate results belong in the PR description.

- **Defects:** BUG-354 through BUG-359 and BUG-361 have their fixes in this PR. #1559 has merged into dev and is integrated here: both seed entries refuse the retired environment variable and remote placeholders. #1584 adds the human entry’s remote-placeholder refusal before its acknowledgment check. CI and local test lanes pass the explicit placeholder flag. The environment seeds share `parseSeedPlanOnly` and never request placeholders. BUG-360 stays with its independently owned reset fix. No record is closed before its remaining checks permit it.
- **Operator interfaces:** package commands cover the hand-run guarded tools, which refuse a forwarded pnpm `--` as #1567 decided. Guides use those commands with arguments passed directly, and `tests/pnpm-operator-command-examples.test.ts` keeps the separator form out of documentation for every strict command. The frozen-input lockfile procedure retains `node --import tsx`, because invoking pnpm may install before the audit. Internal automation paths changed with their callers.
- **Shared helpers:** `scripts/lib/` owns the real-path entry detector, exact loopback predicate, native GitHub CLI transport, paginated issue-list transport and sequential test-lane command runner. The GitHub runner preserves each caller's timeout, output limit and error policy. The two list users retain independent lifecycle and entry-validation rules; the title-search alert adapter remains distinct. A universal issue client and common `MemoryIssues` fake were declined: renewal never closes, advisory issues require reviewed evidence, and search-backed alerts have a different contract. Equal names or method shapes do not make these the same policy.
- **Process boundaries:** all eight `node:child_process` module mocks were removed. Command tests use injected runners or actual temporary executables; the bounded AST guard in `tests/script-transport-policy.test.ts` prevents literal Vitest module-mock forms from returning. Merge/promotion tests use endpoint fixtures plus stateful bodies, comments and head-bound merge requests. `scripts/lib/command-plan.ts` serves three real lanes and retains interruption/process-group tests. The Stripe supervisor keeps its separate local deadline, environment filtering and report lifecycle. The short database and seed spawners remain distinct; generalizing their different exit/environment contracts would add an API without removing a shared policy.
- **Configuration:** CI now pulls the same pinned images through registry failover and starts the Compose services with bounded readiness and `--pull never`. Local Postgres publishes only on loopback. Managed migrations verify the ledger before and after Drizzle for Vercel, CI and local E2E; real-Postgres tests cover fresh, partial, current, drifted and unexpectedly unapplied ledgers. Offline generation uses `drizzle.generate.config.ts` without dotenv or credentials. The thin generation wrapper selects that config and propagates failure, passing arguments unchanged. Subprocess tests prove direct flags generate files and a forwarded `--` generates nothing. Integration runs prepare the resolver-owned local target by default, with `INTEGRATION_SKIP_PREPARE=true` for reruns; explicit existing-target mode never prepares it.
- **Deleted or relocated:** removed `ci/start-postgres.sh`, the unused `documentationLinks` and `resolveLocalE2EDatabaseUrl` APIs, the unused formatter export, and the two hand-maintained passed/mixed Stripe report fixtures. The real skipped-report shape remains, with generated positive and negative report controls. Test-only rule/asset scans live in `tests/`; header validation tests sit beside the validator; ledger unit tests sit beside the ledger. `choiceIdByLabel` and its tests moved into `tests/shared/`, leaving the revision writer's cited production lines intact. The CodeRabbit hold period is checked against `.coderabbit.yaml` by a policy test.
- **Layout:** `database/` (including `managed/`), `deploy/`, `test-lanes/`, `ci/`, `feedback/`, `operations/`, `review/`, `dependencies/`, `records/`, `watchers/`, `quality/` and `lib/` group non-content responsibilities. Dependency and Stripe data fixtures sit beside their families. `operations/` holds renewal-notice requeueing, which is unrelated to question-feedback export. Content root files, `seed/` and `content-release/` retain their paths for BUG-351 and DEBT-531. `scripts/README.md` is the checked current inventory; the evidence census above remains historical.
- **Splits:** `review/merge-policy.ts` holds the schemas and decision functions shared by the feature guard and promotion verifier; the command owns GitHub reads and mutations. The shared command runner no longer lives in the E2E planner. The record audit moved into `records/`, but its Markdown/link engine remains with the operator CLI: moving it into test support would invert that dependency or duplicate the audit. The advisory watch now shares transport; its remaining functions and four focused suites already separate dependency reading, range evaluation, issue policy and orchestration. A further file-count split is declined absent another consumer or an independently changing boundary.

### Retained Work and Explicitly Declined Changes

- Keep the header preflight, production operator seed, documented pre-merge check and native scheduled jobs for decisions 1–4. No new Environment, ruleset requirement, production secret consumer or Vercel setting is needed by those choices.
- Keep the standalone documentation audit. It gives operators all blocking findings together, also reports advisory due dates, and now has `pnpm docs:audit`; the test gate preserves every blocking category (BUG-356).
- Keep the Stripe provider wrapper. Replacing it with a reporter still needs an outer supervisor for the local five-minute process-tree deadline, environment gate, database-variable removal and sanitized failure summary. That leaves two layers for the same single caller, with no smaller equivalent design demonstrated.
- Keep script-specific workflow/package wiring assertions beside their script tests; they prove those commands' deployment contracts. Whole-repository scans live in `tests/`. Keep the content suite groupings that intentionally test several commands; a filename without one matching source is not by itself a defect.
- Keep human, managed and test-lane remote authorization distinct. A common host predicate does not authorize changing `DB_TARGET_ACK`, managed automation's URL contract or the explicit existing-target opt-ins. Keep `E2E_INSTANCE` and `E2E_APP_PORT`: source searches cannot establish whether an operator still sets them, and no deprecation/migration has been agreed.
- Keep the seed tag validator, newline normalization and seed/release write-side structure with BUG-351 and DEBT-531. A deletion must prove schema/validator equivalence on admitted inputs; the eventual planner boundary must preserve source freshness, immutable revisions, normalization and hold scope. These are content-contract changes, not prerequisites for grouping the other families. After those records establish the contract, their implementation can place pure policy inward and persistence behind ports. Do not infer that moving files implements that contract.
- Keep environment seeding and corpus preparation until a replacement supports every required target and BUG-351's source/plan contract, with DEBT-483's owner-approved per-target bootstrap. A protected dispatch job is declined here, not a substitute for those invariants. Keep the upstream-fix watcher while its Stryker watch / #1500 remains pending; DEBT-500's Waiting trigger owns removal once the patch is gone and no watch remains.
- **Evidence retained deliberately:**
  - `database/migration-ledger.ts` keeps its `E2E_PREFLIGHT:` error codes. They are a diagnostic contract that E2E output and runbooks search for; renaming them is its own change.
  - `records/next-record-id.ts` keeps its own `docs/records/closed.md` path. That file's presence is the allocator's proof that it runs at the repository root, and importing `documentation-archive.ts` for one path would add a dependency.
  - `ci/scan-playwright-output.ts` and `test-lanes/run-stripe-provider-contracts.ts` keep importing `tests/shared/`. Both are test-lane tools, and sharing the credential shapes and contract case titles keeps them from drifting.

Corrected 2026-10-19: record the implemented boundaries, family moves and configuration proofs; attribute merge requirements to the checked-in guard, explicitly decline unsupported abstractions and preserve content/owner follow-ups.

## Verification

- [x] BUG-354 through BUG-359 and BUG-361 have red-first implementations and focused proofs; their records retain outstanding gate, merge and promotion checks.
- [x] Hand-run commands have package scripts and guides use them, except the documented frozen-input lockfile audit.
- [x] One native `gh` runner serves eight callers; two list adapters share page transport without merging lifecycle policies. No test mocks `node:child_process`; the source guard has rejection controls.
- [x] Both scheduled jobs retain native zero-install execution; entry detection, the test-lane runner and loopback classification are shared with their real callers.
- [x] Every deletion candidate above is removed, retained with a source-level reason, or left with its named existing owner/prerequisite.
- [x] Non-content families moved one at a time with passing directory and family tests; content paths remain with BUG-351 and DEBT-531.
- [x] Configuration replacements are implemented locally or explicitly declined above; hosted behavior is not claimed from local tests.
- [x] Merge policy and command runner split; further record/advisory splits are declined with their dependency reasons.
- [x] The dispatched seed job is declined; no new CI production credential or external setting is required.
- [ ] Move the content families (`seed/`, `content-release/` and the root content commands) once BUG-351's source admission and DEBT-531's planner settle their boundary. Neither record takes this move on.
- [ ] Integrate #1559 and current `dev`, then pass the full gate, standalone audit and coordinated E2E on the final head.
- [ ] Record independent final challenge, review/CI and promotion evidence before closure under the index rules.


Corrected 2026-10-20: the criteria above were narrowed during implementation without a note. This one records how.
- The bugs' remaining checks now live in their own Verifying statuses, not here.
- "Declined by the owner" became "retained with a source-level reason" under the owner's 2026-10-19 delegation (Decisions). On 2026-10-20 the owner chose to land the work in one pull request, #1560, accepting Option C's concern that one review then covers many files.
- "The layout complete" covered every family. The content families remain, and BUG-351 and DEBT-531 do not take them on, so their item above stays open here.

## Related

- **Defects found by the review and challenge:** BUG-353 through BUG-361.
- **Closed prerequisite:** BUG-352 shipped the pooler's registry failover and the shared `ci/pull-image.sh` in #1552 (closed in #1555); its remaining owner/watch follow-ups do not block evaluating the Compose consolidation.
- **Content writers:** BUG-351 owns the planner and input freshness, DEBT-531 normalization and hold scope, and DEBT-483 the bootstrap.
- **Scripts touched by open records:**
  - BUG-329: the local target that changes in child processes;
  - DEBT-500's Waiting row (the record is closed): the upstream fix watch;
  - DEBT-505: the operational watcher;
  - DEBT-509: the advisory watch;
  - DEBT-523: the release watch.
- **Decisions:**
  - ADR-023: a list kept in a document needs a test;
  - ADR-024: review, merge and promotion;
  - ADR-025: test doubles;
  - ADR-019: the quality reports.

Corrected 2026-10-20: remove the obsolete argument-normalization rationale for the generation wrapper; it selects the offline config and forwards arguments unchanged under #1567.

Corrected 2026-10-20: integrate #1559’s explicit seed options and shared plan parser at the moved paths; retain #1566’s watcher restrictions and #1568’s renewal changes.

Corrected 2026-10-21: include #1584’s human-seed remote-placeholder refusal in the integrated resolution.
