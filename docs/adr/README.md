# Architecture Decision Records

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
| [ADR-003](./adr-003-testing-strategy.md) | Testing Strategy | Accepted (amended 2026-10-12) | 2026-01-31 |
| [ADR-004](./adr-004-authentication-boundary.md) | Authentication Boundary | Accepted | 2026-01-31 |
| [ADR-005](./adr-005-payment-boundary.md) | Payment Boundary | Accepted | 2026-01-31 |
| [ADR-006](./adr-006-error-handling-strategy.md) | Error Handling Strategy | Accepted | 2026-01-31 |
| [ADR-007](./adr-007-dependency-injection.md) | Dependency Injection | Accepted | 2026-01-31 |
| [ADR-008](./adr-008-logging-observability.md) | Logging & Observability | Accepted | 2026-01-31 |
| [ADR-009](./adr-009-security-hardening.md) | Security Hardening | Accepted | 2026-01-31 |
| [ADR-010](./adr-010-caching-strategy.md) | Caching Strategy | Accepted | 2026-01-31 |
| [ADR-011](./adr-011-api-design-principles.md) | API Design Principles | Accepted | 2026-01-31 |
| [ADR-012](./adr-012-directory-structure.md) | Directory Structure | Accepted (amended 2026-10-06, 2026-10-12) | 2026-01-31 |
| [ADR-013](./adr-013-repository-organization.md) | Repository Organization by Aggregate | Accepted | 2026-02-01 |
| [ADR-014](./adr-014-stripe-eager-sync.md) | Stripe Eager Sync on Checkout Success | Accepted | 2026-02-02 |
| [ADR-015](./adr-015-idempotency-strategy.md) | Idempotency Strategy | Accepted | 2026-02-07 |
| [ADR-016](./adr-016-rate-limiting.md) | Rate Limiting and Abuse Prevention | Accepted | 2026-02-07 |
| [ADR-017](./adr-017-webhook-processing-lifecycle.md) | Webhook Processing Lifecycle | Accepted | 2026-02-07 |
| [ADR-018](./adr-018-resilience-patterns.md) | Resilience Patterns (Retry and Backoff) | Accepted | 2026-02-07 |
| [ADR-019](./adr-019-test-quality-practices.md) | Test Quality Practices (CRAP, Mutation, Acceptance, UI QA) | Accepted (amended 2026-10-12) | 2026-08-13 |
| [ADR-020](./adr-020-coverage-patch-gate.md) | Coverage Stays a Patch-Level Signal, Not a Per-Lane Threshold | Accepted | 2026-09-26 |
| [ADR-021](./adr-021-question-revisions-and-content-releases.md) | Immutable Question Revisions and Atomic Content Releases | Accepted | 2026-09-27 |
| [ADR-022](./adr-022-learner-scores-and-labels-when-content-changes.md) | Learner Scores and Labels When Content Changes | Accepted (amended 2026-10-03) | 2026-10-03 |
| [ADR-023](./adr-023-documentation-organisation.md) | Documentation Organisation | Accepted (amended 2026-10-11) | 2026-10-11 |
| [ADR-024](./adr-024-review-merge-and-promotion.md) | Review, Merge and Promotion | Accepted | 2026-10-11 |
| [ADR-025](./adr-025-test-doubles-by-shape-or-behaviour.md) | Test Doubles by Shape or Behaviour | Accepted | 2026-10-11 |
| [ADR-026](./adr-026-error-monitoring-with-sentry.md) | Error Monitoring with Sentry | Accepted | 2026-10-12 |
| [ADR-027](./adr-027-free-trial-renewal-consent-and-notices.md) | Free Trial, Renewal Consent and Renewal Notices | Proposed (until counsel review, issue #902) | 2026-10-12 |

## ADR Statuses

- **Proposed** — Under discussion
- **Accepted** — Approved and in effect
- **Deprecated** — No longer applies (superseded or context changed)
- **Superseded** — Replaced by another ADR

## Key Decisions Summary

### ADR-001: Clean Architecture Layers

We adopt Uncle Bob's Clean Architecture with four layers:

```text
Frameworks → Adapters → Use Cases → Entities
```

Dependencies point inward only. Domain has zero external dependencies.

### ADR-002: Domain Model

Core entities: User, Question, Choice, Attempt, Subscription, PracticeSession,
Bookmark, Tag

Domain services (pure functions): `gradeAnswer()`, `isEntitled()`,
`computeAccuracy()`, `computeStreak()`

### ADR-003: Testing Strategy

- **Unit tests** — Domain and Use Cases, fakes over mocks, strong colocated coverage
- **Integration tests** — Real database; external providers mocked at the boundary (Stripe/Clerk)
- **E2E tests** — Critical user flows only

Fakes over mocks. Test behavior, not implementation.

### ADR-004: Authentication Boundary

Clerk lives in Frameworks layer. Domain knows about `User` entities with internal IDs.

```text
Clerk Session → AuthGateway → Use Case (userId) → Domain (User)
```

### ADR-005: Payment Boundary

Stripe lives in Frameworks layer. Domain knows about `Subscription` with status.

```text
Stripe Webhook → PaymentGateway → Repository → Domain (Subscription)
```

`isEntitled()` is a pure domain function with no Stripe knowledge.

### ADR-006: Error Handling Strategy

Layered error handling: Domain throws `DomainError`, Use Cases throw `ApplicationError`, Controllers return `ActionResult<T>` (discriminated union).

```text
DomainError → ApplicationError → ActionResult<T>
```

Type-safe errors at boundaries, no stack traces leaked to clients.

### ADR-007: Dependency Injection

Constructor injection with factory functions. Use cases receive interfaces, not implementations.

```text
Controller/Route Handler → Factory → Use Case (with injected ports)
```

No DI framework. Wiring is centered on `lib/container.ts` with focused modules
under `lib/container/**`, and controllers resolve deps via
`lib/controller-helpers.ts` at the entry point.

### ADR-008: Logging & Observability

Structured JSON logging via Pino with request ID correlation. Security-aware: no PII in logs.

```text
Entry points create request context and child loggers so structured JSON logs
carry `requestId` and, when available, internal `userId`.
```

Domain layer has zero logging imports.

### ADR-009: Security Hardening

Defense in depth aligned with OWASP Top 10:
- Server-side authorization
- Input validation (Zod)
- Parameterized queries (Drizzle)
- Security headers

### ADR-010: Caching Strategy

Conservative framework-only caching policy:
- Static or marketing surfaces may use framework caching
- User-specific reads stay uncached across requests
- Published question/tag repository reads are not cross-request cached today;
  targeted invalidation is used selectively where needed

### ADR-011: API Design Principles

Contract-first design with Zod schemas:
- Every action has input schema
- Every action returns `ActionResult<T>`
- Standard error codes
- Semantic naming (verb + noun)

### ADR-012: Directory Structure

Authoritative directory structure reconciling Clean Architecture with Next.js:

```text
src/domain/          → Entities, Value Objects, Domain Services
src/application/     → Use Cases, Ports (interfaces)
src/adapters/        → Repositories, Gateways, Controllers
app/, components/, lib/, db/ → Frameworks & Drivers (Next.js)
```

Server Actions live in `src/adapters/controllers/` (not `/app/_actions/`).

### ADR-013: Repository Organization by Aggregate

Flat structure for now, with aggregate boundaries defined (Content, Practice, Billing, User). Restructure when repository count grows or a new aggregate is added.

### ADR-014: Stripe Eager Sync on Checkout Success

On `/checkout/success`, eagerly fetch and upsert subscription state from Stripe API to eliminate the "paid but locked out" race condition. Webhooks remain source of truth for ongoing lifecycle.

### ADR-015: Idempotency Strategy

Claim-execute-store pattern backed by Postgres. Client provides a UUID key; first request claims and executes, duplicates receive cached result. TTL-based expiry with garbage collection.

```text
claim(key) → execute() → storeResult() → return
     └── already claimed → poll for cached result
```

### ADR-016: Rate Limiting and Abuse Prevention

Per-user/per-IP fixed-window rate limiting via Postgres. Centralized limit configuration per action. Atomic `INSERT ... ON CONFLICT DO UPDATE` for race-free counting.

### ADR-017: Webhook Processing Lifecycle

Signature verification → Zod payload validation → event type routing → subscription normalization (fetch latest from Stripe API) → exactly-once processing via `stripe_events` claim table.

### ADR-018: Resilience Patterns (Retry and Backoff)

Generic `retry()` with exponential backoff for transient external errors. Only retries network errors, 429s, and 5xx responses. Applied at the adapter boundary only; domain and application layers never retry.

### ADR-019: Test Quality Practices (CRAP, Mutation, Acceptance, UI QA)

Practices that audit and specify the ADR-003 suite from the outside: a CRAP-metric report (`scripts/crap-report.ts`) ranking under-tested complexity, StrykerJS mutation testing scoped to the unit lane, and a register of scripted UI QA procedures (in `docs/guides/qa/` since 2026-10-12), run before the production bootstrap and before releases that change their flows. The 2026-10-03 amendment does not adopt the proposed Gherkin acceptance harness: its rules are already proven by mutation-tested unit tests and real-Postgres and E2E tests, so a plain-language rule-to-test register replaces it. All metrics are **observational ratchets** — converting any into a CI gate requires a new ADR. Adoption tracked as DEBT-465; runbooks in `docs/guides/testing/` and `docs/guides/qa/`.

### ADR-020: Coverage Stays a Patch-Level Signal, Not a Per-Lane Threshold

No per-lane `coverage.thresholds` or project target. The existing `codecov/patch` status, at its default `auto` target, is the one coverage gate: a change's measured patch coverage may not fall below the base target. Both merge tools require it green by name, so a missing status blocks like a failed one. The 2026-09-28 amendment excuses a missing status only on a feature PR whose complete changed-file list contains only `package.json`, `pnpm-lock.yaml` or paths under `.github/`, where Codecov cannot post and nothing is measured; a posted `codecov/patch` must still succeed. Assertion strength is judged by mutation evidence. Closes DEBT-468 Part 4.

### ADR-021: Immutable Question Revisions and Atomic Content Releases

Learner-visible question content lives in immutable revisions; attempts and session states bind the revision they showed, so grading and review never re-read rewritten content, and a withdrawn question stays reviewable, with a notice, by learners who attempted it. Content becomes visible through verified releases activated in one transaction, with withdrawals and holds kept as a current overlay that rollback cannot resurrect. Five expand/contract phases; release zero hashes `stored-fields-json-v1`, the stored fields as sorted-key JSON (decided 2026-09-28). Closes DEBT-484 after phases 1–3 and DEBT-483 after phase 4.

### ADR-022: Learner Scores and Labels When Content Changes

A question a learner answered is in one of four states, derived at read time from its status, withdrawals and unlifted holds: available, withdrawn, under review or retired. Each has its own label, and each unavailable state has a clinical caution where its content may be wrong. Its content is shown only to a learner who answered it. One scoring rule applies everywhere, as amended 2026-10-03 (DEBT-494): an item counts when the learner had a fair chance at it, recorded when its session ends, and its content is not now in doubt. Withdrawn and under-review questions, and answered items whose graded key was since corrected, are in doubt; retiring a question changes no past score. A key correction is detected, disclosed and re-practiced, and stored grades are never rewritten. Decides DEBT-484's deferred scoring and regrade questions and BUG-317's label question; implemented by DEBT-493.

### ADR-023: Documentation Organisation

One kind of document per folder under `docs/`, chosen by a first-match placement test; lowercase kebab-case names, with IDs only on ADRs and records. Records are working files deleted on close, leaving one line in `docs/records/closed.md`. An accepted ADR is frozen, and changes only by an appended, dated amendment or a superseding ADR. Agent instructions hold only rules; decisions and their history live in ADRs.

### ADR-024: Review, Merge and Promotion

Feature PRs merge only with CodeRabbit's approval of the exact head, through `scripts/merge-reviewed-pr.ts`; an approval carries across a sync that leaves the reviewable diff unchanged. GitHub's ruleset enforces what it can. Promotions from `dev` to `main` prove their sources instead of being reviewed again. CodeRabbit reviews only what can merge, and agents never ask it to record a learning. Production waits for `main`'s CI through Vercel Deployment Checks.

### ADR-025: Test Doubles by Shape or Behaviour

One vocabulary (fake, stub, spy, mock, contract test). A test that needs only a collaborator's shape uses a narrowly typed stub; one that needs its behaviour uses a fake checked against the real implementation by a contract test. A Drizzle call-chain object is a stub, not a fake. `vi.mock()` is only for modules that cannot be injected, and `pnpm lint:doubles` keeps violations from growing.

### ADR-026: Error Monitoring with Sentry

Sentry is the error and alert channel, with a browser project on the public key and a server project on a sensitive key that no browser receives. Every runtime sets what Sentry may collect explicitly, server breadcrumbs and trace propagation are off, and privacy is proven by tests through the real SDK. Failures the owner must act on are sent as tagged operational alerts that email the owner, with a monthly drill.

### ADR-027: Free Trial, Renewal Consent and Renewal Notices

Proposed until counsel's review. A first checkout gets a 7-day trial that needs no card and ends without charge if none is added; a trial's first card comes only through a consented add-card flow. Every path to a paid subscription takes a separate, unchecked renewal opt-in to versioned text, kept as evidence for three years or one year after termination, and acknowledged by email. Renewal notices go out 35 to 30 days before renewal for both plans, through a durable Resend delivery that is never repeated while its outcome is unknown and is revalidated before sending. A scheduled cancellation keeps access to period end and stops notices.

---

## How to Propose a New ADR

Use the next unused ADR number after integrating the target branch; do not renumber an accepted decision. Write context, alternatives, decision, consequences and how compliance is checked. Proposed text is explicitly Proposed until its decision maker accepts it. The index links the ADR and reflects its status.

Once accepted, preserve the decision text. Correct or extend it in a dated `Amendment — YYYY-MM-DD` section and update its status and index row. A replacement decision gets a new number, links what it supersedes, and updates the old ADR's status to `Superseded by ADR-NNN` with a link. Record any partly superseded scope precisely; do not erase the unaffected decisions. Mechanical link maintenance is allowed. Progress and verification receipts belong in the work record or PR.

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

- [Product specification](../product/specification.md)
- [How a feature gets its specification](../product/README.md)
- [Documentation map](../README.md)
