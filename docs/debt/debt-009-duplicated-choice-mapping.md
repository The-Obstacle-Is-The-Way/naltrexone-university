# DEBT-009: Duplicated Choice Mapping Logic in GetNextQuestionUseCase

**Status:** Open
**Priority:** P2
**Date:** 2026-01-31

## Summary

The `GetNextQuestionUseCase` has identical choice mapping transformation logic repeated twice - once for session-based execution and once for filter-based execution.

## Location

- **File:** `src/application/use-cases/get-next-question.ts`
- **Lines:** 92-99 (executeForSession) and 166-173 (executeForFilters)

## Duplicated Code

```typescript
// Appears twice:
choices: [...question.choices]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((c) => ({
    id: c.id,
    label: c.label,
    textMd: c.textMd,
    sortOrder: c.sortOrder,
  })),
```

## Impact

- DRY violation
- If choice output format changes, two places need updates
- Potential for inconsistency if one is updated but not the other

## Fix

Extract to private helper method:

```typescript
private mapChoicesForOutput(question: Question): PublicChoice[] {
  return [...question.choices]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      id: c.id,
      label: c.label,
      textMd: c.textMd,
      sortOrder: c.sortOrder,
    }));
}
```

## Acceptance Criteria

- Single method for choice mapping
- Both execution paths use the same helper
- Output format unchanged
