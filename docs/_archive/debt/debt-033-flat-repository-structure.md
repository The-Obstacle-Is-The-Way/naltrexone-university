# DEBT-033: Flat Repository Structure (No Aggregate Organization)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-01
**Resolved:** 2026-02-01

---

## Description

All 8 Drizzle repositories exist in a flat structure at `src/adapters/repositories/` with no organization by aggregate root or domain concept. As the system grows, this structure won't scale well.

## Location

- `src/adapters/repositories/`

## Current Structure

```
src/adapters/repositories/
├── drizzle-attempt-repository.ts
├── drizzle-bookmark-repository.ts
├── drizzle-practice-session-repository.ts
├── drizzle-question-repository.ts
├── drizzle-stripe-customer-repository.ts
├── drizzle-stripe-event-repository.ts
├── drizzle-subscription-repository.ts
├── drizzle-tag-repository.ts
├── index.ts
├── postgres-errors.ts
└── practice-session-limits.ts
```

## Impact

- **Cognitive Load:** Hard to see which repositories are related
- **Domain Visibility:** Aggregate boundaries not obvious from structure
- **Scaling:** With more features, flat list becomes unwieldy

## Proposed Structure

Option A: By Aggregate

```
src/adapters/repositories/
├── question-aggregate/
│   ├── drizzle-question-repository.ts
│   └── drizzle-tag-repository.ts
├── practice-aggregate/
│   ├── drizzle-practice-session-repository.ts
│   ├── drizzle-attempt-repository.ts
│   └── drizzle-bookmark-repository.ts
├── subscription-aggregate/
│   ├── drizzle-subscription-repository.ts
│   ├── drizzle-stripe-customer-repository.ts
│   └── drizzle-stripe-event-repository.ts
├── shared/
│   └── postgres-errors.ts
└── index.ts
```

Option B: By Bounded Context

```
src/adapters/repositories/
├── content/          # Question bank content
├── practice/         # User practice sessions
├── billing/          # Stripe/subscription
└── shared/           # Cross-cutting utilities
```

## Considerations

- Current flat structure is acceptable for 8 repositories
- Refactoring has churn cost
- Only restructure when adding more repositories

## Resolution

1. Documented aggregate boundaries and repository organization in ADR-013
2. Decision recorded: keep flat structure until the next aggregate is added
   (or repository count materially grows), then restructure by aggregate
3. If restructured later, keep barrel exports API-compatible

## Acceptance Criteria

- [x] ADR-013 documents aggregate boundaries
- [x] Decision recorded on when to restructure
- [x] If restructured: barrel exports maintain API compatibility

## Related

- ADR-012: Directory Structure
- Domain-Driven Design: Aggregate pattern
