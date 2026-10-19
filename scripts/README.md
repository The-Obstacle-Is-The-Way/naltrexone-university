# Scripts

Command-line tools that run outside the app: database commands, deploy and build checks, the local test harness, CI steps, question content (seeding, drafts and releases), review and merge governance, records tooling, scheduled watchers and quality reports.

The [directory](#directory) below gives every script one row: what it does and who runs it. `tests/scripts-directory.test.ts` checks two things:

- **Every inventoried file has exactly one row,** so adding, moving or deleting one without its row fails. The inventory includes non-hidden files except this README, `*.test.ts`, `*-test-helpers.ts` and `fixtures/**`.
- **Named automation contains a static reference to the script.** The check follows package commands, workflow steps' `run` text, and only `vercel.json`'s `buildCommand`, looking for the complete path or a `pnpm` package command that references it. Whole comment and `echo` lines are excluded.
  - A backticked `*.yml` name in "Run by" always means a workflow.
  - It does not interpret shell control flow, variables or imports, prove that a command executes, or find omitted callers. Those claims and the purpose column need source review; changes to callers update the row.

Known problems in this folder, and the proposed layout, are tracked in DEBT-532.

## Conventions

- **Run a script through its package script** when it has one (`pnpm db:migrate`), and otherwise with `pnpm exec tsx scripts/<path>`. Some scripts run another way:
  - `verify-lockfile-union.ts` runs with `node --import tsx`, as its guide explains;
  - the two `.mts` jobs run with plain `node`;
  - `ci/*.sh` runs with `bash`.

  Some callers still use a path where a package script exists. `ci.yml` and `AGENTS.md` call `resolve-local-test-target.ts` by path, and the local E2E plan spawns `run-local-test-db.ts` by path (DEBT-532).
- **Most TypeScript entry points export their work as a function.** Some inject their dependencies; others call real infrastructure. A typical guard compares `import.meta.url` with the file URL made from `process.argv[1]`, and runs the function only when they match. Use the full extension and the real path: extensionless and symlink invocations can silently do nothing (BUG-354).
  - Error reporting varies: message, stack, or a sanitized diagnostic; most guards set `process.exitCode = 1` on failure. Many carry `/* v8 ignore */` comments.
  - Not every entry point follows this yet. `import-draft-questions.ts`, `seed-production.ts` and `seed-all-environments.ts` run unconditionally, and some guards neither catch nor carry the comments.
  - `verify-lockfile-union.ts` runs unconditionally on purpose, because the guard misses a path given without its extension or through a symlink (BUG-354).
- **`.mts` marks a script that a workflow runs with plain `node`,** with no `pnpm install`. `tests/workflow-node-scripts.test.ts` requires it, because this package declares no module type.
  - Such a script cannot use `node_modules`.
  - It could import a `.ts` module here only by its full `.ts` name, which `tsconfig.json` does not allow today, so both jobs carry their own helpers.
- **Shell scripts live in `ci/`** and drive Docker and the runner's packages for CI steps.
- **Human database entry points use `database-command.ts`,** which requires an explicit `DATABASE_URL`, plus `DB_TARGET_ACK` naming the exact remote host, port and database set. Imported writer modules rely on their entry point's authorization.
  - The managed path in `internal/` takes no acknowledgement.
  - It is used by checked-in automation (CI, the Vercel build and the local test harness), and by the environment seeds after their own `DB_TARGET_ACK` check. The migration-ledger CLI uses the managed target authorizer directly.
  - A second rule still exists. The E2E passthrough and integration setup accept a remote host with `ALLOW_NON_LOCAL_DATABASE_URL=true`, without `DB_TARGET_ACK`; their outer runners also require the corresponding `*_USE_EXISTING_DATABASE=true` switch. The integration session-proof suites still reject remote targets (DEBT-532).
- **Tests sit beside their source** as `<name>.test.ts` and run in `pnpm test`.
  - A large suite splits into `<name>-<aspect>.test.ts`; shared test support is `<name>-test-helpers.ts`; data files go in `fixtures/`.
  - The directory leaves these out, because their names already say what they serve.
  - Database behavior is proved in `tests/integration/`.
  - Not yet true everywhere (DEBT-532). `content-release/release-command-args.test.ts`, `draft-question-body.test.ts` and `draft-question-split.test.ts` have no source file of those names, and the tests of `migration-ledger.ts` live in `tests/e2e/helpers/`.
- **A check of the whole repository is a policy test in `tests/`,** not a script here. `rule-to-test-register.ts` and `documentation-asset-budget.ts` are test-only policy helpers still here. The link audit in `documentation-archive.ts` also serves its operator CLI (DEBT-532).

## Directory

<!-- scripts-directory:start -->
### Database Commands

| File | What it does | Run by |
| --- | --- | --- |
| `database-target.ts` | Classifies a database URL as local or remote, and enforces the explicit-URL and `DB_TARGET_ACK` rules. | Imported by the database commands, the managed path, `verify-migration-ledger.ts` and the environment seeds |
| `database-command.ts` | Runs a person's database command: explicit URL, acknowledgement for a remote target, then logs the target without credentials. | Imported by `db-*.ts`, the content-release commands, `export-question-feedback.ts` and `seed/withdraw-questions.ts` |
| `database-process.ts` | Runs `pnpm` with a given `DATABASE_URL` and the parent's output, and rejects on a non-zero exit. | Imported by `db-generate.ts`, `db-migrate.ts`, `db-studio.ts` and `internal/run-managed-db-migrate.ts` |
| `db-generate.ts` | `drizzle-kit generate` behind the human database guard. | `pnpm db:generate` |
| `db-migrate.ts` | `drizzle-kit migrate` behind the human database guard. | `pnpm db:migrate` |
| `db-seed.ts` | The question seed (`seed.ts`) behind the human database guard. | `pnpm db:seed` |
| `db-studio.ts` | `drizzle-kit studio` behind the human database guard. | `pnpm db:studio` |
| `internal/database-target-managed.ts` | The managed authorizer: validates the URL and asks for no acknowledgement. | Imported by `internal/database-command-managed.ts` and `verify-migration-ledger.ts` |
| `internal/database-command-managed.ts` | The managed counterpart of `database-command.ts`. | Imported by `internal/run-managed-db-migrate.ts` and `internal/run-managed-db-seed.ts` |
| `internal/run-managed-db-migrate.ts` | `drizzle-kit migrate` for checked-in automation. | The `vercel.json` build command; `ci.yml` and `stripe-hosted-checkout-smoke.yml`; the local E2E plan |
| `internal/run-managed-db-seed.ts` | The question seed for checked-in automation. | `ci.yml` and `stripe-hosted-checkout-smoke.yml`; the local E2E plan; the environment seeds |
| `migration-ledger.ts` | Compares a database's migration ledger with the migration journal and each migration file's hash. | Imported by `verify-migration-ledger.ts` and the E2E credential preflight |
| `verify-migration-ledger.ts` | Checks the ledger before migrating (pending migrations allowed) or after (exact match). | The `vercel.json` build command, before and after the managed migrate |

### Deploy and Build Checks

| File | What it does | Run by |
| --- | --- | --- |
| `check-clerk-jwt-key.ts` | Fails on an invalid configured key, a configured key without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, or a confirmed mismatch with Clerk's published keys. An absent key passes; an unreadable key set warns and passes unchecked. | The `vercel.json` build command, first |
| `check-server-action-manifest.ts` | Fails a build in which a server action or `'use cache'` function declares an argument beyond its first. | `pnpm build`, after `next build`, so also `ci.yml`, `stripe-hosted-checkout-smoke.yml` and the `vercel.json` build command |

### Local Test Harness

| File | What it does | Run by |
| --- | --- | --- |
| `resolve-local-test-target.ts` | Derives a Compose project, database URL and ports from the clone path or explicit overrides. Ports come from a hash of the clone's identity over 10,000 slots and are not checked for collisions; BUG-329's long-name limitation applies, and shared provider users still require coordination. | `pnpm local:test:target`; `ci.yml`; the local test commands; `tests/shared/resolve-integration-database-url.ts`; the integration database command in `AGENTS.md` |
| `run-local-test-db.ts` | Starts, stops or resets this clone's Docker test database and pooler. | `pnpm db:test:up`, `pnpm db:test:down` and `pnpm db:test:reset`; the local E2E plan |
| `run-local-integration.ts` | Runs the integration lane against this clone's test database, or an explicitly opted-in existing database. Does not start, migrate or seed it. | `pnpm test:integration` and `pnpm test:integration:coverage`; `ci.yml` |
| `run-local-e2e.ts` | Runs Playwright after preparing this clone's database, or against an explicitly opted-in existing database (`E2E_USE_EXISTING_DATABASE`), as CI does. | `pnpm test:e2e` and `pnpm test:e2e:stripe-hosted`; `ci.yml` and `stripe-hosted-checkout-smoke.yml` |
| `e2e-local-orchestrator.ts` | Builds the local E2E plan, and runs a command plan with signal forwarding for all three local test commands. | Imported by `run-local-e2e.ts`, `run-local-integration.ts` and `run-local-test-db.ts` |
| `run-stripe-provider-contracts.ts` | Runs the Stripe provider-contract suite in test mode, and fails unless every named case ran and passed. | `pnpm test:stripe-provider`; `stripe-trial-clock-smoke.yml` |

### CI Steps

| File | What it does | Run by |
| --- | --- | --- |
| `ci/start-postgres.sh` | Starts CI's Postgres from the first registry that serves the pinned digest, and waits until it is healthy. | `ci.yml` and `stripe-hosted-checkout-smoke.yml` |
| `ci/pull-image.sh` | Pulls an image by digest from the first registry that serves it; sourced as a function or run directly. | `ci.yml`, for PgBouncer; sourced by `ci/start-postgres.sh` |
| `ci/install-playwright-chromium.sh` | Installs Chromium and its system packages, working around the runner's apt mirrors. | `ci.yml` and `stripe-hosted-checkout-smoke.yml` |
| `ci/scan-playwright-output.ts` | Checks upload-eligible output for supported UTF-8 text types and known Clerk credential patterns; exits nonzero on refusal. Hidden paths and `trace.zip` are excluded, matching the workflow uploads. | `ci.yml` and `stripe-hosted-checkout-smoke.yml` |

### Question Content: Seeding

| File | What it does | Run by |
| --- | --- | --- |
| `seed.ts` | Syncs question MDX under `content/questions/`, excluding placeholder files unless `SEED_INCLUDE_PLACEHOLDERS=true`; otherwise archives the ten fixture slugs. Refuses an active content release. #1559 replaces the environment switch with an explicit flag (BUG-353). | Imported by `db-seed.ts` and `internal/run-managed-db-seed.ts` |
| `seed/file-reader.ts` | Finds and reads the question MDX files; fails if none remain after filtering. | Imported by `seed.ts` and `content-release/stage-release.ts`; its source-file type is used by the seed writer and release builder |
| `seed/question-parser.ts` | Parses and validates one question file into the seed's representation. | Imported by the seed writer, the release builder and `draft-question-import.ts` |
| `seed/question-syncer.ts` | The seed's writer: inserts or updates each question in its own transaction. | Imported by `seed.ts`; the release builder imports its preparation and tag helpers |
| `seed/question-revision-writer.ts` | Appends a question revision and its choices. | Imported by the seed writer, the release builder and `tests/shared/question-fixtures.ts` |
| `seed/question-withdrawal-writer.ts` | Records and reads per-revision withdrawals. | Imported by the seed writer, release activation and `seed/withdraw-questions.ts` |
| `seed/tag-manager.ts` | Validates a question's tags and upserts tag rows. | Imported by `seed/question-syncer.ts` |
| `seed/placeholder-archiver.ts` | Archives the ten committed fixture slugs, including updating timestamps and counting rows already archived; refuses an active release. | Imported by `seed.ts` |
| `seed/seed-summary.ts` | Formats the seed's report lines. | Imported by `seed.ts` |
| `seed/only-row.ts` | Returns the first row, or throws if none exists; it does not reject extra rows. | Imported by the seed and release writers and `tests/shared/question-fixtures.ts` |
| `seed/qid-command-args.ts` | Parses the operator commands' `--qid`, `--apply`, `--lift`, `--reason` and `--authority` arguments. | Imported by `seed/withdraw-questions.ts` and the content-release commands |
| `seed/withdraw-questions.ts` | Archives questions by QID and permanently withdraws every stored revision not already withdrawn; a dry run unless `--apply`. | By hand, per `docs/architecture/content-pipeline.md` and `docs/architecture/integrations/postgres.md` |
| `seed-helpers.ts` | Splits the reference section off an explanation, and detects the legacy wrong-answers heading. | Imported by `seed/question-parser.ts` |
| `seed-all-environments.ts` | Seeds deduplicated `.env.local`, Vercel Development and Preview targets from drafts; checks the Production host/port/database exclusion first. Requires the pinned preinstalled Vercel CLI and remote-target acknowledgment, including for `--plan`. | `pnpm db:seed:all` |
| `seed-production.ts` | Resolves Vercel Production and seeds drafts as published questions; refuses an ambient `DATABASE_URL`. Requires the pinned preinstalled Vercel CLI and remote-target acknowledgment, including for `--plan`. | `pnpm db:seed:prod` |
| `seed-environment-targets.ts` | Plans and authorizes the environment seeds' targets, then prepares the corpus and seeds each one unless plan-only. | Imported by `seed-all-environments.ts` and `seed-production.ts`; its types are used by `seed-environment-runtime.ts` |
| `seed-environment-runtime.ts` | The environment seeds' real dependencies: Vercel CLI environment pulls, the corpus import and a child seed per target. | Imported by `seed-all-environments.ts` and `seed-production.ts` |
| `prepare-seed-corpus.ts` | Rebuilds `content/questions/imported/` from the drafts and swaps it into place. | Imported by `seed-environment-runtime.ts` |

### Question Content: Drafts

| File | What it does | Run by |
| --- | --- | --- |
| `draft-question-import.ts` | Splits draft files into question blocks and converts each into canonical question MDX. | Imported by `import-draft-questions.ts` |
| `import-draft-questions.ts` | Converts `recall.md` and `vignettes.md` from the drafts tree to canonical MDX. Defaults to draft status; preflights the batch and requires an empty output directory for writes. `--in`, `--out`, `--status` and `--dry-run` configure it; unknown arguments are currently ignored. | `pnpm content:import:drafts`; the environment seeds |

### Question Content: Releases

| File | What it does | Run by |
| --- | --- | --- |
| `content-release/bootstrap-release.ts` | Previews adoption of what is live as the first release; `--apply` requires the preview's plan ID and disables subsequent direct seeding. | By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/stage-release.ts` | Previews question files as a release on top of the active one; `--apply` persists staging. Omitted live QIDs require `--remove`, and older revisions require `--revert`. | By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/activate-release.ts` | Previews an activation or rollback by default. `--release`, `--expect-active`, `--reason` and `--authority` are always required; `--apply` also requires the preview's `--plan`. | By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/hold-questions.ts` | Previews holds or lifts on live revisions; `--apply` persists them and re-applies the active release. | By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/command-support.ts` | The release commands' database client, preview-or-apply transaction and output. | Imported by the four release commands |
| `content-release/release-activation.ts` | The release engine: the pointer lock, the seed guard, staging, activation and bootstrap. | Imported by `activate-release.ts`, `bootstrap-release.ts` and `command-support.ts`, the release builder and holds, and the seed writers |
| `content-release/release-builder.ts` | Stages a release from question files: new questions, changed revisions, removals and reverts. | Imported by `content-release/stage-release.ts` |
| `content-release/release-holds.ts` | Places or lifts holds on the live revision, then re-activates. | Imported by `content-release/hold-questions.ts` |
| `content-release/release-manifest.ts` | Builds, canonicalizes, hashes and parses a release manifest. | Imported by release activation and the release builder |

### Feedback

| File | What it does | Run by |
| --- | --- | --- |
| `export-question-feedback.ts` | Exports learner feedback as CSV or JSON, redacting user IDs and comments by default. | `pnpm export:feedback` |

### Review, Merge and Promotion

| File | What it does | Run by |
| --- | --- | --- |
| `merge-reviewed-pr.ts` | The merge guard: an exact-head or carried CodeRabbit approval, resolved threads, green checks and `main`'s promotion in `dev`; merges with `--merge`. | By hand, per `AGENTS.md`; `verify-promotion.ts` imports its checks |
| `verify-promotion.ts` | Proves that every source pull request of a `dev`-to-`main` promotion was reviewed; merges with `--merge`. | By hand, per `AGENTS.md` |
| `diff-hunks.ts` | Decides whether a pull request's diff moved only because its base changed. | Imported by `merge-reviewed-pr.ts` |
| `coderabbit-learnings.ts` | The marker and parser for a CodeRabbit reply that recorded a learning. | Imported by `merge-reviewed-pr.ts` and `coderabbit-learnings-review.ts` |
| `coderabbit-learnings-review.ts` | Keeps one owner-assigned issue listing the learnings CodeRabbit recorded since the last report. | `coderabbit-learnings-review.yml` |
| `production-release-watch.ts` | After a 45-minute grace period, reports absent/failed main CI or no successful GitHub Production deployment record; leaves the issue unchanged while CI is pending. | `production-release-watch.yml` |

### Dependencies

| File | What it does | Run by |
| --- | --- | --- |
| `lockfile-union.ts` | Checks that a bundle's `pnpm-lock.yaml` changes exactly the union of its source pull requests' changes. | Imported by `verify-lockfile-union.ts` |
| `verify-lockfile-union.ts` | The lockfile union check's command line. | By hand with `node --import tsx`, per `docs/guides/dependencies/updating-dependencies.md` |

### Records and Documentation

| File | What it does | Run by |
| --- | --- | --- |
| `next-record-id.ts` | Prints the next free BUG or DEBT ID. | By hand, per `AGENTS.md` |
| `documentation-archive.ts` | Audits records and documentation links. Its CLI exits 1 for blocking findings, but overdue/far-future actions are reported separately; BUG-356 describes missing live-tree assertions. | Imported by the documentation tests and `documentation-due-checks.ts`; run manually for the complete blocking audit |
| `documentation-due-checks.ts` | Keeps one issue for due or excessively far-future record actions and queue-review dates. An unreadable queue date instead fails the command before updating the issue. | `documentation-due-checks.yml` |
| `documentation-asset-budget.ts` | The per-file size budget for documentation assets. | Imported by `tests/documentation-asset-budget.test.ts` |
| `rule-to-test-register.ts` | Checks named test files and titles against static declaration, skip and conditional rules; does not prove execution and misses some unreachable declarations (BUG-361). | Imported by `tests/rule-to-test-register.test.ts` |

### Scheduled Watchers

| File | What it does | Run by |
| --- | --- | --- |
| `github-alert-issues.ts` | Keeps one GitHub issue per alert condition: creates or reopens it, edits its body and comments when changed, and closes it when the condition clears. | Imported by `operational-alert-watcher.ts`, `upstream-fix-watch.ts`, `production-release-watch.ts`, `coderabbit-learnings-review.ts` and `documentation-due-checks.ts` |
| `operational-alert-watcher.ts` | Checks that Sentry's alert path still works, and keeps an issue open while it does not. | `operational-alert-watcher.yml` |
| `upstream-advisory-watch.mts` | Scans upstream repository advisories from its configured start date; ignores medium/low advisories from indirect-only repositories, raises other eligible issues unless reviewed ranges prove locked versions unaffected, and closes existing issues on that evidence. | `upstream-advisory-watch.yml`, with plain `node` |
| `upstream-fix-watch.ts` | Raises an issue when a non-prerelease npm release follows a tracked fix's landing; the owner still verifies that the release contains the fix. | `upstream-fix-watch.yml` |
| `security-txt-renewal.mts` | Opens an issue when `security.txt`'s `Expires` date is less than 90 days away. | `security-txt-renewal.yml`, with plain `node` |

### Quality Reports

| File | What it does | Run by |
| --- | --- | --- |
| `crap-report.ts` | Ranks functions by CRAP score: coverage from the three test lanes against cyclomatic complexity. | `pnpm quality:crap` |
| `mutation-report-integrity.ts` | Fails on unreadable JSON, invalid files/mutants/status shapes, or a survivor without a valid positive `testsCompleted` count. | `mutation.yml` |

### Manual Operator Tool

| File | What it does | Run by |
| --- | --- | --- |
| `validate-header-safe-secret.ts` | Prints metadata about named environment variables (presence, length, header safety), never their values; exits 1 on invalid input. | By hand, as listed in `docs/architecture/environments.md`; no checked-in automation caller since `0ba85539` removed its CI step |
<!-- scripts-directory:end -->
