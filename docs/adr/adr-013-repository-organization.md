# ADR-013: Repository Organization by Aggregate

**Status:** Accepted (amended 2026-11-15)
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
- The flat list starts to hinder navigation and we have a dedicated refactor
  window (to avoid wide import churn during feature work).

**Status note (2026-02-09):** `src/adapters/repositories/` is now well beyond
single digits. We are intentionally **still** deferring the aggregate-folder
restructure until it is scheduled as a focused refactor with strict
API‑compatibility guarantees (barrel exports preserved).

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

## Amendment — 2026-11-15: the folder stays flat

Decided 2026-11-15 by the reviewing session, at the owner's delegation of engineering calls for this review (records accuracy review, 2026-11-15), for DEBT-520.

The trigger above fired without a restructure: question feedback, renewal consent, renewal notices, trial card setup, Clerk events, deleted Clerk users, idempotency keys and pending Stripe customer cleanups each added a repository. Weighed now, grouping by aggregate costs more than it gives:

- Each of the 17 repositories is one file named for what it stores, `drizzle-<name>-repository.ts`, so a search by name finds it. Seven have unit tests beside them; the other ten are proven against Postgres in `tests/integration/`.
- The folders would be uneven. On the four aggregates above, Billing would hold seven repositories (its three, plus renewal consent, renewal notices, trial card setup and pending Stripe customer cleanups), User three (with Clerk events and deleted Clerk users), Practice three and Content three (with question feedback). Idempotency keys, which serve every keyed action, would fit none.
- The ports in `src/application/ports/` are flat, one file per repository. Folders on one side only would make the two layers disagree.
- 92 files outside the folder import from it (81 integration tests, 4 other tests and 7 production files, counted 2026-11-15). Only 9 import the barrel, so the compatibility guarantee would not spare the rest. Moving them is churn that no reader benefits from.

So `src/adapters/repositories/` stays flat. The aggregate groupings, the trigger and the compatibility guarantee above no longer apply, and no new trigger replaces them. Grouping later takes a new decision.
