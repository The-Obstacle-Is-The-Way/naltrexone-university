# ADR-012: Directory Structure and Module Organization

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

We have a conflict between two approaches:

1. **Earlier master spec drafts** — Used a flat, Next.js-native structure with server actions directly in `/app/(app)/app/_actions/`
2. **ADR-001 (Clean Architecture)** — Prescribes a layered `src/` structure with domain, application, and adapter layers

This ADR **resolves the conflict** by defining the authoritative directory structure that:

- Honors Clean Architecture layer boundaries
- Works seamlessly with Next.js App Router
- Provides clear guidance on where code belongs
- Enables the testing strategy from ADR-003

## Decision

We adopt a **hybrid structure** that places Clean Architecture layers under `src/` while keeping Next.js framework files at the root.

### Authoritative Directory Structure

```
/
├── app/                              # FRAMEWORKS LAYER (Next.js App Router)
│   ├── (marketing)/                  # Marketing pages
│   ├── (app)/app/                    # Entitled app shell + core routes
│   │   ├── dashboard/
│   │   ├── practice/
│   │   │   ├── [sessionId]/          # Session runner (tutor/exam)
│   │   │   └── quick/                # Quick Practice (SPEC-019 Phase 2)
│   │   ├── review/
│   │   ├── bookmarks/
│   │   └── billing/
│   └── api/                          # Route handlers (webhooks, health, cron)
│
├── src/                              # CLEAN ARCHITECTURE LAYERS
│   ├── domain/                       # Entities, value objects, services (pure)
│   ├── application/                  # Use cases + ports (interfaces)
│   │   ├── ports/                    # Port-per-module + barrels (ports/index.ts, ports/repositories.ts)
│   │   ├── use-cases/
│   │   ├── errors/
│   │   └── test-helpers/
│   │       └── fakes/                # Canonical fakes for unit/controller tests
│   └── adapters/                     # Controllers, repositories, gateways
│       ├── controllers/              # Server actions + controller helpers
│       ├── repositories/             # Drizzle implementations + mappers
│       ├── gateways/                 # Clerk/Stripe + rate limiter implementations
│       └── shared/                   # Adapter-only helpers (idempotency, rate limits, DB types)
│
├── components/                       # FRAMEWORKS LAYER (React components)
│   ├── ui/                           # shadcn/ui primitives
│   ├── question/
│   ├── markdown/
│   ├── marketing/
│   └── loading/
│
├── lib/                              # FRAMEWORKS LAYER (Infrastructure)
│   ├── container.ts                  # Composition root entry
│   ├── container/                    # Focused factory modules (controllers, gateways, repos, use cases)
│   ├── controller-helpers.ts         # Container-loading helpers for controllers
│   ├── db.ts                         # Drizzle client singleton
│   ├── env.ts                        # Zod-validated env vars
│   ├── routes.ts                     # Route constants + helpers
│   ├── stripe.ts                     # Stripe SDK init
│   └── logger.ts                     # Logger implementation (ADR-008)
│
├── db/                               # FRAMEWORKS LAYER (Database)
│   ├── schema.ts                     # Drizzle schema
│   └── migrations/
│       └── ...
│
├── content/                          # Static content
│   └── questions/
│       └── ...
│
├── scripts/
│   └── seed.ts                       # Content seeding
│
├── tests/                            # Integration + E2E tests
│   ├── integration/
│   └── e2e/
```

This ADR is authoritative at the **directory boundary** level. For file-level indexes that evolve with refactors, prefer:

- `docs/specs/index.md` (spec index)
- `docs/adr/index.md` (ADR index)
- `docs/practice-engine/index.md` (practice-engine file index + status)

### Layer Mapping

| Directory | Clean Architecture Layer | Description |
|-----------|-------------------------|-------------|
| `src/domain/` | Entities | Pure business logic, zero dependencies |
| `src/application/` | Use Cases | Application-specific business rules |
| `src/adapters/` | Interface Adapters | Glue between use cases and frameworks |
| `app/`, `components/`, `lib/`, `db/` | Frameworks & Drivers | Next.js, React, Drizzle, external SDKs |

### Import Rules (Enforced by Architecture + Review)

