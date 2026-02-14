# DEBT-214: Drizzle Query Duplication in Attempt Repository (Conditional JOINs via Copy-Paste)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-14

---

## Description

The `DrizzleAttemptRepository` has ~80 lines of duplicated query construction in two methods: `listAttemptedQuestionsByUserId` and `countAttemptedQuestionsByUserId`. Both methods use a 3-way ternary that repeats nearly identical query construction, differing only in which JOINs are applied based on the current filter state.

This was introduced in the DEBT-206 fix (commit `f76dd0d`) to add server-side difficulty/tag filtering. The duplication exists because Drizzle's TypeScript type system returns a different type for each `.leftJoin()` call, making it impossible to chain JOINs conditionally with simple `if` statements.

### What It Looks Like

```typescript
// 3-way ternary repeated in BOTH list and count methods:
const rows = tagSlug
  ? await this.db.select({...}).from(sub).leftJoin(A).leftJoin(B).leftJoin(C).leftJoin(D).where(...)
  : difficulty
    ? await this.db.select({...}).from(sub).leftJoin(A).leftJoin(B).where(...)
    : await this.db.select({...}).from(sub).leftJoin(A).where(...);
```

The `.select()`, `.from()`, `.leftJoin(practiceSessions, ...)`, `.where(and(...conditions))`, `.orderBy()`, `.limit()`, `.offset()` are identical across all three branches. Only the additional JOINs (questions, questionTags, tags) differ.

### Locations

| Method | File | Lines | Branches |
|--------|------|-------|----------|
| `listAttemptedQuestionsByUserId` | `src/adapters/repositories/drizzle-attempt-repository.ts` | 331–396 | 3 branches, 6 shared clauses each |
| `countAttemptedQuestionsByUserId` | `src/adapters/repositories/drizzle-attempt-repository.ts` | 425–460 | 3 branches, 4 shared clauses each |

### Secondary Instance (Minor)

| Method | File | Lines | Notes |
|--------|------|-------|-------|
| `listPublishedCandidateIds` | `src/adapters/repositories/drizzle-question-repository.ts` | 123–142 | 2-way branch for tag filter; ~15 lines of duplication. Lower severity. |

## Impact

- **Maintenance hazard**: Changing the SELECT fields requires updating 6 places (3 branches × 2 methods). Missing one causes a silent runtime bug.
- **Growing risk**: Every new filter that needs a JOIN will add another branch to each method, compounding the duplication exponentially.
- **Code review burden**: Reviewers must verify 6 nearly-identical query blocks are truly identical.

## Root Cause

Drizzle ORM's query builder returns a new TypeScript type after each `.leftJoin()` call. This makes conditional JOIN chaining impossible with simple `if` statements:

```typescript
// This does NOT compile — the type changes after each leftJoin:
let query = db.select({...}).from(sub).leftJoin(A);
if (difficulty) query = query.leftJoin(B);  // TYPE ERROR: different types
```

## Resolution

### Option A: Raw SQL Builder (Recommended)

Use Drizzle's `sql` template tag to build the query as raw SQL with conditional JOIN clauses. This is the approach Kleppmann or any data-intensive application would use — the SQL is the source of truth, not the ORM's type wrapper.

```typescript
private buildAttemptedQuestionsQuery(
  userId: string,
  filters: AttemptedQuestionsFilters,
  mode: 'list' | 'count',
  pagination?: { limit: number; offset: number },
) {
  // Build JOINs conditionally as SQL fragments
  // Build SELECT as either columns or count(distinct ...)
  // Single source of truth for the query structure
}
```

### Option B: Drizzle `$dynamic()` API

Drizzle offers a `$dynamic()` method that allows building queries incrementally. This preserves type safety while avoiding duplication:

```typescript
const base = db.select({...}).from(sub).leftJoin(practiceSessions, ...).$dynamic();
if (difficulty || tagSlug) base.leftJoin(questions, ...);
if (tagSlug) base.leftJoin(questionTags, ...).leftJoin(tags, ...);
return base.where(and(...conditions)).orderBy(...).limit(limit).offset(offset);
```

Research whether `$dynamic()` is stable and well-supported in the current Drizzle version before adopting.

### Option C: Extract Shared Query Fragment

Factor the common structure into a helper that returns the base query with all possible JOINs applied unconditionally. The extra JOINs on unfiltered queries add negligible overhead (LEFT JOINs with no WHERE conditions on the joined tables are cheap).

```typescript
// Always JOIN everything — the WHERE conditions handle filtering
const base = db.select({...}).from(sub)
  .leftJoin(practiceSessions, ...)
  .leftJoin(questions, ...)
  .leftJoin(questionTags, ...)
  .leftJoin(tags, ...);
```

This is the simplest fix. The performance cost of unnecessary LEFT JOINs is negligible at current scale. Profile before optimizing.

## Verification

1. Refactored methods produce identical SQL for all filter combinations (unit test with query logging)
2. All existing integration tests pass unchanged (`pnpm test:integration`)
3. `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- DEBT-206 (commit `f76dd0d`) — introduced the duplication
- `src/adapters/repositories/drizzle-attempt-repository.ts` — primary file
- `src/adapters/repositories/drizzle-question-repository.ts` — minor secondary instance
- Drizzle ORM `$dynamic()` API docs
