# SPEC-007: Repository Implementations (Drizzle)

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Adapters
**Dependencies:** SPEC-004 (Ports), SPEC-006 (Drizzle Schema)
**Implements:** ADR-001 (Clean Architecture), ADR-003 (Testing)

---

## Objective

Implement Application-layer repository ports using Drizzle + Postgres.

Repositories live in the **Adapters** layer:

- They implement interfaces defined in `src/application/ports/repositories.ts`
- They map DB rows (`db/schema.ts`) ⇄ domain entities (`src/domain/**`)
- They contain **no business rules** (business logic belongs to domain/use cases)

---

## Files to Create

```text
src/adapters/repositories/
├── drizzle-question-repository.ts
├── drizzle-attempt-repository.ts
├── drizzle-practice-session-repository.ts
├── drizzle-bookmark-repository.ts
├── drizzle-tag-repository.ts
├── drizzle-subscription-repository.ts
├── drizzle-stripe-customer-repository.ts
├── drizzle-stripe-event-repository.ts
└── index.ts
```

---

## Design Rules

1. **No Drizzle types leak upward**: ports return domain types only.
2. **All queries are parameterized**: use Drizzle query builders (`eq`, `and`, `inArray`, etc.).
3. **Ownership checks belong in use cases/controllers**: repositories are not authorization engines.
4. **Mapping is explicit**: prefer small `toDomain()` helpers per entity.

---

## Testing Strategy

Repository implementations are tested as **integration tests** against a real Postgres instance:

- Local: a dedicated test database (`DATABASE_URL`)
- CI: service container (see `.github/workflows/ci.yml`)

Safety note:

- Integration tests MUST NOT run against production/remote databases by accident. The test suite will refuse to run when `DATABASE_URL` hostname is not local (`localhost`/`127.0.0.1`) unless `ALLOW_NON_LOCAL_DATABASE_URL=true` is explicitly set.

Test location:

```text
tests/integration/**/*.test.ts
```

Tests should validate:

- Queries return the expected domain objects
- Constraints/indexes behave as expected (e.g., uniqueness)
- Migrations + seed data work end-to-end

---

## Notes on Idempotency Tables

Stripe webhook idempotency uses `stripe_events`:

- `stripe_events.id` = Stripe event id (primary key)
- Repositories must support: `ensure`, `isProcessed`, `markProcessed`, `markFailed`

See `docs/specs/master_spec.md` Section 4.4.2 for exact behavior.

---

## Minimum Test Suite (Required)

These integration tests are required before any slice that depends on these repositories is considered complete:

- `tests/integration/db.integration.test.ts`: migrations applied; required tables exist.
- `tests/integration/repositories.integration.test.ts`: exercise each repository method with a real database.

`tests/integration/repositories.integration.test.ts` MUST include (at minimum):

- `QuestionRepository.findPublishedById` returns `null` for non-published questions.
- `AttemptRepository.insert` creates an attempt row with correct FK wiring.
- `BookmarkRepository.add/remove/exists/listByUserId` round-trips correctly.
- `StripeEventRepository.ensure/isProcessed/markProcessed/markFailed` is idempotent and concurrency-safe (unique PK on `stripe_events.id`).

---

## Definition of Done

- All repository ports in `docs/specs/spec-004-application-ports.md` have concrete Drizzle implementations.
- Integration tests pass on:
  - local Postgres (developer environment)
  - GitHub Actions Postgres service (CI)