```typescript
// ALLOWED: Inner layers importing from inner layers
// src/application/use-cases/submit-answer.ts
import { gradeAnswer } from '@/src/domain/services/grading';
import type { Question } from '@/src/domain/entities';

// ALLOWED: Adapters importing from application
// src/adapters/controllers/question-controller.ts
import { SubmitAnswerUseCase } from '@/src/application/use-cases/submit-answer';
import type { QuestionRepository } from '@/src/application/ports/repositories';

// ALLOWED: Frameworks importing from adapters
// app/(app)/app/practice/page.tsx
import { submitAnswer } from '@/src/adapters/controllers/question-controller';

// FORBIDDEN: Domain importing from outer layers
// src/domain/services/grading.ts
import { db } from '@/lib/db';  // ERROR! Domain cannot import frameworks
```

### TypeScript Path Aliases

We use `@/*` mapped to the repo root (see `tsconfig.json`). This supports imports like `@/src/domain/...` without additional aliases.

If we later add narrower aliases (e.g., `@/domain/*`), they must remain a convenience only and MUST NOT change the layer boundaries.

### Server Actions Location

Server Actions are **controllers** in Clean Architecture terms.

- They live in `src/adapters/controllers/`
- They are implemented as `'use server'` entry points
- They follow the controller conventions in `docs/_archive/specs/spec-010-server-actions.md`

**Why not `/app/(app)/app/_actions/`?**

1. **Clean Architecture compliance** — Controllers belong in adapters layer
2. **Testability** — Easier to test controllers in isolation
3. **Reusability** — Controllers can be called from multiple routes
4. **Consistency** — All adapters in one place

### Page Components (Route Handlers)

Pages import from controllers:

```typescript
// app/(app)/app/practice/page.tsx
import { getNextQuestion, submitAnswer } from '@/src/adapters/controllers/question-controller';
import { QuestionCard } from '@/components/question/question-card';

export default async function PracticePage() {
  // Call controller to get data
  const result = await getNextQuestion({});

  if (!result.ok) {
    // Handle error
  }

  return <QuestionCard question={result.data} onSubmit={submitAnswer} />;
}
```

### Composition Root

Dependency wiring happens at entry points (controllers and route handlers)
through the container composition root (see ADR-007).

- Allowed singleton: `lib/db.ts` (connection pooling / client reuse)
- Prohibited singletons: repositories, gateways, and use cases

### Test File Placement

| Test Type | Location | Naming |
|-----------|----------|--------|
| Domain unit tests | `src/domain/**/*.test.ts` | Colocated |
| Use case unit tests | `src/application/**/*.test.ts` | Colocated |
| Integration tests | `tests/integration/*.integration.test.ts` | Centralized |
| E2E tests | `tests/e2e/*.spec.ts` | Centralized |

## Migration from Flat Structure

If starting with flat structure, migrate in this order:

1. Create `src/domain/entities/` — Move type definitions
2. Create `src/domain/services/` — Extract pure business functions
3. Create `src/application/ports/` — Define interfaces
4. Create `src/application/use-cases/` — Extract business orchestration
5. Create `src/adapters/repositories/` — Implement interfaces with Drizzle
6. Create `src/adapters/gateways/` — Wrap Clerk/Stripe
7. Create `src/adapters/controllers/` — Move server actions
8. Update `lib/container.ts` / `lib/container/**` — Wire everything
9. Update imports throughout `app/` and `components/`

## Consequences

### Positive

1. **Clear boundaries** — Each layer has explicit purpose
2. **Testable** — Domain 100% testable without mocks
3. **Navigable** — Directory structure tells the story
4. **Scalable** — Easy to add new use cases without tangling
5. **Onboarding** — New devs understand architecture from folders

### Negative

1. **More files** — More directories and barrel exports
2. **Import paths** — Longer import statements
3. **Initial setup** — More structure to create upfront

### Mitigations

- Use barrel exports (`index.ts`) to simplify imports
- Configure path aliases for cleaner imports
- Document structure in this ADR

## Compliance Checklist

- [ ] All domain code in `src/domain/` with zero external imports
- [ ] All use cases in `src/application/use-cases/`
- [ ] All repository/gateway interfaces in `src/application/ports/`
- [ ] All implementations in `src/adapters/`
- [ ] Server actions in `src/adapters/controllers/` with `'use server'`
- [ ] Composition root centered on `lib/container.ts` (with supporting modules under `lib/container/**`)
- [ ] No circular dependencies between layers
- [ ] Path aliases configured in `tsconfig.json`

## References

- ADR-001: Clean Architecture Layers
- ADR-007: Dependency Injection Strategy
- Robert C. Martin, "Clean Architecture" (2017)
- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
