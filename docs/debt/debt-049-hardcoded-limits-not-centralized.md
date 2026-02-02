# DEBT-049: Hard-Coded Limits Not Centralized Across Controllers

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

Validation limits (e.g., max tags: 50, max difficulties: 3, max pagination: 100) are defined inline in some controllers but imported from constants in others. This creates maintenance risk when limits need to change.

**Inconsistent pattern:**

`practice-controller.ts` — uses constants (good):
```typescript
import {
  MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS,  // = 3
  MAX_PRACTICE_SESSION_TAG_FILTERS,         // = 50
} from '@/src/adapters/repositories/practice-session-limits';
```

`question-controller.ts` — hard-coded (bad):
```typescript
tagSlugs: z.array(z.string().min(1)).max(50).default([]),  // ← Hard-coded
difficulties: z.array(zDifficulty).max(3).default([]),      // ← Hard-coded
```

`review-controller.ts` — hard-coded (bad):
```typescript
limit: z.number().int().min(1).max(100),  // ← Hard-coded
```

## Impact

- Values duplicated (50, 3, 100 appear in multiple places)
- If limits change, developer must find all occurrences
- Easy to update one place but miss another
- No single source of truth for validation limits

## Resolution

1. Expand `practice-session-limits.ts` or create `validation-limits.ts`:
```typescript
// lib/validation-limits.ts
export const LIMITS = {
  MAX_TAG_FILTERS: 50,
  MAX_DIFFICULTY_FILTERS: 3,
  MAX_PAGINATION_LIMIT: 100,
  MAX_PRACTICE_SESSION_QUESTIONS: 200,
} as const;
```

2. Update all controllers to import and use these constants

3. Add comment explaining the rationale for each limit

## Verification

- [ ] All validation limits centralized
- [ ] No hard-coded numbers in Zod schemas
- [ ] Search for magic numbers confirms none remain
- [ ] Each limit has documented rationale

## Related

- `src/adapters/controllers/question-controller.ts:26-27`
- `src/adapters/controllers/review-controller.ts:18`
- `src/adapters/repositories/practice-session-limits.ts`
