# CLAUDE.md

> **All project rules are in [`AGENTS.md`](./AGENTS.md).** This file contains Claude Code-specific supplements only.
>
> Claude Code reads both `AGENTS.md` (universal rules for all agents) and this file. Everything in `AGENTS.md` applies here. Keep this file concise, Claude-specific, and aligned with `AGENTS.md`; if guidance is universal, move it to `AGENTS.md` instead of duplicating or contradicting it here.

## Maintenance

- Prefer concrete, verifiable instructions with exact commands or paths.
- Keep most topic- or path-specific Claude guidance in `.claude/rules/`.
- If this file grows beyond a quick-start supplement, split the extra Claude-only material into `.claude/rules/` or imported markdown files instead of copying `AGENTS.md`.
- When `AGENTS.md` or `.claude/rules/` changes, update this file in the same patch if its summary becomes stale.

---

## Path-Scoped Rules (`.claude/rules/`)

Claude Code loads additional context from `.claude/rules/` based on which files it is reading or editing:

| Rule File | Activates When Editing | Content |
|-----------|----------------------|---------|
| `testing.md` | Any file | Vitest, TDD, fakes-over-mocks, test locations |
| `testing-react19.md` | `**/*.test.tsx` | `renderToStaticMarkup`, jsdom directive, deprecated APIs |
| `testing-browser.md` | `**/*.browser.spec.tsx` | `vitest-browser-react`, controller mocking, stability tips |
| `architecture.md` | `src/**` | Clean Architecture layers, SOLID, dependency inversion |
| `domain-layer.md` | `src/domain/**` | Zero-import purity rules |
| `frontend.md` | `app/**`, `components/**` | Route constants, shadcn, error state patterns |
| `git-workflow.md` | Any file | Commits, PRs, CodeRabbit, non-interactive safety |

These rules load automatically — no action needed.

---

## Quick Reference (Claude Code Essentials)

These are the rules that matter most for Claude Code sessions. Full details in `AGENTS.md`.

### Testing (read this first)

- `*.test.tsx` → `renderToStaticMarkup` + `// @vitest-environment jsdom` as first line
- `*.browser.spec.tsx` → `vitest-browser-react` + `pnpm test:browser`
- `*.test.ts` → Plain Vitest, no environment directive needed
- **Fakes over mocks** — use `FakeXxxRepository` from `src/application/test-helpers/fakes/`
- **TDD mandatory** — write the test first, always

### Architecture

- Clean Architecture: `domain/` → `application/` → `adapters/` → `app/`
- Dependencies point inward only. Domain has ZERO external imports.
- Constructor injection, composition root at entry points
- `ApplicationError` with typed codes for all error handling

### Commands

```bash
pnpm test --run             # Unit tests (CI-style)
pnpm test:browser           # Browser mode tests (Chromium)
pnpm typecheck              # TypeScript check
pnpm lint                   # Biome lint + format
pnpm build                  # Production build
```

### Integration Test DB (Local Only)

Integration tests require a local Postgres container with migrations **and** seed data. All steps are mandatory:

```bash
pnpm db:test:up                                    # Start Docker Postgres (port 5434)
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:migrate
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:seed
pnpm test:integration                              # Now tests will pass
```

```bash
# One-liner: local setup from scratch (matches CI order)
pnpm db:test:up && DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:migrate && SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:seed && pnpm test:integration
```

- **Never use `drizzle-kit push`** — it skips migration files (missing `pgcrypto`, constraints)
- **Always prefix with `DATABASE_URL=...`** — without it, drizzle-kit reads `.env.local` (remote Neon DB)
- **Seeding is required** — `tag-taxonomy-census` tests fail without it
- **CI seeds with `SEED_INCLUDE_PLACEHOLDERS=true`** — plain `pnpm db:seed` is enough locally, but the flag gives exact CI seed parity
- Only needed for `pnpm test:integration`. Unit/browser/build tests don't touch the DB.

### Pre-PR Gate (CI Parity)

```bash
# Ensure test DB is running first (see above or AGENTS.md "Running Integration Tests Locally")
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

### Safety

- **Never delete uncommitted work** — `git stash` and ask
- **CodeRabbit review required** before every merge — wait for `coderabbitai[bot]`
- **Non-interactive only** — `git --no-pager`, `git commit -m "..."`, never `-s` with pnpm

### Browser Visual Verification

All `/app/*` pages require Clerk auth. For `agent-browser`, use `--profile /tmp/clerk-profile` (a human must log in once via `--headed` mode). If a daemon is already running, `agent-browser close` before re-opening with `--profile`, because later profile flags are otherwise ignored. Do not use `--state` or CDP bridge approaches — both are unreliable with Clerk. Keep the app host exact (`localhost` vs `127.0.0.1` matters for Clerk cookies). `click @ref` is unreliable on practice-flow React components (DEBT-323) — do not rely on it for Submit/primary action buttons or toggle buttons. `label.click()` remains the safest answer-selection fallback even though radio refs may work on some surfaces. Toggle buttons (Tutor/Exam) have no agent-browser workaround — use Playwright. When using Chrome MCP tools, the user's browser is typically already authenticated — use `tabs_context_mcp` to check existing tabs. **Never skip visual verification because of an auth redirect — authenticate first.** Full details: `docs/tooling/agent-browser.md`.
