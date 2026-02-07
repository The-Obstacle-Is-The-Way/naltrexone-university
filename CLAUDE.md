# CLAUDE.md

> **All project rules are in [`AGENTS.md`](./AGENTS.md).** This file contains Claude Code-specific supplements only.
>
> Claude Code reads both `AGENTS.md` (universal rules for all agents) and this file. Everything in `AGENTS.md` applies here — do not duplicate it.

---

## Path-Scoped Rules (`.claude/rules/`)

Claude Code loads additional context from `.claude/rules/` based on which files you're editing:

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
- **Fakes over mocks** — use `FakeXxxRepository` from `src/application/test-helpers/fakes.ts`
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

### Safety

- **Never delete uncommitted work** — `git stash` and ask
- **CodeRabbit review required** before every merge — wait for `coderabbitai[bot]`
- **Non-interactive only** — `git --no-pager`, `git commit -m "..."`, never `-s` with pnpm
