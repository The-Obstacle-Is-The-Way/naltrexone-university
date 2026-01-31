# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Addiction Boards** (Naltrexone University) is a subscription-based SaaS question bank for Addiction Psychiatry and Addiction Medicine board exam preparation. Users subscribe ($29/mo or $199/yr), practice questions in tutor/exam modes, and track progress.

**Technical source of truth:** `docs/specs/master_spec.md`

## Commands

```bash
# Development
pnpm dev                    # Start dev server (http://localhost:3000)
pnpm build                  # Production build

# Quality gates (run before committing)
pnpm lint                   # Biome check (lint + format)
pnpm lint:fix               # Auto-fix lint issues
pnpm typecheck              # TypeScript type checking

# Testing
pnpm test                   # Unit tests (Vitest, watch mode)
pnpm test --run             # Unit tests (single run)
pnpm test:integration       # Integration tests (requires DB)
pnpm test:e2e               # E2E tests (Playwright)

# Database
pnpm db:generate            # Generate migration from schema changes
pnpm db:migrate             # Apply migrations to database
pnpm db:seed                # Seed database with content
pnpm db:studio              # Open Drizzle Studio GUI
```

## Architecture

The project follows **Clean Architecture** (Robert C. Martin) with four layers. Dependencies point inward only.

### Layer Structure (planned, see ADR-012)

```
src/domain/        → Entities, value objects, pure business logic (zero dependencies)
src/application/   → Use cases, port interfaces (depends only on domain)
src/adapters/      → Repository/gateway implementations, server actions (depends on application)
app/, lib/, db/    → Next.js framework code, infrastructure (outermost layer)
```

### Current State

The `src/` Clean Architecture layers are **not yet implemented**. Current code lives in:
- `app/` - Next.js pages and API routes
- `lib/` - Utilities, DB client, auth helpers
- `db/schema.ts` - Drizzle ORM schema
- `components/` - React components

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

## Testing

- **Unit tests:** `**/*.test.ts` (colocated with source, or `tests/unit/`)
- **Integration tests:** `tests/integration/*.integration.test.ts` (requires DATABASE_URL)
- **E2E tests:** `tests/e2e/*.spec.ts` (Playwright, requires running app)

Integration tests run against a real Postgres instance. In CI, a service container provides the database.

## Documentation

- `docs/specs/master_spec.md` - Complete technical specification
- `docs/specs/spec-*.md` - Detailed specs for each subsystem
- `docs/adr/` - Architecture Decision Records
- `docs/specs/drafts/` - Feature slice specifications
