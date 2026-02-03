# Implementation Specifications

**Project:** Naltrexone University
**Last Updated:** 2026-02-03

---

## What are Specs?

Implementation specifications provide detailed technical guidance for building each component of the system. They serve as:

1. **Blueprint** — Detailed instructions for implementation
2. **Contract** — Define interfaces and behaviors
3. **TDD Guide** — Tests to write before implementation

## Spec Index

| ID | Title | Status | Layer |
|----|-------|--------|-------|
| [Master Spec](./master_spec.md) | Complete Technical Specification (SSOT) | Living | All |
| [SPEC-001](./spec-001-domain-entities.md) | Domain Entities | Implemented | Domain |
| [SPEC-002](./spec-002-value-objects.md) | Value Objects | Implemented | Domain |
| [SPEC-003](./spec-003-domain-services.md) | Domain Services | Implemented | Domain |
| [SPEC-004](./spec-004-application-ports.md) | Application Ports (Interfaces) | Implemented | Application |
| [SPEC-005](./spec-005-core-use-cases.md) | Core Use Cases (Interactors) | Implemented | Application |
| [SPEC-006](./spec-006-drizzle-schema.md) | Drizzle Schema | Implemented | Adapters |
| [SPEC-007](./spec-007-repository-implementations.md) | Repository Implementations (Drizzle) | Implemented | Adapters |
| [SPEC-008](./spec-008-auth-gateway.md) | Auth Gateway (Clerk) | Implemented | Adapters |
| [SPEC-009](./spec-009-payment-gateway.md) | Payment Gateway (Stripe) | Implemented | Adapters |
| [SPEC-010](./spec-010-server-actions.md) | Server Actions (Controllers) | Implemented | Adapters |
| [SPEC-011](./spec-011-paywall.md) | Paywall (Stripe Subscriptions) | Implemented | Feature |
| [SPEC-012](./spec-012-core-question-loop.md) | Core Question Loop | Implemented | Feature |
| [SPEC-013](./spec-013-practice-sessions.md) | Practice Sessions | Implemented | Feature |
| [SPEC-014](./spec-014-review-bookmarks.md) | Review + Bookmarks | Implemented | Feature |
| [SPEC-015](./spec-015-dashboard.md) | Dashboard | Implemented | Feature |
| [SPEC-016](./spec-016-observability.md) | Observability (Logging, Error Tracking) | Partial | Infrastructure |
| [SPEC-017](./spec-017-rate-limiting.md) | Rate Limiting | Partial | Infrastructure |

**Next Spec ID:** SPEC-018

## Spec Statuses

- **Proposed** — Under review, not yet approved
- **Ready** — Ready for implementation
- **In Progress** — Being implemented
- **Partial** — Partially implemented
- **Implemented** — Complete and verified
- **Deprecated** — No longer applicable

## Architecture Layers

Specs are organized by Clean Architecture layer:

- **Domain** — Entities, Value Objects, Domain Services
- **Application** — Use Cases, Ports (interfaces)
- **Adapters** — Repositories, Gateways, Controllers
- **Feature** — End-to-end feature slices
- **Infrastructure** — Cross-cutting concerns (logging, caching, etc.)

---

## How to Write a New Spec

1. Create `spec-NNN-short-title.md` using the template below
2. Set status to "Proposed"
3. Submit PR for review
4. Update status as implementation progresses

## Spec Template

```markdown
# SPEC-NNN: Title

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Proposed | Ready | In Progress | Partial | Implemented | Deprecated
**Layer:** Domain | Application | Adapters | Feature | Infrastructure
**Date:** YYYY-MM-DD

---

## Overview

What does this spec cover?

## Requirements

### Functional

- ...

### Non-Functional

- ...

## Design

### Interfaces

\`\`\`typescript
// Type definitions
\`\`\`

### Tests First

\`\`\`typescript
// Test cases to implement first
\`\`\`

## Implementation Notes

Any additional guidance for implementers.

## Related

- ADRs, other specs, external docs
```

---

## Related Documentation

- [Architecture Decision Records](../adr/index.md)
- [Bug Reports](../bugs/index.md)
- [Technical Debt](../debt/index.md)
