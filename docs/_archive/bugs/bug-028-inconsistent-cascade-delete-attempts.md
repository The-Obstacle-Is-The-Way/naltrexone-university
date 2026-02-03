# BUG-028: Inconsistent Cascade Delete for Attempts

**Status:** Won't Fix
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Decision:** 2026-02-02

---

## Summary

The `attempts` table intentionally uses different `onDelete` behaviors across foreign keys (`cascade`, `restrict`, `set null`). This is sometimes described as “inconsistent”, but it reflects deliberate tradeoffs for auditability and user-data deletion.

## Location

- `db/schema.ts:294-310` (attempts table definition)

## Current Schema (as implemented)

```typescript
// userId - CASCADE: Deleting user deletes all their attempts
userId: uuid('user_id')
  .notNull()
  .references(() => users.id, { onDelete: 'cascade' }),

// questionId - CASCADE: Deleting question deletes attempts
questionId: uuid('question_id')
  .notNull()
  .references(() => questions.id, { onDelete: 'cascade' }),

// selectedChoiceId - RESTRICT: Cannot delete choice if attempts reference it
selectedChoiceId: uuid('selected_choice_id')
  .notNull()
  .references(() => choices.id, { onDelete: 'restrict' }),

// practiceSessionId - SET NULL: Deleting session orphans the attempt
practiceSessionId: uuid('practice_session_id').references(
  () => practiceSessions.id,
  { onDelete: 'set null' },
),
```

## Decision (Why This Is Not A Bug)


This schema matches the SSOT and is consistent with the product’s data semantics:

1. **`selectedChoiceId: restrict` is audit-preserving**
   - An `attempt` should always reference the exact choice selected at the time.
   - Deleting a referenced choice would break historical integrity. We should version/soft-delete choices if we ever need “remove”.

2. **`practiceSessionId: set null` keeps attempts valid outside a session**
   - Attempts are meaningful even if a session record is removed (sessions are contextual grouping, not the attempt’s identity).
   - The application does not currently delete sessions in normal operation; this FK is a safety valve for cleanup tools.

3. **`userId: cascade` supports user deletion (GDPR / account removal)**
   - When a user is deleted, their dependent data is removed as well.

4. **`questionId: cascade` is acceptable because questions should be archived, not deleted**
   - In production we should prefer `questions.status='archived'` to preserve history.
   - If a hard delete occurs (e.g. test/dev cleanup), cascading attempts avoids orphans.

Changing these constraints to “make them consistent” would either:
- weaken referential/audit integrity (`set null` on choices), or
- risk unintended data loss (`cascade` from sessions), or
- require a broader soft-delete strategy across multiple tables (a larger design decision).

## Verification

- [x] `db/schema.ts` matches `docs/specs/master_spec.md` for `attempts` FK deletion semantics.
- [x] No production code path relies on deleting `choices` or `practice_sessions`.

## Related
- `docs/specs/master_spec.md` (schema section for `attempts`)
- `db/schema.ts` (`attempts` table definition)
