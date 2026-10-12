# AGENTS.md

Rules for every coding agent in this repository: Codex, Claude Code, Cursor, Copilot. Claude Code loads this file through `CLAUDE.md`, and Codex reads it whole, so it stays under 16 KiB. Detail lives in the documents it links; [ADR-023](docs/adr/adr-023-documentation-organisation.md) explains where each kind of document lives.

## The Product

Addiction Boards (Naltrexone University) is a subscription question bank for addiction psychiatry and addiction medicine board preparation: tutor and exam practice, review, bookmarks and progress, at $29 a month or $199 a year, with a free trial.

Stack: Next.js 16 (App Router), Clerk, Stripe, Postgres on Neon through Drizzle ORM, Tailwind CSS v4 with shadcn/ui, Biome, Vitest and Playwright, pnpm 11 on Node 24.

## Non-Negotiables

1. **Test first.** Write a failing test, make it pass with the least code, then refactor. No production code without a red test first.
2. **Run the full gate before every push,** follow-up fixes included:

   ```bash
   pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
   ```

   - When the E2E credentials are present (the list is in [the E2E guide](docs/dev/testing-infrastructure.md#environment-variables-for-e2e)), also run `pnpm test:e2e`. It runs against a per-clone Docker database while calling Clerk and Stripe in test mode.
   - The pre-push hook runs only `pnpm typecheck && pnpm test --run`; it does not build, and only the build catches prerender errors.
   - If `pnpm test:browser` exits in about a second with `no tests / 1 error`, capture the failing output, retry that lane once and say so; a second failure blocks the push. After the retry, still run the lanes after it.
3. **Never delete work you did not make.** Leave others' uncommitted files and edits alone. If they are in your way, `git stash -m "<why>"` and ask. Several agents share these clones.
4. **Stay non-interactive.**
   - Use `git --no-pager`, and `git commit -m "…"`.
   - Never `pnpm -s <cmd>`: it runs `<cmd>` as a script or binary, which can open Vim and hang.
5. **Never touch a remote database by accident.**
   - Database commands need an explicit `DATABASE_URL`; remote targets also need `DB_TARGET_ACK`.
   - Never `drizzle-kit push`.
   - Local tests resolve a per-clone target: `pnpm exec tsx scripts/resolve-local-test-target.ts env`. Never hardcode its port, and never blanket-kill `:3000`; another clone may own it.
6. **Never bypass review or protection.** No `--admin`, ruleset bypass, Force Promote, or direct push to `dev` or `main`.

## Before Writing Code

Read two or three nearby tests and sources first, and check `src/adapters/shared/`, `src/application/ports/` and `src/application/test-helpers/fakes/` for what already exists.

| Concern | Wrong | Right |
|---|---|---|
| Test doubles | `vi.mock('./my-repo')` | `new FakeRepository()` |
| Dependencies | `import { db } from './db'` in a use case | constructor injection, wired in `lib/container.ts` |
| Errors | `throw new Error('oops')` | `throw new ApplicationError('CODE', 'message')` |
| Shared types | redefined in each file | imported from `src/adapters/shared/` |

## Architecture

- **Clean Architecture,** dependencies pointing inward only: `app/`, `lib/`, `db/` (framework and infrastructure) → `src/adapters/` (repositories, gateways, controllers) → `src/application/` (use cases and ports) → `src/domain/` (entities, value objects, pure logic, zero external imports).
- **Composition root:** `lib/container.ts`, `lib/container/**` and `lib/controller-helpers.ts`.
- **Key files:** `db/schema.ts` (the schema), `proxy.ts` (Clerk middleware and route protection), `lib/env.ts` (validated environment variables), `.env.example` (every variable).
- **Names:** `src/adapters/controllers/**` are server-side controllers. A client hook that composes page state is a page model (`use-*-page-model.ts`), not a controller.
- **Domain entities hold no vendor IDs.** Clerk and Stripe identifiers live in persistence and adapters, and plans are `SubscriptionPlan`, not price IDs.
- **No magic numbers;** use named constants.
- **A bare `catch {}`** is allowed only for a suppressed secondary failure (telemetry, best-effort cleanup that keeps the original error, a parse fallback), with a comment. UI error-reporting helpers live in `app/(app)/app/shared/`; add a shared logger-safety helper to `src/` only once three or more sibling files need the same wrapper.
- **Decisions** are in [`docs/adr/`](docs/adr/index.md); read the relevant ADR before changing what it decided.

## Testing

- **Vitest, never Jest.** Unit tests sit beside their source as `*.test.ts(x)`. Integration tests: `tests/integration/*.integration.test.ts`. E2E: `tests/e2e/*.spec.ts`.
- **React 19:** a `*.test.tsx` starts with `// @vitest-environment jsdom` and renders with `renderToStaticMarkup`. Async or interactive UI goes in `*.browser.spec.tsx` with `vitest-browser-react` (`pnpm test:browser`). Never `@testing-library/react`, `react-test-renderer` or `react-dom/test-utils`.
- **Test doubles:** fakes over mocks. The rule, its vocabulary and its exceptions are in [`.claude/rules/testing.md`](.claude/rules/testing.md), and `pnpm lint:doubles` stops new violations ([ADR-025](docs/adr/adr-025-test-doubles-by-shape-or-behaviour.md)).
- **Business rules:** each product rule in plain language, with the tests that prove it, is in [`docs/dev/acceptance-testing.md`](docs/dev/acceptance-testing.md). A new rule adds its entry, and renaming a proving test updates its line in the same change; `tests/rule-to-test-register.test.ts` fails otherwise.
- **Integration database:**

  ```bash
  TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)" && pnpm db:test:up && DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate && SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed && pnpm test:integration
  ```

- **E2E:** product projects have zero retries; never add retries for a green run. One E2E run at a time shares the Clerk test user. Use relative imports for helpers inside `tests/e2e/`. Conventions, timeouts and the hosted Stripe lane: [the E2E guide](docs/dev/testing-infrastructure.md).

## Rules for Particular Files

Read the matching rule before editing. Claude Code loads these by path, and CodeRabbit applies them to the same paths.

| When editing (repository-relative globs) | Read |
|---|---|
| `src/**` | `.claude/rules/architecture.md` |
| `src/domain/**` | `.claude/rules/domain-layer.md` |
| `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx`, `tests/**`, `src/**/test-helpers/**`, `**/*-test-helpers.ts`, `**/*-test-helpers.tsx`, `**/*.fixtures.ts` | `.claude/rules/fixture-integrity.md` |
| `app/**`, `components/**` | `.claude/rules/frontend.md` |
| `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx`, `tests/**`, `src/**/test-helpers/**`, `**/*-test-helpers.ts`, `**/*-test-helpers.tsx`, `**/*.fixtures.ts` | `.claude/rules/test-isolation.md` |
| `**/*.browser.spec.tsx` | `.claude/rules/testing-browser.md` |
| `**/*.test.tsx` | `.claude/rules/testing-react19.md` |
| `**/*` | `.claude/rules/testing.md` |

## Pull Requests and Review

1. Branch from `dev`, carrying `main`'s latest promotion merge commit, and open the PR as a draft: `gh pr create --draft`.
2. Pass the full gate on a branch synced with `dev`, and wait for CI's `test` to pass.
3. Mark it ready (`gh pr ready`), which starts CodeRabbit's review. A later push starts none: push fixes together, then comment `@coderabbitai full review`.
4. Read every finding. A finding is a claim, not an order: fix a valid one, or answer it with the receipt that disproves it. A suggestion against a guard or scanner needs a receipt tied to that guard's stated invariant before it widens the guard.
5. Never ask CodeRabbit to record a learning. If it records one anyway ("Learnings added"), link that reply from the PR description.
6. Merge only with the merge guard, never the button or `gh pr merge`:

   ```bash
   pnpm exec tsx scripts/merge-reviewed-pr.ts <PR>          # read-only check
   pnpm exec tsx scripts/merge-reviewed-pr.ts <PR> --merge  # verify and merge
   ```

7. Promote `dev` to `main` with a PR titled `Promote #<source PRs>`, which CodeRabbit skips, then `pnpm exec tsx scripts/verify-promotion.ts <PR> --merge` after `git fetch`.

Commit messages are imperative ("Add …", "Fix …"). PR descriptions give the problem, the fix and the verification, link ADR or record changes, and show screenshots of any changed UI. How the guard decides, carried approvals, rate limits and Codecov outages: [Review and Merge](docs/guides/release/review-and-merge.md). Promotions and the production release gate: [the deployment procedure](docs/dev/deployment-procedure.md#8-promoting-dev-to-main). The decisions behind them: [ADR-024](docs/adr/adr-024-review-merge-and-promotion.md).

## Records

Open bug and debt records are in `docs/records/`, with one index. Its ["How Records Work"](docs/records/README.md#how-records-work) section holds the rules.
- Read **Now** and the Waiting triggers relevant to your work at session start, and triage any overdue dated action, in any live status, before new work. Follow the index’s due-check and weekly queue-review procedure; triage owner-only actions without assuming authority to perform them.
- A new ID comes from `pnpm exec tsx scripts/next-record-id.ts bug` (or `debt`).
- Write the record first and have a second agent challenge it. Before any push involving an exploitable security finding, apply the index’s private-review and disclosure exception; a public draft PR is not private.
- Ship it with its fix. Specify new features in [`docs/product/`](docs/product/README.md); multi-PR duration alone is not debt.
- Only the index links records; elsewhere, cite the ID.

## Commands

```bash
pnpm dev | build | start
pnpm lint            # Biome, plus the test-double ratchet (pnpm lint:doubles)
pnpm typecheck
pnpm test --run      # unit; pnpm test:browser; pnpm test:integration
pnpm test:e2e        # required E2E; pnpm test:e2e:stripe-hosted is observational
pnpm db:generate | db:migrate | db:seed | db:studio   # explicit DATABASE_URL
pnpm db:test:up | db:test:down                         # local test database
pnpm local:test:target                                 # this clone's local target
pnpm quality:crap | test:mutation                      # observational quality reports
```

## Where Things Live

- [`docs/records/README.md`](docs/records/README.md): open records, and how records work.
- [`docs/adr/`](docs/adr/index.md): decisions.
- [`docs/specs/master_spec.md`](docs/specs/master_spec.md): product behaviour; the code owns schemas and types.
- [`docs/frontend/`](docs/frontend/index.md): the design system. [`docs/dev/`](docs/dev/index.md): engineering guides. [`docs/guides/`](docs/guides/release/review-and-merge.md): review, merge and UI QA.
- [`docs/tooling/agent-browser.md`](docs/tooling/agent-browser.md): browser checks behind Clerk sign-in. Never skip a visual check because a page redirects to sign-in: sign in first. Use `--profile`, never `--state`; keep `localhost` exact. With Chrome MCP, the user's browser is usually signed in already.
- [`.agents/skills/`](.agents/skills/README.md): vendored agent skills and their refresh procedure.
- CI secrets: step-scoped credentials, SHA-pinned actions, and no credentials for Dependabot ([the CI Secret Standard](docs/dev/deployment-environments.md#ci-secret-standard)).
