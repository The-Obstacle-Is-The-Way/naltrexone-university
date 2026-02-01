# DEBT-038: Misleading Type Assertion in Question Repository

**Status:** Open
**Priority:** P3
**Date:** 2026-02-01

---

## Description

The `listPublishedCandidateIds()` method in `DrizzleQuestionRepository` builds a dynamic `whereParts` array with a type assertion:

```typescript
// src/adapters/repositories/drizzle-question-repository.ts:75-77
const whereParts = [eq(questions.status, 'published')] as Array<
  ReturnType<typeof eq>
>;
```

The array is typed as `Array<ReturnType<typeof eq>>`, but line 80 pushes an `inArray` operator:

```typescript
whereParts.push(inArray(questions.difficulty, [...filters.difficulties]));
```

This makes the type assertion misleading since the array can contain both `eq` and `inArray` operators.

## Impact

- **Misleading type:** Future maintainers might incorrectly assume only `eq` operators are used
- **Type safety gap:** The assertion masks the actual contents of the array
- **Minor confusion:** Discrepancy between declared and actual types

## Location

- `src/adapters/repositories/drizzle-question-repository.ts:75-77`

## Resolution

Use a more accurate type from drizzle-orm, such as:

```typescript
import type { SQL } from 'drizzle-orm';

const whereParts: SQL[] = [eq(questions.status, 'published')];
```

Or extract a type alias with a clear comment about allowed operators.

## Verification

- [ ] Update type annotation to accurately reflect contents
- [ ] TypeScript compiler accepts the change
- [ ] Existing tests pass

## Related

- Drizzle ORM type system documentation
