---
paths:
  - "src/**"
---

# Clean Architecture Rules

## Layer boundaries (dependencies point inward ONLY)

```text
src/domain/        -> ZERO external imports. Pure business logic.
src/application/   -> Depends only on domain. Use cases + port interfaces.
src/adapters/      -> Depends on application. Repos, gateways, controllers.
app/, lib/, db/    -> Outermost layer. Next.js framework code.
```

## SOLID Principles

- **Single Responsibility:** Each module has one reason to change
- **Open/Closed:** Open for extension, closed for modification
- **Liskov Substitution:** Implementations are swappable
- **Interface Segregation:** Small, specific interfaces
- **Dependency Inversion:** Depend on abstractions (ports), not concretions

## Key patterns

- **Constructor injection** for all dependencies (no global singletons)
- **Composition root** at entry points (Server Actions, Route Handlers)
- **Repository pattern** for data access (ports in application, implementations in adapters)
- **ApplicationError** with typed error codes for all error handling
- **Fakes over mocks** in tests (in-memory implementations of ports)

## Domain entity purity

- Domain entities (`User`, `Subscription`, `Question`) have NO vendor identifiers
- External IDs (Clerk user ID, Stripe subscription ID) exist ONLY in the persistence layer
- Use `SubscriptionPlan` (monthly/annual) in domain, not Stripe price IDs

## Shared types

Before creating new types, check:
- `src/adapters/shared/` for shared adapter types
- `src/application/ports/` for port interfaces
- `src/application/test-helpers/fakes.ts` for existing fakes

## ADRs: `docs/adr/` (ADR-001 through ADR-013)
