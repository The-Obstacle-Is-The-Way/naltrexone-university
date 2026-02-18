# Implementation Specifications

**Project:** Naltrexone University
**Last Updated:** 2026-02-18

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
| [SPEC-033](./spec-033-tag-taxonomy-migration.md) | Tag Taxonomy Migration | Implemented | Feature |
| [SPEC-034](./spec-034-review-mode-readonly-and-try-again-scoping.md) | Review Mode Read-Only Behavior & Try Again Scoping | Proposed | Feature |

**Master Spec split parts (readability):**

- [Master Spec — Part 1](./master_spec_part1.md) — Overview, Architecture, Database Schema
- [Master Spec — Part 2](./master_spec_part2.md) — API & Server Actions
- [Master Spec — Part 3](./master_spec_part3.md) — Content Pipeline, Directory Structure, Vertical Slices
- [Master Spec — Part 4](./master_spec_part4.md) — Testing, Security, Env Vars, Deployment

**Next Spec ID:** SPEC-035

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
| [SPEC-023](../_archive/specs/spec-023-question-review-mode.md) | Question Review Mode | Feature |
| [SPEC-024](../_archive/specs/spec-024-question-status-filter.md) | Question Status Filter (Practice & Quick Practice) | Feature |
| [SPEC-025](../_archive/specs/spec-025-choice-label-desync-fix.md) | Choice Label Desync Fix (Standalone Question Page) | Feature |
| [SPEC-026](../_archive/specs/spec-026-history-review-only.md) | History Tab — Review-Only Question Links | Feature |
| [SPEC-027](../_archive/specs/spec-027-session-review-navigation.md) | Session Review Navigation (Sequential Nav + Attempt Identity) | Feature |
| [SPEC-028](../_archive/specs/spec-028-status-filter-segmented-control.md) | Status & Difficulty Filter — Segmented Control Redesign | Feature |
| [SPEC-028b](../_archive/specs/spec-028-review-question-navigator.md) | Review Question Navigator (Color-Coded Grid) | Presentation |
| [SPEC-029](../_archive/specs/spec-029-dev-environment-resilience.md) | Dev Environment Resilience — Client-Side Timeouts & Observable Failures | Infrastructure |
| [SPEC-030](../_archive/specs/spec-030-question-view-ux-unification.md) | Question View UX Unification — State Persistence, Navigation, Action Bar | Feature |
| [SPEC-031](../_archive/specs/spec-031-unified-visual-front.md) | Unified Visual Front — Card Contrast + Shell Parity | Feature |
| [SPEC-032](../_archive/specs/spec-032-action-bar-standardization.md) | Action Bar Standardization | Feature |

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
