# DEBT-043: Unused Schema Wildcard Import

**Status:** Open
**Priority:** P4
**Date:** 2026-02-01

---

## Description

The `DrizzleQuestionRepository` has a wildcard import of the schema namespace that's only partially used:

```typescript
// src/adapters/repositories/drizzle-question-repository.ts:2-3
import type * as schema from '@/db/schema';
import { questions, questionTags, tags } from '@/db/schema';
```

The `schema` namespace is only used for type references in the `toDomain()` method:
- `schema.Question`
- `schema.Choice`
- `schema.QuestionTag`
- `schema.Tag`

Meanwhile, the actual table references are imported separately.

## Impact

- **Namespace pollution:** Entire schema namespace is loaded for type-only usage
- **Unclear dependencies:** Not immediately obvious which schema types are actually used
- **Minor code smell:** Inconsistent import patterns across repositories

## Location

- `src/adapters/repositories/drizzle-question-repository.ts:2`

## Resolution

Replace the wildcard import with specific type imports:

```typescript
import type { Question, Choice, QuestionTag, Tag } from '@/db/schema';
import { questions, questionTags, tags } from '@/db/schema';
```

Or use inline types derived from the table types:

```typescript
import type { InferSelectModel } from 'drizzle-orm';

type QuestionRow = InferSelectModel<typeof questions>;
```

## Verification

- [ ] Replace wildcard import with specific imports
- [ ] TypeScript compiler accepts the change
- [ ] Existing tests pass

## Related

- Similar patterns may exist in other repositories - check and consolidate
- Drizzle ORM type inference patterns
