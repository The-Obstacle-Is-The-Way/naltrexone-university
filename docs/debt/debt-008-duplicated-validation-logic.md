# DEBT-008: Duplicated Validation Logic in DrizzleAttemptRepository

**Status:** Open
**Priority:** P2
**Date:** 2026-01-31

## Summary

The `DrizzleAttemptRepository` has the same null-check validation for `selectedChoiceId` repeated three times with nearly identical logic.

## Location

- **File:** `src/adapters/repositories/drizzle-attempt-repository.ts`
- **Lines:** 40-45 (insert), 66-71 (findByUserId), 96-101 (findBySessionId)

## Duplicated Code

```typescript
// Repeated 3 times:
if (!row.selectedChoiceId) {
  throw new ApplicationError(
    'INTERNAL_ERROR',
    'Attempt selectedChoiceId must not be null',
  );
}
```

## Impact

- DRY violation
- Changes require updates in three places
- Risk of inconsistent error messages

## Fix

Extract to private helper method:

```typescript
private validateSelectedChoiceId(row: any, attemptId?: string): string {
  if (!row.selectedChoiceId) {
    const idStr = attemptId ? ` ${attemptId}` : '';
    throw new ApplicationError(
      'INTERNAL_ERROR',
      `Attempt${idStr} selectedChoiceId must not be null`,
    );
  }
  return row.selectedChoiceId;
}
```

## Acceptance Criteria

- Single source of truth for null validation
- Consistent error messages
- All existing tests pass
