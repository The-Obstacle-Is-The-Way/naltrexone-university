# Scripts

Command-line tools that run outside the app: database commands, deploy and build checks, the local test harness, CI steps, question content (seeding, drafts and releases), review and merge governance, records tooling, scheduled watchers and quality reports.

The [directory](#directory) below gives every script one row: what it does and who runs it. `tests/scripts-directory.test.ts` checks two things:

- **Every script has exactly one row,** so adding, moving or deleting a script without its row fails.
- **Every package script, workflow and `vercel.json` build that a row's "Run by" names runs that script.** That is, the package script's command, a workflow step's `run`, or the build command names the script's path, or a package script that does.
  - A backticked `*.yml` name in "Run by" always means a workflow.
  - Everything else a row says is kept by review, so a change to a script's callers updates its row.

Known problems in this folder, and the proposed layout, are tracked in DEBT-532.

## Conventions

- **Run a script through its package script** when it has one (`pnpm db:migrate`), and otherwise with `pnpm exec tsx scripts/<path>`. Some scripts run another way:
  - `verify-lockfile-union.ts` runs with `node --import tsx`, as its guide explains;
  - the two `.mts` jobs run with plain `node`;
  - `ci/*.sh` runs with `bash`.

  Some callers still use a path where a package script exists. `ci.yml` and `AGENTS.md` call `resolve-local-test-target.ts` by path, and the local E2E plan spawns `run-local-test-db.ts` by path (DEBT-532).
- **An entry point exports its work as a function** with injectable dependencies, so tests can call it. At the bottom, a guard compares `import.meta.url` with `process.argv[1]`, and runs the function only when the file is executed directly.
  - On failure the entry point prints the error's message and sets `process.exitCode = 1`. Most wrap the guard in `/* v8 ignore */` comments.
  - Not every entry point follows this yet. `import-draft-questions.ts`, `seed-production.ts` and `seed-all-environments.ts` run unconditionally, and some guards neither catch nor carry the comments.
  - `verify-lockfile-union.ts` runs unconditionally on purpose, because the guard misses a path given without its extension or through a symlink (BUG-354).
- **`.mts` marks a script that a workflow runs with plain `node`,** with no `pnpm install`. `tests/workflow-node-scripts.test.ts` requires it, because this package declares no module type.
  - Such a script cannot use `node_modules`.
  - It could import a `.ts` module here only by its full `.ts` name, which `tsconfig.json` does not allow today, so both jobs carry their own helpers.
- **Shell scripts live in `ci/`** and drive Docker and the runner's packages for CI steps.
- **A database command goes through `database-command.ts`,** which requires an explicit `DATABASE_URL`, plus `DB_TARGET_ACK` for a remote target.
  - The managed path in `internal/` takes no acknowledgement.
  - It is used by checked-in automation (CI, the Vercel build and the local test harness), and by the environment seeds after their own `DB_TARGET_ACK` check.
  - A second rule still exists. With `E2E_USE_EXISTING_DATABASE=true` or `INTEGRATION_USE_EXISTING_DATABASE=true`, the E2E and integration lanes accept any host once `ALLOW_NON_LOCAL_DATABASE_URL=true` is set, without `DB_TARGET_ACK` (DEBT-532).
- **Tests sit beside their source** as `<name>.test.ts` and run in `pnpm test`.
  - A large suite splits into `<name>-<aspect>.test.ts`; shared test support is `<name>-test-helpers.ts`; data files go in `fixtures/`.
  - The directory leaves these out, because their names already say what they serve.
  - Database behavior is proved in `tests/integration/`.
  - Not yet true everywhere (DEBT-532). `content-release/release-command-args.test.ts`, `draft-question-body.test.ts` and `draft-question-split.test.ts` have no source file of those names, and the tests of `migration-ledger.ts` live in `tests/e2e/helpers/`.
- **A check of the whole repository is a policy test in `tests/`,** not a script here. Not yet true of `rule-to-test-register.ts`, `documentation-asset-budget.ts` and the link audit in `documentation-archive.ts`, which serve only tests (DEBT-532).

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
| `check-clerk-jwt-key.ts` | Fails a deploy whose `CLERK_JWT_KEY` does not match the keys Clerk publishes. | The `vercel.json` build command, first |
| `check-server-action-manifest.ts` | Fails a build in which a server action or `'use cache'` function declares an argument beyond its first. | `pnpm build`, after `next build` |

### Local Test Harness

| File | What it does | Run by |
| --- | --- | --- |
| `resolve-local-test-target.ts` | Derives this clone's own Compose project, database URL and ports, so clones can test at the same time. | `pnpm local:test:target`; `ci.yml`; the local test commands; `tests/shared/resolve-integration-database-url.ts`; the integration database command in `AGENTS.md` |
| `run-local-test-db.ts` | Starts, stops or resets this clone's Docker test database and pooler. | `pnpm db:test:up`, `pnpm db:test:down` and `pnpm db:test:reset`; the local E2E plan |
| `run-local-integration.ts` | Runs the integration lane against this clone's test database, or against a given database in CI. | `pnpm test:integration` and `pnpm test:integration:coverage`; `ci.yml` |
| `run-local-e2e.ts` | Runs Playwright after preparing this clone's database, or against a given database in CI. | `pnpm test:e2e` and `pnpm test:e2e:stripe-hosted`; `ci.yml` and `stripe-hosted-checkout-smoke.yml` |
| `e2e-local-orchestrator.ts` | Builds the local E2E plan, and runs a command plan with signal forwarding for all three local test commands. | Imported by `run-local-e2e.ts`, `run-local-integration.ts` and `run-local-test-db.ts` |
| `run-stripe-provider-contracts.ts` | Runs the Stripe provider-contract suite in test mode, and fails unless every named case ran and passed. | `pnpm test:stripe-provider`; `stripe-trial-clock-smoke.yml` |

### CI Steps

| File | What it does | Run by |
| --- | --- | --- |
| `ci/start-postgres.sh` | Starts CI's Postgres from the first registry that serves the pinned digest, and waits until it is healthy. | `ci.yml` and `stripe-hosted-checkout-smoke.yml` |
| `ci/pull-image.sh` | Pulls an image by digest from the first registry that serves it; sourced as a function or run directly. | `ci.yml`, for PgBouncer; sourced by `ci/start-postgres.sh` |
| `ci/install-playwright-chromium.sh` | Installs Chromium and its system packages, working around the runner's apt mirrors. | `ci.yml` and `stripe-hosted-checkout-smoke.yml` |
| `ci/scan-playwright-output.ts` | Refuses to upload a failed run's output if it holds a binary file or a Clerk credential. | `ci.yml` and `stripe-hosted-checkout-smoke.yml` |

### Question Content: Seeding

| File | What it does | Run by |
| --- | --- | --- |
| `seed.ts` | Syncs every question file under `content/questions/` into a database, then archives the placeholder fixtures unless they are included. | Imported by `db-seed.ts` and `internal/run-managed-db-seed.ts` |
| `seed/file-reader.ts` | Finds and reads the question MDX files. | Imported by `seed.ts` and `content-release/stage-release.ts` |
| `seed/question-parser.ts` | Parses and validates one question file into the seed's representation. | Imported by the seed writer, the release builder and `draft-question-import.ts` |
| `seed/question-syncer.ts` | The seed's writer: inserts or updates each question in its own transaction. | Imported by `seed.ts`; the release builder imports its tag helpers |
| `seed/question-revision-writer.ts` | Appends a question revision and its choices. | Imported by the seed writer, the release builder and `tests/shared/question-fixtures.ts` |
| `seed/question-withdrawal-writer.ts` | Records and reads per-revision withdrawals. | Imported by the seed writer, release activation and `seed/withdraw-questions.ts` |
| `seed/tag-manager.ts` | Validates a question's tags and upserts tag rows. | Imported by `seed/question-syncer.ts` |
| `seed/placeholder-archiver.ts` | Archives the committed placeholder fixtures by exact slug. | Imported by `seed.ts` |
| `seed/seed-summary.ts` | Formats the seed's report lines. | Imported by `seed.ts` |
| `seed/only-row.ts` | Returns the single row a write must produce, or throws. | Imported by the seed and release writers and `tests/shared/question-fixtures.ts` |
| `seed/qid-command-args.ts` | Parses the operator commands' `--qid`, `--apply`, `--lift`, `--reason` and `--authority` arguments. | Imported by `seed/withdraw-questions.ts` and the content-release commands |
| `seed/withdraw-questions.ts` | Permanently withdraws questions by QID; a dry run unless `--apply`. | By hand, per `docs/architecture/content-pipeline.md` |
| `seed-helpers.ts` | Splits the reference section off an explanation, and detects the legacy wrong-answers heading. | Imported by `seed/question-parser.ts` |
| `seed-all-environments.ts` | Seeds every non-production environment's database from the drafts. | `pnpm db:seed:all` |
| `seed-production.ts` | Seeds production from the drafts, as published questions. | `pnpm db:seed:prod` |
| `seed-environment-targets.ts` | Plans and authorizes the environment seeds' targets, then prepares the corpus and seeds each one. | Imported by `seed-all-environments.ts` and `seed-production.ts` |
| `seed-environment-runtime.ts` | The environment seeds' real dependencies: Vercel CLI environment pulls, the corpus import and a child seed per target. | Imported by `seed-all-environments.ts` and `seed-production.ts` |
| `prepare-seed-corpus.ts` | Rebuilds `content/questions/imported/` from the drafts and swaps it into place. | Imported by `seed-environment-runtime.ts` |

### Question Content: Drafts

| File | What it does | Run by |
| --- | --- | --- |
| `draft-question-import.ts` | Splits draft files into question blocks and converts each into canonical question MDX. | Imported by `import-draft-questions.ts` |
| `import-draft-questions.ts` | Converts `content/drafts/questions/` into `content/questions/imported/`. | `pnpm content:import:drafts`; the environment seeds |

### Question Content: Releases

| File | What it does | Run by |
| --- | --- | --- |
| `content-release/bootstrap-release.ts` | Adopts what is live as a database's first content release. | By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/stage-release.ts` | Stages the question files as a release on top of the active one. | By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/activate-release.ts` | Previews, then applies, an activation or a rollback. | By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/hold-questions.ts` | Places or lifts holds on questions and re-applies the active release. | By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/command-support.ts` | The release commands' database client, preview-or-apply transaction and output. | Imported by the four release commands |
| `content-release/release-activation.ts` | The release engine: the pointer lock, the seed guard, staging, activation and bootstrap. | Imported by the release commands, the release builder and holds, and the seed writers |
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
| `production-release-watch.ts` | Keeps an issue open while `main`'s head lacks a passing CI run or a production deployment. | `production-release-watch.yml` |

### Dependencies

| File | What it does | Run by |
| --- | --- | --- |
| `lockfile-union.ts` | Checks that a bundle's `pnpm-lock.yaml` changes exactly the union of its source pull requests' changes. | Imported by `verify-lockfile-union.ts` |
| `verify-lockfile-union.ts` | The lockfile union check's command line. | By hand with `node --import tsx`, per `docs/guides/dependencies/updating-dependencies.md` |

### Records and Documentation

| File | What it does | Run by |
| --- | --- | --- |
| `next-record-id.ts` | Prints the next free BUG or DEBT ID. | By hand, per `AGENTS.md` |
| `documentation-archive.ts` | Audits the records and documentation links: the ledger, statuses, due dates, index rows and link targets. | Imported by the documentation tests and `documentation-due-checks.ts` |
| `documentation-due-checks.ts` | Keeps one issue for overdue dated record actions and the queue review. | `documentation-due-checks.yml` |
| `documentation-asset-budget.ts` | The per-file size budget for documentation assets. | Imported by `tests/documentation-asset-budget.test.ts` |
| `rule-to-test-register.ts` | Checks that each business rule's proving tests still exist and still run. | Imported by `tests/rule-to-test-register.test.ts` |

### Scheduled Watchers

| File | What it does | Run by |
| --- | --- | --- |
| `github-alert-issues.ts` | Keeps one GitHub issue per alert condition: opens it, updates it with a comment, and closes it when the condition clears. | Imported by `operational-alert-watcher.ts`, `upstream-fix-watch.ts`, `production-release-watch.ts`, `coderabbit-learnings-review.ts` and `documentation-due-checks.ts` |
| `operational-alert-watcher.ts` | Checks that Sentry's alert path still works, and keeps an issue open while it does not. | `operational-alert-watcher.yml` |
| `upstream-advisory-watch.mts` | Raises an issue for each new security advisory published by a repository behind the lockfile. | `upstream-advisory-watch.yml`, with plain `node` |
| `upstream-fix-watch.ts` | Raises an issue once an upstream fix that a local patch waits on has been released. | `upstream-fix-watch.yml` |
| `security-txt-renewal.mts` | Opens an issue when `security.txt`'s `Expires` date is less than 90 days away. | `security-txt-renewal.yml`, with plain `node` |

### Quality Reports

| File | What it does | Run by |
| --- | --- | --- |
| `crap-report.ts` | Ranks functions by CRAP score: coverage from the three test lanes against cyclomatic complexity. | `pnpm quality:crap` |
| `mutation-report-integrity.ts` | Fails the mutation run when a surviving mutant ran no test, or the report is malformed. | `mutation.yml` |

### Unused

| File | What it does | Run by |
| --- | --- | --- |
| `validate-header-safe-secret.ts` | Prints metadata about named environment variables (presence, length, header safety), never their values. | Nobody since its CI step was removed in `0ba85539`; `docs/architecture/environments.md` lists it as an operator tool |
<!-- scripts-directory:end -->
