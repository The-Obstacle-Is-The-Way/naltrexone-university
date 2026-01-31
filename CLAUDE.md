# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Non-Interactive Safety (No Vim / No Pagers)

This repo is frequently worked on in non-interactive shells (CI + AI agents). To avoid hard hangs:

- Prefer non-interactive commands: `cat`, `sed -n`, `rg`, `git --no-pager …`.
- Never rely on an editor opening implicitly: always commit with `git commit -m "…"`.
- Avoid pager-triggering patterns: use `git --no-pager log`, `git --no-pager diff`, etc.
- **pnpm gotcha:** Do NOT use `pnpm -s` (it is **not** a “silent” flag). It invokes `/usr/bin/view` (vim) and will hang in non-TTY runs.

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
pnpm test:integration       # Integration tests (requires DATABASE_URL)
pnpm test:e2e               # E2E tests (Playwright)

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

The `src/` Clean Architecture layers are **not yet implemented**. Current code lives in:
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

- **Unit tests:** `**/*.test.ts(x)` - colocated with source, or `tests/unit/`
- **Integration tests:** `tests/integration/*.integration.test.ts` (requires DATABASE_URL)
- **E2E tests:** `tests/e2e/*.spec.ts` (Playwright, starts Next.js automatically)

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

## Documentation

- `docs/specs/master_spec.md` - Complete technical specification (SSOT)
- `docs/specs/spec-001 to spec-010` - Clean Architecture layer specs
- `docs/specs/spec-011 to spec-015` - Feature slice specs
- `docs/adr/` - Architecture Decision Records (ADR-001 through ADR-012)
