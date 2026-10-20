# Scripts

Command-line tools that run outside the app: database commands, deploy and build checks, the local test harness, CI steps, question content (seeding, drafts and releases), review and merge governance, records tooling, scheduled watchers and quality reports.

The [directory](#directory) below gives every script one row: what it does and who runs it. `tests/scripts-directory.test.ts` checks two things:

- **Every inventoried file has exactly one row,** with a description and a caller, so adding, moving or deleting one without its row fails. The inventory includes non-hidden files except this README, `*.test.ts`, `*-test-helpers.ts` and JSON/YAML data files in any `fixtures/` directory; other files placed there need a row. Rows must sit in a table, outside HTML comments and code fences.
- **Named automation contains a static reference to the script.** "Run by" names automation only as a code span: `pnpm <script>` (arguments allowed), a workflow file (`*.yml` or `*.yaml`), or `vercel.json`. A `pnpm exec` command must name the script's own path. A mention of `pnpm`, a workflow file or Vercel outside a code span fails, and so does a code span naming `npm`, `npx` or `yarn`.
  - The check follows package commands, workflow steps' `run` text, and only `vercel.json`'s `buildCommand`, looking for the complete path or a `pnpm` package command that references it. Comments and commands whose first word names `echo` or `printf` (including executable paths) are excluded.
  - It does not interpret shell control flow, command wrappers, variables, heredocs, continued lines or imports, prove that a command executes, or find omitted callers. Those claims and the purpose column need source review; changes to callers update the row.

The non-content families are grouped below. Remaining content-boundary work stays with BUG-351 and DEBT-531; DEBT-532 records the layout decisions and validation.

## Conventions

- **Run a script through its package script** when it has one (`pnpm db:migrate`), and otherwise with `pnpm exec tsx scripts/<path>`. Some scripts run another way:
  - `dependencies/verify-lockfile-union.ts` runs with `node --import tsx`, as its guide explains;
  - the two `.mts` jobs run with plain `node`;
  - `ci/*.sh` runs with `bash`.

  Some callers still use a path where a package script exists. `ci.yml` calls `test-lanes/resolve-local-test-target.ts` by path, and the local E2E plan spawns `test-lanes/run-local-test-db.ts` by path (DEBT-532).
- **Most TypeScript entry points export their work as a function.** Some inject their dependencies; others call real infrastructure. Guarded entry points use `isMain` from `lib/entry-point.mts`, which compares real paths and tries the module extension for an extensionless entry argument. The shared check resolves symlinks; imports do not enter the guarded command body. `tests/script-entry-points.test.ts` exercises both runtimes and requires a top-level shared check in modules with executable entry signals; its bounded AST scan ignores comments and nested lookalikes. The package commands added by this change and `local:test:target` accept one leading `--` from pnpm 11. #1559 owns that change for the two environment seeds.
  - Error reporting varies: message, stack, or a sanitized diagnostic; most guards set `process.exitCode = 1` on failure. Many carry `/* v8 ignore */` comments.
  - Not every entry point follows this yet. `import-draft-questions.ts`, `seed-production.ts` and `seed-all-environments.ts` run unconditionally, and some guards neither catch nor carry the comments.
  - `dependencies/verify-lockfile-union.ts` is also an unconditional thin CLI; reusable logic lives in `dependencies/lockfile-union.ts`.
- **Workflow entry points run with plain `node` only when they use `.mts`,** with no `pnpm install`. `tests/workflow-node-scripts.test.ts` requires that extension because this package declares no module type. The shared native entry helper also uses `.mts`.
  - Such a script cannot use `node_modules`.
  - Native TypeScript imports include their extension; `tsconfig.json` permits this under `noEmit`. Shared native helpers use only Node built-ins.
- **Shell scripts live in `ci/`** and drive Docker and the runner's packages for CI steps.
- **Human connected database entry points use `database/database-command.ts`,** which requires an explicit `DATABASE_URL`, plus `DB_TARGET_ACK` naming the exact remote host, port and database set. The environment seeds apply the same rule through `database/database-target.ts` directly. Imported writer modules rely on their entry point's authorization.
  - `pnpm db:generate` is offline: it reads schema and snapshots with `drizzle.generate.config.ts`, without dotenv or credentials. Its thin wrapper only normalizes pnpm arguments and propagates failure.
  - The managed path in `database/managed/` takes no acknowledgment.
  - It is used by checked-in automation (CI, the Vercel build and the local test harness), and by the environment seeds after their own `DB_TARGET_ACK` check. The migration-ledger CLI uses the managed target authorizer directly.
  - A second rule still exists. The E2E passthrough and integration setup accept a remote host with `ALLOW_NON_LOCAL_DATABASE_URL=true`, without `DB_TARGET_ACK`; their outer runners also require the corresponding `*_USE_EXISTING_DATABASE=true` switch. The integration session-proof suites still reject remote targets (DEBT-532).
- **Tests sit beside their source** as `<name>.test.ts` and run in `pnpm test`.
  - A large suite splits into `<name>-<aspect>.test.ts`; shared test support is `<name>-test-helpers.ts`; data files go in `fixtures/`.
  - The directory leaves these out, because their names already say what they serve.
  - Database behavior is proved in `tests/integration/`.
  - Not yet true everywhere (DEBT-532). `content-release/bootstrap-manifest.test.ts`, `content-release/release-command-args.test.ts`, `draft-question-body.test.ts` and `draft-question-split.test.ts` have no source file of those names. `seed.test.ts` tests `seed/question-parser.ts` and `seed/tag-manager.ts`, `seed-all-environments.test.ts` and `seed-production.test.ts` test `seed-environment-targets.ts`.
- **A check of the whole repository is a policy test in `tests/`.** Script-specific workflow/package wiring checks stay beside the script whose deployment contract they prove. The rule-register and documentation-asset source checks live in `tests/`. The link audit in `records/documentation-archive.ts` also serves its operator CLI (DEBT-532).

## Directory

<!-- scripts-directory:start -->
### Shared Command Helpers

| File | What it does | Run by |
| --- | --- | --- |
| `lib/github-issues.mts` | Reads and validates paginated repository issue pages; callers validate entries and own issue policy. | Imported by `watchers/security-txt-renewal.mts` and `watchers/upstream-advisory-watch.mts` |
| `lib/github-cli.mts` | Native Node GitHub CLI transport with caller-owned limits, captured output and optional stdin. | Imported by the merge and promotion commands, alert issues, renewal, advisory, release, learnings and upstream-fix watchers |
| `lib/command-plan.ts` | Runs sequential test-lane command plans; preserves scoped environments and POSIX process-group interruption/cleanup. | Imported by `test-lanes/run-local-e2e.ts`, `test-lanes/run-local-integration.ts` and `test-lanes/run-local-test-db.ts` |
| `lib/entry-point.mts` | Compares real file paths for guarded entry points, including runtime-resolved extensionless paths and symlinks. Uses only Node built-ins. | Imported by guarded TypeScript commands, including the native scheduled jobs |
| `lib/loopback-hostname.ts` | Classifies localhost and the exact IPv4/IPv6 loopback hosts, normalizing URL brackets. Callers retain URL validation and authorization policies; human database commands separately retain their 127/8 allowance. | Imported by database target classification, the E2E plan, integration setup and helpers |

### Database Commands

| File | What it does | Run by |
| --- | --- | --- |
| `database/database-target.ts` | Classifies a database URL as local or remote, and enforces the explicit-URL and `DB_TARGET_ACK` rules. | Imported by `database/database-command.ts`, the managed path, `database/verify-migration-ledger.ts` and the environment seeds |
| `database/database-command.ts` | Runs a person's database command: explicit URL, acknowledgment for a remote target, then logs the target without credentials. | Imported by `database/db-migrate.ts`, `database/db-seed.ts`, `database/db-studio.ts`, the content-release commands, `feedback/export-question-feedback.ts`, `operations/requeue-renewal-notice.ts` and `seed/withdraw-questions.ts` |
| `database/database-process.ts` | Runs `pnpm` with a given `DATABASE_URL` and the parent's output, and rejects on a non-zero exit. | Imported by `database/db-migrate.ts`, `database/db-studio.ts` and `database/managed/run-managed-db-migrate.ts` |
| `database/db-generate.ts` | Offline Drizzle migration generation with pnpm separator normalization; no database credentials or dotenv. | `pnpm db:generate` |
| `database/db-migrate.ts` | `drizzle-kit migrate` behind the human database guard. | `pnpm db:migrate` |
| `database/db-seed.ts` | The question seed (`seed.ts`) behind the human database guard. | `pnpm db:seed` |
| `database/db-studio.ts` | `drizzle-kit studio` behind the human database guard. | `pnpm db:studio` |
| `database/managed/database-target-managed.ts` | The managed authorizer: validates the URL and asks for no acknowledgment. | Imported by `database/managed/database-command-managed.ts` and `database/verify-migration-ledger.ts` |
| `database/managed/database-command-managed.ts` | The managed counterpart of `database/database-command.ts`. | Imported by `database/managed/run-managed-db-migrate.ts` and `database/managed/run-managed-db-seed.ts` |
| `database/managed/run-managed-db-migrate.ts` | Ledger precheck, `drizzle-kit migrate`, then ledger postcheck for checked-in automation. | The `vercel.json` build command; `ci.yml` and `stripe-hosted-checkout-smoke.yml`; the local E2E plan; `tests/integration/db-pooler-timeouts.integration.test.ts` and `tests/integration/managed-migration.integration.test.ts` |
| `database/managed/run-managed-db-seed.ts` | The question seed for checked-in automation. | `ci.yml` and `stripe-hosted-checkout-smoke.yml`; the local E2E plan; the environment seeds |
| `database/migration-ledger.ts` | Compares a database's migration ledger with the migration journal and each migration file's hash. | Imported by `database/verify-migration-ledger.ts` and the E2E credential preflight |
| `database/verify-migration-ledger.ts` | Checks the ledger before migrating (pending migrations allowed) or after (all journal entries required); both phases accept the explicit legacy hash exceptions. | `pnpm db:verify-ledger`; imported by `database/managed/run-managed-db-migrate.ts` |

### Deploy and Build Checks

| File | What it does | Run by |
| --- | --- | --- |
| `deploy/check-clerk-jwt-key.ts` | Fails on an invalid configured key, a configured key without a valid `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, or a confirmed mismatch with Clerk's published keys. An absent key passes; an unreadable key set warns and passes unchecked. | The `vercel.json` build command, first |
| `deploy/check-server-action-manifest.ts` | Fails a build in which a server action or `'use cache'` function declares an argument beyond its first or a rest parameter, and fails on a missing manifest or one that lists no actions. | `pnpm build`, after `next build`, so also `ci.yml`, `stripe-hosted-checkout-smoke.yml` and the `vercel.json` build command |

### Local Test Harness

| File | What it does | Run by |
| --- | --- | --- |
| `test-lanes/resolve-local-test-target.ts` | Derives a Compose project, database URL and ports from the clone path or explicit overrides. Ports come from a hash of the clone's identity over 10,000 slots and are not checked for collisions; BUG-329's long-name limitation applies, and shared provider users still require coordination. | `pnpm local:test:target`; `ci.yml`; the local test commands; `tests/shared/resolve-integration-database-url.ts`; by hand, per `AGENTS.md` and the testing guides |
| `test-lanes/run-local-test-db.ts` | Starts, stops or resets this clone's Docker test database and pooler. | `pnpm db:test:up`, `pnpm db:test:down` and `pnpm db:test:reset`; the local E2E plan |
| `test-lanes/run-local-integration.ts` | Starts, migrates and seeds this clone's test database before Vitest. `INTEGRATION_SKIP_PREPARE=true` skips preparation while retaining isolation; explicit existing-target mode only runs tests. | `pnpm test:integration` and `pnpm test:integration:coverage`; `ci.yml` |
| `test-lanes/run-local-e2e.ts` | Runs Playwright after preparing this clone's database, or against an explicitly opted-in existing database (`E2E_USE_EXISTING_DATABASE`), as CI does. | `pnpm test:e2e` and `pnpm test:e2e:stripe-hosted`; `ci.yml` and `stripe-hosted-checkout-smoke.yml` |
| `test-lanes/e2e-local-orchestrator.ts` | Builds the local E2E preparation and test plan. | Imported by `test-lanes/run-local-e2e.ts` |
| `test-lanes/run-stripe-provider-contracts.ts` | Runs the Stripe provider-contract suite in test mode, and fails unless every named case ran and passed. | `pnpm test:stripe-provider`; `stripe-trial-clock-smoke.yml` |

### CI Steps

| File | What it does | Run by |
| --- | --- | --- |
| `ci/pull-image.sh` | Pulls an image by digest from the first registry that serves it. Sourced, it defines `pull_image`; run directly with `--env NAME_IMAGE_REPOSITORY`, it writes the chosen repository to `$GITHUB_ENV`. | `ci.yml` and `stripe-hosted-checkout-smoke.yml`, before Compose startup |
| `ci/install-playwright-chromium.sh` | Installs Chromium and its system packages, working around the runner's apt mirrors. | `ci.yml` and `stripe-hosted-checkout-smoke.yml` |
| `ci/scan-playwright-output.ts` | Checks upload-eligible output for supported UTF-8 text types and known Clerk credential patterns; exits nonzero on any refused file or credential match. Hidden paths and `trace.zip` are excluded, matching the workflow uploads. | `ci.yml` and `stripe-hosted-checkout-smoke.yml` |

### Question Content: Seeding

| File | What it does | Run by |
| --- | --- | --- |
| `seed.ts` | Syncs question MDX under `content/questions/`, excluding placeholder files unless `SEED_INCLUDE_PLACEHOLDERS=true`; otherwise archives the ten fixture slugs. Refuses an active content release. #1559 replaces the environment switch with an explicit flag (BUG-353). | Imported by `database/db-seed.ts` and `database/managed/run-managed-db-seed.ts` |
| `seed/file-reader.ts` | Finds and reads the question MDX files; fails if none remain after filtering. | Imported by `seed.ts` and `content-release/stage-release.ts`; its source-file type is used by the seed writer and release builder |
| `seed/question-parser.ts` | Parses and validates one question file into the seed's representation. | Imported by the seed writer, the release builder and `draft-question-import.ts` |
| `seed/question-syncer.ts` | The seed's writer: inserts or updates each question in its own transaction. | Imported by `seed.ts`; the release builder imports its preparation and tag helpers |
| `seed/question-revision-writer.ts` | Appends a question revision and its choices. | Imported by the seed writer, the release builder and `tests/shared/question-fixtures.ts` |
| `seed/question-withdrawal-writer.ts` | Records and reads per-revision withdrawals. | Imported by the seed writer, the release builder, release activation and `seed/withdraw-questions.ts` |
| `seed/tag-manager.ts` | Validates a question's tags and upserts tag rows. | Imported by `seed/question-syncer.ts` |
| `seed/placeholder-archiver.ts` | Archives the ten committed fixture slugs, including updating timestamps and counting rows already archived; refuses an active release. | Imported by `seed.ts` |
| `seed/seed-summary.ts` | Formats the seed's report lines. | Imported by `seed.ts` |
| `seed/only-row.ts` | Returns the first row, or throws if none exists; it does not reject extra rows. | Imported by the seed and release writers and `tests/shared/question-fixtures.ts` |
| `seed/qid-command-args.ts` | Parses the operator commands' `--qid`, `--apply`, `--lift`, `--revert`, `--reason` and `--authority` arguments. | Imported by `seed/withdraw-questions.ts` and the content-release commands |
| `seed/withdraw-questions.ts` | Archives questions by QID and permanently withdraws every stored revision not already withdrawn; a dry run unless `--apply`. | `pnpm content:withdraw`; By hand, per `docs/architecture/content-pipeline.md` and `docs/architecture/integrations/postgres.md` |
| `seed-helpers.ts` | Splits the reference section off an explanation, and detects the legacy wrong-answers heading. | Imported by `seed/question-parser.ts` |
| `seed-all-environments.ts` | Seeds deduplicated `.env.local`, Vercel Development and Preview targets from drafts; checks the Production host/port/database exclusion first. Requires the pinned preinstalled Vercel CLI and remote-target acknowledgment, including for `--plan`. Unless `--plan`, it first replaces the checkout's gitignored `content/questions/imported/` with a published import of the drafts. | `pnpm db:seed:all` |
| `seed-production.ts` | Resolves Vercel Production and seeds drafts as published questions; refuses an ambient `DATABASE_URL`. Requires the pinned preinstalled Vercel CLI and remote-target acknowledgment, including for `--plan`. Unless `--plan`, it first replaces the checkout's gitignored `content/questions/imported/` with a published import of the drafts. | `pnpm db:seed:prod` |
| `seed-environment-targets.ts` | Plans and authorizes the environment seeds' targets, then prepares the corpus and seeds each one unless plan-only. | Imported by `seed-all-environments.ts` and `seed-production.ts`; its types are used by `seed-environment-runtime.ts` |
| `seed-environment-runtime.ts` | The environment seeds' real dependencies: Vercel CLI environment pulls, the corpus import and a child seed per target. | Imported by `seed-all-environments.ts` and `seed-production.ts` |
| `prepare-seed-corpus.ts` | Rebuilds `content/questions/imported/` from the drafts and swaps it into place. | Imported by `seed-environment-runtime.ts` |

### Question Content: Drafts

| File | What it does | Run by |
| --- | --- | --- |
| `draft-question-import.ts` | Splits draft files into question blocks and converts each into canonical question MDX. | Imported by `import-draft-questions.ts` |
| `import-draft-questions.ts` | Converts `recall.md` and `vignettes.md` from the drafts tree to canonical MDX. Defaults to draft status; preflights the batch and requires an empty output directory for writes. `--in`, `--out`, `--status` and `--dry-run` configure it; unknown, duplicate, positional and missing-value arguments are rejected before input/output work. A forwarded pnpm `--` is refused like any unknown argument. | `pnpm content:import:drafts`; the environment seeds |

### Question Content: Releases

| File | What it does | Run by |
| --- | --- | --- |
| `content-release/bootstrap-release.ts` | Previews adoption of what is live as the first release. `--reason` and `--authority` are always required; `--apply` also requires the preview's `--plan`, and disables subsequent direct seeding. | `pnpm content:release:bootstrap`; By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/stage-release.ts` | Previews one commit of the content repository's `main` (`--repo`, `--commit`) as a release on top of the active one; `--apply` persists staging. Omitted live QIDs require `--remove`, an older revision or a return to an earlier answer key requires `--revert`, and the first release after the bootstrap names `--baseline`. | `pnpm content:release:stage`; By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/activate-release.ts` | Previews an activation or rollback by default. `--release`, `--expect-active`, `--reason` and `--authority` are always required, and `--repo` names the content repository (a rollback may omit it); `--apply` also requires the preview's `--plan`, and a return to an earlier answer key needs `--revert` for that question. | `pnpm content:release:activate`; By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/hold-questions.ts` | Previews holds, or lifts with `--lift`, on the named `--qid` questions' live revisions; `--reason` and `--authority` are required. `--apply` persists them and re-applies the active release. A lift that returns a question to an earlier answer key needs `--revert`. | `pnpm content:hold`; By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/compare-live-keys.ts` | BUG-351's read-only check before the bootstrap: compares production's published current answer keys with one commit of the content repository's `main` (`--repo`, `--commit`), and prints counts and that commit. | `pnpm content:keys:compare`; By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/census-key-returns.ts` | Read-only count of revisions whose answer key returns to an earlier revision's (BUG-351). Accepts no flags and prints counts only. | `pnpm content:census:key-returns`; By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/census-normalization.ts` | Read-only count of stored revision fields that differ from the seed's normalized form (DEBT-531). Accepts no flags and prints counts only. | `pnpm content:census:normalization`; By hand, per `docs/architecture/content-pipeline.md` |
| `content-release/command-support.ts` | The content commands' database client, preview-or-apply transaction and output. | Imported by the four release commands, the two censuses and `content-release/compare-live-keys.ts` |
| `content-release/content-source.ts` | Reads one commit of the content repository's `main`: an isolated git environment, first-parent admission, and the question sources under its authoring root. | Imported by `content-release/release-source.ts` and `content-release/compare-live-keys.ts` |
| `content-release/release-activation.ts` | The release engine: the pointer lock, the seed guard, staging, activation and bootstrap. | Imported by `activate-release.ts` and `bootstrap-release.ts`, the release builder and holds, the seed writers and `seed/withdraw-questions.ts`; `command-support.ts` imports its types |
| `content-release/release-builder.ts` | Stages a release from question files: new questions, changed revisions, removals and reverts. | Imported by `content-release/release-source.ts` |
| `content-release/release-changes.ts` | Reads what activating a release would change, without locking question rows: publications, updates, reverts, answer-key changes and returns, withdrawals, and items left out as held or withdrawn. It also defines which release items are eligible. | Imported by release activation and the release builder; `command-support.ts` imports its type |
| `content-release/release-source.ts` | Stages a release from a content-repository commit, or activates one bound to its source commit; git runs before the transaction, and only the watermark is checked under the pointer lock. | Imported by `content-release/stage-release.ts` and `content-release/activate-release.ts` |
| `content-release/release-holds.ts` | Places or lifts holds on the live revision, then re-activates. | Imported by `content-release/hold-questions.ts` |
| `content-release/release-manifest.ts` | Builds, canonicalizes, hashes and parses a release manifest. | Imported by release activation and the release builder |

### Feedback

| File | What it does | Run by |
| --- | --- | --- |
| `feedback/export-question-feedback.ts` | Exports learner feedback as CSV or JSON, redacting user IDs and comments by default. | `pnpm export:feedback` |

### Review, Merge and Promotion

| File | What it does | Run by |
| --- | --- | --- |
| `review/merge-policy.ts` | Shared evidence schemas and merge, approval, carry, ancestry and linked-learning checks. | Imported by `review/merge-reviewed-pr.ts` and `review/verify-promotion.ts` |
| `review/merge-reviewed-pr.ts` | The merge guard for an open, ready, clean pull request into `dev`: an exact-head or carried CodeRabbit approval, resolved threads, green checks including `test` and, where it applies, `codecov/patch`, every CodeRabbit learning reply linked from the description, and `main`'s latest promotion in the head or `dev`. With `--merge`, it posts the receipt as a comment, then merges that head. | `pnpm pr:merge-reviewed`; By hand, per `AGENTS.md`; `review/verify-promotion.ts` imports its evidence readers |
| `review/verify-promotion.ts` | Checks a ready `dev`-to-`main` promotion (its `test` and `codecov/patch` checks and its threads) and proves every source pull request was approved before its merge. With `--merge`, it fetches `origin`, writes the receipt into the promotion's description, and merges. | `pnpm pr:verify-promotion`; By hand, per `AGENTS.md` |
| `review/diff-hunks.ts` | Decides whether a pull request's diff moved only because its base changed. | Imported by `review/merge-policy.ts` |
| `review/coderabbit-learnings.ts` | The marker and parser for a CodeRabbit reply that recorded a learning. | Imported by `review/merge-policy.ts` and `review/coderabbit-learnings-review.ts` |
| `review/coderabbit-learnings-review.ts` | Keeps one owner-assigned issue listing CodeRabbit learnings since the last report, capped at 30 days (eight days on the first run). | `coderabbit-learnings-review.yml` |
| `watchers/production-release-watch.ts` | After a 45-minute grace period, reports absent/failed main CI or no successful GitHub Production deployment record; leaves the issue unchanged while CI is pending. | `production-release-watch.yml` |

### Dependencies

| File | What it does | Run by |
| --- | --- | --- |
| `dependencies/lockfile-union.ts` | Checks that a bundle's `pnpm-lock.yaml` changes exactly the union of its source pull requests' changes. | Imported by `dependencies/verify-lockfile-union.ts` |
| `dependencies/verify-lockfile-union.ts` | The lockfile union check's command line. | `pnpm deps:verify-union`; By hand with `node --import tsx`, per `docs/guides/dependencies/updating-dependencies.md` |

### Records and Documentation

| File | What it does | Run by |
| --- | --- | --- |
| `records/next-record-id.ts` | Prints the next free BUG or DEBT ID. | `pnpm record:next`; By hand, per `AGENTS.md` |
| `records/documentation-archive.ts` | Audits records and documentation links. Its CLI exits 1 for blocking findings, but overdue/far-future actions are reported separately; the live policy suites assert all blocking categories (BUG-356). | `pnpm docs:audit`; Imported by the documentation tests and `records/documentation-due-checks.ts`; run manually with `pnpm docs:audit` |
| `records/documentation-due-checks.ts` | Keeps one issue for due or excessively far-future record actions and queue-review dates. An unreadable queue date instead fails the command before updating the issue. | `documentation-due-checks.yml` |

### Scheduled Watchers

| File | What it does | Run by |
| --- | --- | --- |
| `watchers/github-alert-issues.ts` | Keeps one GitHub issue per alert condition: creates or reopens it, edits its body and comments when changed, and closes it when the condition clears. | Imported by `watchers/operational-alert-watcher.ts`, `watchers/upstream-fix-watch.ts`, `watchers/production-release-watch.ts`, `review/coderabbit-learnings-review.ts` and `records/documentation-due-checks.ts` |
| `watchers/operational-alert-watcher.ts` | Checks that Sentry's alert path still works, and keeps an issue open while it does not. | `operational-alert-watcher.yml` |
| `watchers/upstream-advisory-watch.mts` | Scans upstream repository advisories from its configured start date; ignores medium/low advisories from indirect-only repositories, raises other eligible issues unless reviewed ranges prove locked versions unaffected, and closes existing issues on that evidence. | `upstream-advisory-watch.yml`, with plain `node` |
| `watchers/upstream-fix-watch.ts` | Raises an issue when a non-prerelease npm release follows a tracked fix's landing; the owner still verifies that the release contains the fix. | `upstream-fix-watch.yml` |
| `watchers/security-txt-renewal.mts` | Opens or updates one issue when `security.txt`'s `Expires` date is less than 90 days away, and fails on a missing, invalid or duplicate `Expires`; it never closes the issue. | `security-txt-renewal.yml`, with plain `node` |

### Quality Reports

| File | What it does | Run by |
| --- | --- | --- |
| `quality/crap-report.ts` | Ranks functions by CRAP score: coverage from the three test lanes against cyclomatic complexity. | `pnpm quality:crap` |
| `quality/mutation-report-integrity.ts` | Fails on unreadable JSON, invalid files/mutants/status shapes, or a survivor without a valid positive `testsCompleted` count. | `mutation.yml` |

### Manual Operator Tools

| File | What it does | Run by |
| --- | --- | --- |
| `operations/requeue-renewal-notice.ts` | Requeues a quarantined renewal notice for a later renewal-notice run through `RequeueRenewalNoticeDeliveryUseCase`, behind the human database guard. An unknown outcome needs `--confirmed-no-send`; the operator, reason and prior status go into the row's audit fields, and the next renewal-notice run rechecks the row before sending. | `pnpm notice:requeue`, per `docs/guides/operations/requeue-renewal-notice.md` |
| `deploy/validate-header-safe-secret.ts` | Prints metadata about named environment variables (presence, length, header safety), never their values; exits 1 on invalid input. | `pnpm secret:check-header`; By hand, as listed in `docs/architecture/environments.md`; no checked-in automation caller since `0ba85539` removed its CI step |
<!-- scripts-directory:end -->
