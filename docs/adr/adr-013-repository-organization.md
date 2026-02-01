# ADR-013: Repository Organization by Aggregate

**Status:** Accepted
**Date:** 2026-02-01
**Decision Makers:** Architecture Team
**Depends On:** ADR-001 (Clean Architecture Layers), ADR-012 (Directory Structure)

---

## Context

The adapter repositories currently live in a flat directory:

```
src/adapters/repositories/
```

This is manageable with the current repository count, but the structure will
become harder to navigate as new aggregates and repositories are added.

We need a clear aggregate boundary decision, plus a trigger for when to
restructure.

---

## Decision

### Aggregate Groupings

When we restructure, repositories will be organized by aggregate:

1. **Content aggregate**
   - `QuestionRepository`
   - `TagRepository`

2. **Practice aggregate**
   - `PracticeSessionRepository`
   - `AttemptRepository`
   - `BookmarkRepository`

3. **Billing aggregate**
   - `SubscriptionRepository`
   - `StripeCustomerRepository`
   - `StripeEventRepository`

4. **User aggregate**
   - `UserRepository`

### Trigger to Restructure

We will **keep the flat structure for now** to avoid churn. We will restructure
by aggregate when:

- A new aggregate is introduced **or**
- The repository count grows beyond the current 9 and the flat list starts to
  hinder navigation.

### Compatibility Guarantee

When we restructure, we will keep the barrel exports in
`src/adapters/repositories/index.ts` API‑compatible to avoid wide import churn.

---

## Consequences

### Positive

- Aggregate boundaries are now explicitly documented.
- We avoid premature churn while codebase is still small.

### Negative

- Future restructure will require path updates in internal imports.

---

## References

- DEBT-033: Flat Repository Structure
- ADR-001: Clean Architecture Layers
- ADR-012: Directory Structure
