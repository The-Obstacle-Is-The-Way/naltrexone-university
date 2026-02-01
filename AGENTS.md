# AGENTS.md

Repository guidelines for AI coding agents (Codex CLI, Claude Code, etc.) working with this codebase.

---

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

## ⚠️ SLOT PROTECTION: Understand Before Changing

**BEFORE writing ANY code, you MUST study existing codebase patterns.**

This codebase follows strict conventions (Clean Architecture, SOLID, TDD). Code that doesn't match existing patterns will be rejected. **Study first, code second.**

### Mandatory Pre-Work (First-Time Agents)

1. **Read 2-3 existing test files** to understand test structure:
   ```bash
   cat src/adapters/gateways/clerk-auth-gateway.test.ts
   cat src/adapters/repositories/drizzle-user-repository.test.ts
   ```
   - We use **fakes**, NEVER `vi.mock()` for our own code
   - Arrange-Act-Assert pattern
   - Descriptive test names: `it('returns X when Y')`

2. **Read 2-3 source files** to understand code style:
   ```bash
   cat src/adapters/gateways/clerk-auth-gateway.ts
   cat src/adapters/repositories/drizzle-user-repository.ts
   ```
   - Constructor dependency injection
   - `ApplicationError` with typed codes
   - No magic numbers — use constants/configs

3. **Check for existing shared types** before creating new ones:
   ```bash
   ls src/adapters/shared/           # Shared adapter types
   ls src/application/ports/         # Port interfaces
   ls src/application/test-helpers/  # Fakes for testing
   ```

### Why This Matters

| Pattern | Wrong                          | Right                                         |
|---------|--------------------------------|-----------------------------------------------|
| Testing | `vi.mock('./my-repo')`         | `new FakeRepository()`                        |
| DI      | `import { db } from './db'`    | `constructor(private db: DrizzleDb)`          |
| Errors  | `throw new Error('oops')`      | `throw new ApplicationError('CODE', 'msg')`   |
| Types   | Define locally in each file    | Import from `src/adapters/shared/`            |

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

---

## ⚠️ MANDATORY: Never Delete Uncommitted Work

**If you see uncommitted files or changes you didn't create, DO NOT DELETE THEM.**

This is a multi-agent environment. Another agent or the user may be working concurrently. Uncommitted work is **intentional** until proven otherwise.

### The Rule

- See files you didn't create? → **Commit them or leave them alone**
- See edits you didn't make? → **Ask before reverting**
- Unsure if something should exist? → **ASK, don't delete**
- See a file that seems "redundant"? → **It's not your call to delete it**

### Why This Matters

Multiple agents work in parallel on this codebase. One agent creates a file, another sees it as "unexpected" and deletes it. This destroys hours of work and creates frustration.

### Safe Approach

```bash
# If you see unexpected uncommitted work:
git stash -m "Preserving work from another session"
# Then ask the user what to do
```

**Never assume uncommitted work is garbage. It's almost always intentional.**

---

## ⚠️ MANDATORY: CodeRabbit Review Before Merge

**NEVER merge a PR without CodeRabbit review. NO EXCEPTIONS.**

This is a **blocking requirement**. Violating this rule wastes human time fixing preventable issues.

### The Rule

1. **Create the PR** via `gh pr create`
2. **WAIT** for CodeRabbit to comment (1-2 minutes)
3. **Read ALL CodeRabbit feedback** — do not skim or skip
4. **Address every issue** before merging:
   - Valid issue → fix it, push, wait for re-review
   - False positive → reply explaining why (for the record)
5. **Only merge after** CodeRabbit has reviewed AND feedback is addressed

### Why This Matters

- CodeRabbit catches bugs, security issues, and architectural problems
- Premature merges bypass this safety net and create rework
- The 1-2 minute wait prevents hours of debugging later

### Red Flags (STOP if any apply)

- PR was just created seconds ago → **WAIT**
- No `coderabbitai[bot]` comment visible → **WAIT**
- Thinking "I'll merge now and fix later" → **STOP, that's wrong**
- Thinking "This is just docs, doesn't need review" → **WRONG, everything needs review**

### How to Check

```bash
# List comments on a PR
gh pr view <PR_NUMBER> --comments

# Look for coderabbitai[bot] in the output
# If not present, DO NOT MERGE
```

## Documentation

- `docs/specs/master_spec.md` - Complete technical specification (SSOT)
- `docs/specs/spec-001 to spec-010` - Clean Architecture layer specs
- `docs/specs/spec-011 to spec-015` - Feature slice specs
- `docs/adr/` - Architecture Decision Records (ADR-001 through ADR-012)

---

## Quick Reference: Slot Protection Checklist

Before writing ANY code, verify you can answer:

- [ ] **Tests:** Have I read 2-3 existing test files? Do I understand the fakes pattern?
- [ ] **Style:** Have I read 2-3 source files? Do I understand constructor injection?
- [ ] **Shared Types:** Have I checked `src/adapters/shared/` for existing types?
- [ ] **Ports:** Have I checked `src/application/ports/` for existing interfaces?
- [ ] **Fakes:** Have I checked `src/application/test-helpers/fakes.ts` for existing fakes?
- [ ] **Layer:** Do I know which Clean Architecture layer I'm working in?

**If you can't check all boxes, study existing code before proceeding.**
