# SPEC-007: Repository Implementations (Drizzle)

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

```
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
2. **All queries are parameterized**: use Drizzle query builders (`eq`, `and`, `inArray`, etc).
3. **Ownership checks belong in use cases/controllers**: repositories are not authorization engines.
4. **Mapping is explicit**: prefer small `toDomain()` helpers per entity.

---

## Testing Strategy

Repository implementations are tested as **integration tests** against a real Postgres instance:

- Local: a dedicated test database (`DATABASE_URL`)
- CI: service container (see `.github/workflows/ci.yml`)

Test location:

```
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

