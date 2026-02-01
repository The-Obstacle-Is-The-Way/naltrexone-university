# ADR-007: Dependency Injection Strategy

**Status:** Accepted
**Date:** 2026-01-31
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers)

---

## Context

Clean Architecture requires the Dependency Inversion Principle (DIP): use cases depend on **interfaces**, not concrete implementations.

In Next.js App Router, we also have constraints:

- Server Actions are top-level functions
- There is no traditional “app bootstrap” phase
- Requests may be isolated (serverless)

We need a DI strategy that is:

- Explicit and testable (fakes over mocks)
- Compatible with Server Actions + Route Handlers
- Low ceremony (no heavy DI container framework)

---

## Decision

We use **constructor injection + factory functions**.

### Composition Root

- The composition root is `lib/container.ts` (factory functions that wire ports → implementations).
- Entry points call the factories:
  - `src/adapters/controllers/*.ts` (Server Actions)
  - `app/api/**/route.ts` (Route Handlers)

### Singleton Policy

- Allowed singleton: `lib/db.ts` connection pooling / client reuse (infrastructure concern).
- Prohibited singletons: repositories, gateways, and use cases. These should be created per composition call (they are cheap and stateless).

### Test Injection

Use cases are instantiated directly in tests with fake ports. Controllers may optionally accept overrides for tests, but the default pattern is:

- Unit tests for use cases: inject fakes (SPEC-005)
- Unit tests for controllers: inject fakes at the controller boundary (SPEC-010)

---

## Consequences

### Positive

- Dependencies are explicit and traceable.
- Use cases are easy to unit test without infrastructure.
- No runtime magic or container configuration drift.

### Negative

- Manual wiring required when adding new ports/use cases.

### Mitigations

- Keep a small set of focused factory helpers (if needed).
- Prefer “compose at entry point” over a global container.

---

## Compliance Checklist

- [ ] Application layer imports only `src/domain/**` and `src/application/**`
- [ ] Adapters implement ports from `src/application/ports/**`
- [ ] No repository/gateway singletons (DB client is the only allowed singleton)
- [ ] Tests use fakes, not mocks of concrete classes

---

## References

- Robert C. Martin, "Clean Architecture" (2017)
- Mark Seemann, "Dependency Injection" (principles apply)
