# DEBT-037: Unnecessary Null Checks in Attempt Repository

**Status:** Open
**Priority:** P3
**Date:** 2026-02-01

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

- **Confusing for maintainers:** The defensive check implies the column might be nullable, contradicting the schema
- **Code smell:** Suggests potential schema-code mismatch or lack of trust in database constraints
- **Minor runtime overhead:** Unnecessary null checks on every read operation

## Location

- `src/adapters/repositories/drizzle-attempt-repository.ts:13-26`

## Resolution

Remove the `requireSelectedChoiceId()` method and trust the database constraint. The TypeScript type from Drizzle should reflect the non-null nature automatically.

Alternatively, if there's a historical reason for this defensive check (e.g., data migration concerns), add a comment explaining why.

## Verification

- [ ] Remove `requireSelectedChoiceId()` method
- [ ] Update all call sites to use `row.selectedChoiceId` directly
- [ ] Verify TypeScript types from Drizzle infer `string` (not `string | null`)
- [ ] Run existing tests to confirm no regressions

## Related

- `db/schema.ts` - Attempts table definition
- DEBT-022 (archived) - Previous work on attempt nullability
