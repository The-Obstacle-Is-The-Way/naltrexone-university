# Implementation Specifications

**Project:** Naltrexone University
**Last Updated:** 2026-02-12

---

## What are Specs?

Implementation specifications provide detailed technical guidance for building each component of the system. They serve as:

1. **Blueprint** — Detailed instructions for implementation
2. **Contract** — Define interfaces and behaviors
3. **TDD Guide** — Tests to write before implementation

## Active Specs

| ID | Title | Status | Layer |
|----|-------|--------|-------|
| [Master Spec](./master_spec.md) | Complete Technical Specification (SSOT) | Living | All |
| [SPEC-016](./spec-016-observability.md) | Observability (Logging, Error Tracking) | Partially Implemented | Infrastructure |
| [SPEC-017](./spec-017-rate-limiting.md) | Rate Limiting | Partial (MVP done) | Infrastructure |
| [SPEC-023](./spec-023-question-review-mode.md) | Question Review Mode | In Progress | Feature |
| [SPEC-024](./spec-024-question-status-filter.md) | Question Status Filter (Practice & Quick Practice) | Ready | Feature |
| [SPEC-025](./spec-025-choice-label-desync-fix.md) | Choice Label Desync Fix (Standalone Question Page) | Ready | Feature |
| [SPEC-026](./spec-026-history-review-only.md) | History Tab — Review-Only Question Links | Ready | Feature |
| [SPEC-027](./spec-027-session-review-navigation.md) | Session Review Navigation (Sequential Nav + Attempt Identity) | Ready | Feature |

**Next Spec ID:** SPEC-028

## Archived Specs

| ID | Title | Layer |
|----|-------|-------|
| [SPEC-001](../_archive/specs/spec-001-domain-entities.md) | Domain Entities | Domain |
| [SPEC-002](../_archive/specs/spec-002-value-objects.md) | Value Objects | Domain |
| [SPEC-003](../_archive/specs/spec-003-domain-services.md) | Domain Services | Domain |
| [SPEC-004](../_archive/specs/spec-004-application-ports.md) | Application Ports (Interfaces) | Application |
| [SPEC-005](../_archive/specs/spec-005-core-use-cases.md) | Core Use Cases (Interactors) | Application |
| [SPEC-006](../_archive/specs/spec-006-drizzle-schema.md) | Drizzle Schema | Adapters |
| [SPEC-007](../_archive/specs/spec-007-repository-implementations.md) | Repository Implementations (Drizzle) | Adapters |
| [SPEC-008](../_archive/specs/spec-008-auth-gateway.md) | Auth Gateway (Clerk) | Adapters |
| [SPEC-009](../_archive/specs/spec-009-payment-gateway.md) | Payment Gateway (Stripe) | Adapters |
| [SPEC-010](../_archive/specs/spec-010-server-actions.md) | Server Actions (Controllers) | Adapters |
| [SPEC-011](../_archive/specs/spec-011-paywall.md) | Paywall (Stripe Subscriptions) | Feature |
| [SPEC-012](../_archive/specs/spec-012-core-question-loop.md) | Core Question Loop | Feature |
| [SPEC-013](../_archive/specs/spec-013-practice-sessions.md) | Practice Sessions | Feature |
| [SPEC-014](../_archive/specs/spec-014-review-bookmarks.md) | Review + Bookmarks | Feature |
| [SPEC-015](../_archive/specs/spec-015-dashboard.md) | Dashboard | Feature |
| [SPEC-018](../_archive/specs/spec-018-ui-integration.md) | UI Integration (v0 Templates) | Feature |
| [SPEC-019](../_archive/specs/spec-019-practice-ux-redesign.md) | Practice & Navigation UX Redesign | Feature |
| [SPEC-020](../_archive/specs/spec-020-practice-engine-completion.md) | Practice Engine Completion | Feature |
| [SPEC-021](../_archive/specs/spec-021-history-page-restructure.md) | History Page Restructure | Feature |
| [SPEC-022](../_archive/specs/spec-022-question-log.md) | Question Log (Quick Practice History Gap) | Feature |

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

- [Practice Engine](../practice-engine/index.md) — Canonical reference for the core practice feature (cross-cuts all specs)
- [Architecture Decision Records](../adr/index.md)
- [Bug Reports](../bugs/index.md)
- [Technical Debt](../debt/index.md)
- [Frontend Standards](../frontend/standards.md)
- [Brainstorming](../brainstorming/index.md) — UX audits, gap analyses, and design explorations
