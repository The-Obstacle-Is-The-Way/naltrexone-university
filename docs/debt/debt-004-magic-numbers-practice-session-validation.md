# DEBT-004: Magic Numbers in Practice Session Validation

**Status:** Open
**Priority:** P3
**Date:** 2026-01-31

## Summary

The `DrizzlePracticeSessionRepository` has hardcoded validation limits with no documentation explaining why these values were chosen.

## Location

- **File:** `src/adapters/repositories/drizzle-practice-session-repository.ts` lines 13-20

## Current Code

```typescript
const paramsSchema = z.object({
  count: z.number().int().min(1).max(200),        // Why 200?
  questionIds: z.array(z.string().uuid()).max(200), // Why 200?
  tagSlugs: z.array(z.string().min(1)).max(50),   // Why 50?
  difficulties: z.array(questionDifficultySchema).max(3), // Why 3?
}).strict();
```

## Issues

1. No explanation of limit rationale
2. Magic numbers scattered in validation logic
3. Limits not documented in SPEC-007 or master spec
4. If limits change, multiple files may need updates

## Recommended Fix

1. Extract to constants with documentation:

```typescript
// lib/constants/practice-session.ts
/** Max questions per session - prevents memory issues on large sessions */
export const MAX_QUESTIONS_PER_SESSION = 200;

/** Max tag filters - UI only shows ~50 tags anyway */
export const MAX_TAG_FILTERS = 50;

/** Max difficulty filters - only 3 difficulty levels exist */
export const MAX_DIFFICULTY_FILTERS = 3;
```

2. Document in master spec Section 4.5 (Practice Sessions)
3. Reference constants in repository validation

## Acceptance Criteria

- Magic numbers extracted to named constants
- Comments explain the reasoning
- Master spec documents the limits
- Repository uses shared constants
