# DEBT-037: Unnecessary Null Checks in Attempt Repository

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-01
**Resolved:** 2026-02-02

---

## Description

The `DrizzleAttemptRepository` has a `requireSelectedChoiceId()` method that performs null checking on the `selectedChoiceId` field. However, the database schema defines this column as `.notNull()`:

```typescript
// db/schema.ts:304-306
selectedChoiceId: uuid('selected_choice_id')
  .notNull()
  .references(() => choices.id, { onDelete: 'restrict' }),
```

The defensive null check in the repository is overly cautious since the database guarantees this value will never be null.

## Impact

- **Minor runtime overhead:** A small extra check on row mapping
- **Potential confusion:** Readers may wonder why a NOT NULL column is re-validated in code

## Location

- `src/adapters/repositories/drizzle-attempt-repository.ts:13-26`

## Resolution

This debt was a **false positive**.

Even though the database schema enforces `selected_choice_id` as NOT NULL, we intentionally keep the invariant check in the adapter mapping layer:

- Repositories should never return invalid domain entities.
- If data is corrupted (manual DB edits, broken migrations) or a query accidentally omits the column, we fail fast with an `ApplicationError('INTERNAL_ERROR', …)` instead of silently returning an invalid `Attempt`.
- Our repository unit tests explicitly cover this failure mode.

## Verification

- [x] Confirm schema enforces NOT NULL on `attempts.selectedChoiceId`
- [x] Confirm repository throws `ApplicationError('INTERNAL_ERROR', …)` when `selectedChoiceId` is unexpectedly missing
- [x] Run existing tests to confirm no regressions

## Related

- `db/schema.ts` - Attempts table definition
- DEBT-022 (archived) - Previous work on attempt nullability
