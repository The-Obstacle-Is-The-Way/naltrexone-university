# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL: React 19 + Vitest Testing Requirements

**READ THIS FIRST. Tests will fail in git hooks/CI without these requirements.**

### For ALL `.test.tsx` files:

```typescript
// @vitest-environment jsdom   ← MUST be first line
import { renderToStaticMarkup } from 'react-dom/server';

// Use renderToStaticMarkup for render-output tests
const html = renderToStaticMarkup(<MyComponent />);
expect(html).toContain('Expected text');
```

### Why:
- `@testing-library/react` has a [known bug](https://github.com/testing-library/react-testing-library/issues/1392) with React 19 + Vitest in production builds
- Git hooks and CI load production builds where `act()` is undefined
- `renderToStaticMarkup` is a stable first-party React API that works everywhere

### Full details: `docs/dev/react-vitest-testing.md`

---

## ⚠️ MANDATORY: Test-Driven Development (TDD)

**ALL CODE MUST BE TEST-DRIVEN. NO EXCEPTIONS.**

Before writing ANY implementation code:
1. **Write the test first** (Red)
2. **Write minimum code to pass** (Green)
3. **Refactor if needed** (Refactor)

If you find yourself writing code without a failing test, STOP. Write the test first.

**Test locations:**
- Domain/Application: Colocate tests (`*.test.ts`) next to source
- Integration: `tests/integration/*.integration.test.ts`
- E2E: `tests/e2e/*.spec.ts`

See Robert C. Martin (Uncle Bob) - Clean Code, Clean Architecture, TDD principles.

---

## Project Overview

**Addiction Boards** (Naltrexone University) is a subscription-based SaaS question bank for Addiction Psychiatry and Addiction Medicine board exam preparation. Users subscribe ($29/mo or $199/yr), practice questions in tutor/exam modes, and track progress.

**Technical source of truth:** `docs/specs/master_spec.md`

## Setup

```bash
# Requirements: Node >=20.9.0, pnpm
pnpm install                # Install dependencies
cp .env.example .env        # Create env file (never commit .env)
# Set DATABASE_URL, Clerk keys, and Stripe keys in .env
```

## Git Hooks (Husky)

Git hooks are installed automatically on `pnpm install` (via the `prepare` script).

- `pre-commit`: runs staged-file checks via `lint-staged` + Biome auto-fix
- `pre-push`: runs `pnpm typecheck && pnpm test --run`

## Non-Interactive Safety (No Vim / No Pagers)

This repo is frequently worked on in non-interactive shells (CI + AI agents). To avoid hard hangs:

- Prefer non-interactive commands: `cat`, `sed -n`, `rg`, `git --no-pager …`.
- Never rely on an editor opening implicitly: always commit with `git commit -m "…"`.
- Avoid pager-triggering patterns: use `git --no-pager log`, `git --no-pager diff`, etc.
- **pnpm gotcha:** Never prefix a pnpm command with `-s`. `pnpm -s <cmd>` runs `<cmd>` as a package script/binary (e.g. `view` → Vim) instead of the pnpm subcommand, which hard-hangs in non-TTY runs.

## Commands

Tip: keep commands non-interactive; see the safety notes above.

```bash
# Development
pnpm dev                    # Start dev server (http://localhost:3000)
pnpm build                  # Production build
pnpm start                  # Run production build

# Quality gates (run before committing)
pnpm lint                   # Biome check (lint + format)
pnpm lint:fix               # Auto-fix lint issues
pnpm typecheck              # TypeScript type checking

# Testing
pnpm test                   # Unit tests (Vitest, watch mode)
pnpm test --run             # Unit tests (single run, CI-style)
pnpm test:integration       # Integration tests (uses .env.test, requires local DB)
pnpm test:e2e               # E2E tests (Playwright)

# Local Test Database (Docker)
pnpm db:test:up             # Start local Postgres for integration tests
pnpm db:test:down           # Stop local test database
pnpm db:test:reset          # Wipe and restart test database

# Database
pnpm db:generate            # Generate migration from schema changes
pnpm db:migrate             # Apply migrations to database
pnpm db:seed                # Seed database with content
pnpm db:studio              # Open Drizzle Studio GUI
```

## Architecture

The project follows **Clean Architecture** (Robert C. Martin) with four layers. Dependencies point inward only.

### Core Principles (Uncle Bob)

All code in this repository MUST adhere to these principles:

1. **Clean Architecture** - Strict layer boundaries with dependencies pointing inward only. Domain has ZERO external imports.

2. **SOLID Principles**
   - **S**ingle Responsibility: Each module has one reason to change
   - **O**pen/Closed: Open for extension, closed for modification
   - **L**iskov Substitution: Implementations are swappable
   - **I**nterface Segregation: Small, specific interfaces
   - **D**ependency Inversion: Depend on abstractions, not concretions

3. **Test-Driven Development (TDD)** - Write tests first (Red → Green → Refactor). Specs define tests before implementation. Domain and application layers must be 100% unit testable without infrastructure.

4. **DRY (Don't Repeat Yourself)** - Single source of truth for every concept. Extract common patterns into shared utilities.

5. **Clean Code** - Meaningful names, small functions, minimal complexity, explicit error handling, no magic numbers.

6. **Design Patterns** - Use appropriate patterns (Repository, Factory, Strategy, Composition Root) where they add clarity, not complexity.

### Layer Structure (planned, see ADR-012)

```
src/domain/        → Entities, value objects, pure business logic (zero dependencies)
src/application/   → Use cases, port interfaces (depends only on domain)
src/adapters/      → Repository/gateway implementations, server actions (depends on application)
app/, lib/, db/    → Next.js framework code, infrastructure (outermost layer)
```

### Current State

Implemented so far:
- `src/domain/entities/**` + tests (SPEC-001)
- `src/domain/value-objects/**` + tests (SPEC-002)

Planned (per `docs/specs/master_spec.md` + ADR-012):
- `src/domain/services/**`, `src/domain/errors/**`
- `src/application/**` (use cases, ports, app errors)
- `src/adapters/**` (repositories, gateways, controllers)

Framework code lives in:
- `app/` - Next.js App Router pages, layouts, API routes
- `lib/` - Core utilities (auth, Stripe, env, DB). Prefer importing via `@/...`
- `db/schema.ts` - Drizzle ORM schema
- `db/migrations/` - Generated migrations (drizzle-kit)
- `components/` - React components; `components/ui/` has shadcn/ui primitives
- `content/questions/` - MDX question content

### Key Architectural Decisions

1. **Domain entity purity** - Domain entities (User, Subscription, Question) have NO vendor identifiers. External IDs (Clerk user ID, Stripe subscription ID) exist only in the persistence layer.

2. **Vendor-agnostic value objects** - Use `SubscriptionPlan` (monthly/annual) in domain, not Stripe price IDs. Mapping happens in adapters.

3. **Fakes over mocks** - Tests use in-memory fake implementations, not jest.mock().

4. **Composition root** - Dependencies wired at entry points (Server Actions, Route Handlers), not global singletons.

See `docs/adr/` for all Architecture Decision Records (ADR-001 through ADR-012).

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Auth:** Clerk (`@clerk/nextjs`)
- **Payments:** Stripe (subscriptions + webhooks)
- **Database:** Postgres (Neon) via Drizzle ORM
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Linting:** Biome (no ESLint/Prettier)
- **Testing:** Vitest (unit/integration), Playwright (E2E)
- **Package manager:** pnpm

## Key Files

| File | Purpose |
|------|---------|
| `db/schema.ts` | Drizzle schema (tables, relations, types) |
| `proxy.ts` | Clerk middleware (route protection) |
| `lib/env.ts` | Zod-validated environment variables |
| `lib/db.ts` | Drizzle client singleton |
| `lib/auth.ts` | Clerk auth helpers |
| `lib/stripe.ts` | Stripe SDK initialization |
| `biome.json` | Linter/formatter config |
| `.env.example` | Required environment variables |

## Coding Style

Biome is the source of truth for style:
- 2-space indents
- Single quotes
- Semicolons required
- Trailing commas

Rules:
- TypeScript + React (Next.js). Keep modules small, prefer pure functions in `lib/`
- Avoid non-null assertions (`!`) and unused imports/variables (Biome errors)
- Prefer importing via `@/...` alias

## Testing

### Framework: Vitest (NOT Jest)

We use **Vitest** exclusively. Do NOT use Jest APIs or `jest.mock()`.

```typescript
// Correct imports
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

### Test Locations (Colocated)

- **Unit tests:** `*.test.ts` colocated next to source files (e.g., `grading.ts` → `grading.test.ts`)
- **Integration tests:** `tests/integration/*.integration.test.ts` (requires local Postgres)
- **E2E tests:** `tests/e2e/*.spec.ts` (Playwright)

### Running Integration Tests Locally

Integration tests require a local Postgres database. Use Docker:

```bash
pnpm db:test:up                                    # Start local Postgres (port 5434)
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:migrate
pnpm test:integration                              # Run integration tests
pnpm db:test:down                                  # Stop database when done
```

- `.env.test` is committed and contains test database config (no secrets)
- Integration tests auto-load `.env.test` via `tests/integration/setup.ts`
- Port 5434 avoids conflicts with local Postgres installations
- Migrations require explicit `DATABASE_URL` (drizzle-kit reads from env)

### React 19 Component Testing

**For render-output tests** (checking HTML content), use `renderToStaticMarkup`:

```typescript
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('MyComponent', () => {
  it('renders correctly', async () => {
    const MyComponent = (await import('./MyComponent')).default;
    const html = renderToStaticMarkup(<MyComponent />);
    expect(html).toContain('Expected text');
  });
});
```

**For interactive tests** (clicking buttons, typing in forms), you'll need `@testing-library/react`. First add this to `vitest.config.ts`:

```typescript
resolve: {
  conditions: ['development'],  // Fixes act() bug in git hooks/CI
  alias: { '@': path.resolve(__dirname, './') },
},
```

**Current state:** All our .test.tsx files only check render output, so we use `renderToStaticMarkup`.

**DO NOT USE:**
- `react-test-renderer` — Deprecated in React 19
- `react-dom/test-utils` — Removed in React 19
- `environmentMatchGlobs` — Deprecated in Vitest 4

See `docs/dev/react-vitest-testing.md` for full details.

### FAKES OVER MOCKS — MANDATORY

**The Simple Rule:**
```
Can you pass it through a constructor or function parameter?
  YES → Use a fake object (with vi.fn() for spying if needed)
  NO  → Use vi.mock() (React hooks, Next.js magic, external SDKs only)
```

**NEVER use `vi.mock()` for our own code.** Only for external packages you can't inject.

| Pattern | When to Use | Example |
|---------|-------------|---------|
| **Fake via DI** | Our own code (repos, gateways, services) | `new UseCase(fakeRepo)` |
| **Fake + vi.fn()** | When you need to spy on fake methods | `{ findById: vi.fn().mockResolvedValue(null) }` |
| **vi.mock()** | External SDKs you can't inject (Clerk hooks, Next.js) | `vi.mock('@clerk/nextjs')` |

**IMPORTANT: vi.fn() inside a fake is CORRECT:**
```typescript
// ✅ CORRECT - Fake object passed via DI, vi.fn() just adds spying
const fakeDb = {
  query: { users: { findFirst: vi.fn().mockResolvedValue(null) } }
};
const repo = new DrizzleUserRepository(fakeDb);  // DI injection

// ❌ WRONG - Hijacking module imports for our own code
vi.mock('./user-repository');  // NEVER DO THIS
```

**Why Fakes > Mocks:**
- Mocks test implementation details (what methods were called)
- Fakes test behavior (what the system does)
- Mocks break when you refactor internals
- Fakes only break when behavior changes

**Our Fakes Location:** `src/application/test-helpers/fakes.ts`

```typescript
// GOOD: Using fake repository
const repo = new FakeAttemptRepository();
const useCase = new SubmitAnswerUseCase(repo, ...);
const result = await useCase.execute(input);
expect(result.isCorrect).toBe(true);

// BAD: Mocking our own code
vi.mock('./attempt-repository');  // NEVER DO THIS
```

**When vi.mock() IS acceptable:**
```typescript
// ✅ External SDK with hooks you can't inject
vi.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }) => <>{children}</>,
  useUser: () => ({ user: { id: 'test' } }),
}));

// ✅ Next.js internals
vi.mock('next/link', () => ({ default: (props) => <a {...props} /> }));
vi.mock('server-only', () => ({}));
```

### Test Quality Rules

1. **Test behavior, not implementation** — If you refactor, tests should still pass
2. **One concept per test** — Each `it()` verifies one thing
3. **Arrange-Act-Assert pattern** — Setup, execute, verify
4. **Use test factories** — `createQuestion()`, `createChoice()` from `src/domain/test-helpers/`
5. **Descriptive names** — `it('returns isCorrect=false when incorrect choice selected')`

Integration tests run against a real Postgres instance. In CI, a service container provides the database.

## Commit & PR Guidelines

**Commits:**
- Use imperative style: `Add ...`, `Fix ...`, `Refactor ...`, `Enhance ...`
- Use optional tags like `[BASELINE]` when applicable

**Pull Requests:**
- Include short problem/solution summary
- Link any spec/ADR updates in `docs/`
- Add screenshots/GIFs for UI changes

**Before opening a PR, run:**
```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build
```

## ⚠️ MANDATORY: Never Delete Uncommitted Work

**If you see uncommitted files or changes you didn't create, DO NOT DELETE THEM.**

Another agent or the user may be working concurrently. Uncommitted work is **intentional** until proven otherwise.

**The Rule:**
- See files you didn't create? → **Commit them or leave them alone**
- See edits you didn't make? → **Ask before reverting**
- Unsure if something should exist? → **ASK, don't delete**

**Why this happens:**
Multiple agents may work in parallel. One agent creates a file, another agent sees it as "unexpected" and deletes it. This destroys work.

**When in doubt:** `git stash` to preserve work, then ask the user.

---

## ⚠️ MANDATORY: CodeRabbit Review Before Merge

**NEVER merge a PR without CodeRabbit review. NO EXCEPTIONS.**

1. **Create the PR** and wait for CodeRabbit to comment (usually 1-2 minutes)
2. **Read all CodeRabbit feedback** — do not skim or skip
3. **Address every issue** raised by CodeRabbit before merging:
   - If it's a valid issue → fix it
   - If it's a false positive → reply explaining why
4. **Only merge after** CodeRabbit has reviewed AND you've addressed feedback

**Why this matters:**
- CodeRabbit catches bugs, security issues, and style problems
- Premature merges bypass this safety net
- The 1-2 minute wait is worth it

**Signs you're about to violate this rule:**
- PR was just created seconds ago
- No `coderabbitai[bot]` comment visible yet
- You're thinking "I'll merge now and fix issues later"

## Documentation

- `docs/specs/master_spec.md` - Complete technical specification (SSOT)
- `docs/specs/spec-001 to spec-010` - Clean Architecture layer specs
- `docs/specs/spec-011 to spec-015` - Feature slice specs
- `docs/adr/` - Architecture Decision Records (ADR-001 through ADR-012)
