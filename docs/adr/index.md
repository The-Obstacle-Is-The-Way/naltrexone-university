# Architecture Decision Records

**Project:** Naltrexone University
**Last Updated:** 2026-01-31

---

## What are ADRs?

Architecture Decision Records document significant architectural decisions along with their context and consequences. They serve as:

1. **Historical Record** — Why we made certain choices
2. **Onboarding Tool** — Help new team members understand the system
3. **Decision Framework** — Guide future decisions consistently

## ADR Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [ADR-001](./adr-001-clean-architecture-layers.md) | Clean Architecture Layers | Accepted | 2026-01-31 |
| [ADR-002](./adr-002-domain-model.md) | Domain Model | Accepted | 2026-01-31 |
| [ADR-003](./adr-003-testing-strategy.md) | Testing Strategy | Accepted | 2026-01-31 |
| [ADR-004](./adr-004-authentication-boundary.md) | Authentication Boundary | Accepted | 2026-01-31 |
| [ADR-005](./adr-005-payment-boundary.md) | Payment Boundary | Accepted | 2026-01-31 |
| [ADR-006](./adr-006-error-handling-strategy.md) | Error Handling Strategy | Accepted | 2026-01-31 |
| [ADR-007](./adr-007-dependency-injection.md) | Dependency Injection | Accepted | 2026-01-31 |
| [ADR-008](./adr-008-logging-observability.md) | Logging & Observability | Accepted | 2026-01-31 |
| [ADR-009](./adr-009-security-hardening.md) | Security Hardening | Accepted | 2026-01-31 |
| [ADR-010](./adr-010-caching-strategy.md) | Caching Strategy | Accepted | 2026-01-31 |
| [ADR-011](./adr-011-api-design-principles.md) | API Design Principles | Accepted | 2026-01-31 |
| [ADR-012](./adr-012-directory-structure.md) | Directory Structure | Accepted | 2026-01-31 |

## ADR Statuses

- **Proposed** — Under discussion
- **Accepted** — Approved and in effect
- **Deprecated** — No longer applies (superseded or context changed)
- **Superseded** — Replaced by another ADR

## Key Decisions Summary

### ADR-001: Clean Architecture Layers

We adopt Uncle Bob's Clean Architecture with four layers:

```
Frameworks → Adapters → Use Cases → Entities
```

Dependencies point inward only. Domain has zero external dependencies.

### ADR-002: Domain Model

Core entities: User, Question, Choice, Attempt, Subscription, PracticeSession

Domain services (pure functions): `gradeAnswer()`, `isEntitled()`, `computeStreak()`

### ADR-003: Testing Strategy

- **Unit tests** — Domain and Use Cases, no mocks, 100% coverage
- **Integration tests** — Real database, real Stripe test mode
- **E2E tests** — Critical user flows only

Fakes over mocks. Test behavior, not implementation.

### ADR-004: Authentication Boundary

Clerk lives in Frameworks layer. Domain knows about `User` entities with internal IDs.

```
Clerk Session → AuthGateway → Use Case (userId) → Domain (User)
```

### ADR-005: Payment Boundary

Stripe lives in Frameworks layer. Domain knows about `Subscription` with status.

```
Stripe Webhook → PaymentGateway → Repository → Domain (Subscription)
```

`isEntitled()` is a pure domain function with no Stripe knowledge.

### ADR-006: Error Handling Strategy

Layered error handling: Domain throws `DomainError`, Use Cases throw `ApplicationError`, Controllers return `ActionResult<T>` (discriminated union).

```
DomainError → ApplicationError → ActionResult<T>
```

Type-safe errors at boundaries, no stack traces leaked to clients.

### ADR-007: Dependency Injection

Constructor injection with factory functions. Use cases receive interfaces, not implementations.

```
Container → Factory → Use Case (with injected repos/gateways)
```

No DI framework — simple factory functions in `lib/container.ts`.

### ADR-008: Logging & Observability

Structured JSON logging with Pino. Request ID correlation. Security-aware: no PII in logs.

```
Controller → Logger (with requestId, userId) → Vercel Log Drain
```

Domain layer has zero logging imports.

### ADR-009: Security Hardening

Defense in depth aligned with OWASP Top 10:
- Server-side authorization
- Input validation (Zod)
- Parameterized queries (Drizzle)
- Security headers
- Rate limiting

### ADR-010: Caching Strategy

Layered caching with Next.js 16 Cache Components:
- Static pages: ISR with revalidation
- Questions/Tags: Cache Components with `use cache`
- User data: No cache (real-time)

### ADR-011: API Design Principles

Contract-first design with Zod schemas:
- Every action has input schema
- Every action returns `ActionResult<T>`
- Standard error codes
- Semantic naming (verb + noun)

### ADR-012: Directory Structure

Authoritative directory structure reconciling Clean Architecture with Next.js:

```
src/domain/          → Entities, Value Objects, Domain Services
src/application/     → Use Cases, Ports (interfaces)
src/adapters/        → Repositories, Gateways, Controllers
app/, components/, lib/, db/ → Frameworks & Drivers (Next.js)
```

Server Actions live in `src/adapters/controllers/` (not `/app/_actions/`).

---

## How to Propose a New ADR

1. Create `adr-NNN-short-title.md` using the template below
2. Set status to "Proposed"
3. Submit PR for review
4. Discuss in PR comments
5. If accepted, merge and update status

## ADR Template

```markdown
# ADR-NNN: Title

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** YYYY-MM-DD
**Decision Makers:** [Names/Roles]
**Depends On:** [List any ADRs this depends on]

---

## Context

What is the issue we're addressing? What forces are at play?

## Decision

What is the change we're proposing/making?

## Consequences

### Positive
- ...

### Negative
- ...

### Mitigations
- ...

## Compliance

How will we verify this decision is followed?

## References

- ...
```

---

## Related Documentation

- [Master Specification](../specs/master_spec.md)
- [Implementation Specs](../specs/) (after ADRs are established)
