# BUG-027: Inconsistent Cascade Delete for Attempts

## Severity: P2 - Medium

## Summary
The `attempts` table has inconsistent foreign key cascade behaviors. When related records are deleted, some FKs cascade, some restrict, and some set null—leading to potential orphaned or blocked data.

## Location
- `db/schema.ts:294-310` (attempts table definition)

## Current Behavior
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

## Inconsistencies
1. **User deletion** → Cascades attempts (audit trail lost)
2. **Question deletion** → Cascades attempts (user history lost)
3. **Choice deletion** → BLOCKED if any attempt references it
4. **Session deletion** → Attempts remain with null session (orphaned context)

## Impact
- **Data integrity:** Inconsistent rules make it hard to reason about deletions
- **Blocked operations:** Cannot delete a choice that has been selected
- **Orphaned data:** Attempts exist without session context after session cleanup
- **Lost audit trail:** Deleting a user removes all their answer history

## Expected Behavior
Consistent strategy across all FKs:
- Either preserve audit trail (soft delete everywhere)
- Or clean cascade (full deletion everywhere)

## Recommended Fix
**Option A (Audit-preserving):**
```typescript
// All FKs should SET NULL and use soft delete
onDelete: 'set null'
// Add deletedAt column to users, questions, choices, sessions
```

**Option B (Clean cascade):**
```typescript
// All FKs should CASCADE consistently
onDelete: 'cascade'
```

**Option C (Restrict all):**
```typescript
// Prevent deletion of anything referenced
onDelete: 'restrict'
// Use soft delete for all tables
```

## Related
- ADR-010: Data model decisions (if exists)
- SPEC-001: Domain entities
