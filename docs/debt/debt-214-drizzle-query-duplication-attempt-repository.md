# DEBT-214: Drizzle Query Duplication in Attempt Repository (Conditional JOINs via Copy-Paste)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-14

---

## Description

The `DrizzleAttemptRepository` had ~80 lines of duplicated query construction in two methods: `listAttemptedQuestionsByUserId` and `countAttemptedQuestionsByUserId`. Both methods used a 3-way ternary that repeated nearly identical query construction, differing only in which JOINs were applied based on the current filter state.

This was introduced in the DEBT-206 fix (commit `f76dd0d`) to add server-side difficulty/tag filtering. The duplication exists because Drizzle's TypeScript type system returns a different type for each `.leftJoin()` call, making it impossible to chain JOINs conditionally with simple `if` statements.

**Key insight:** there are only **two structurally different query shapes**, not three.

1. Joining `questions` is **1:1** (`latest_attempt_rows.question_id → questions.id`). It does **not** change row cardinality and is always safe.
2. Joining `question_tags`/`tags` is **1:N** (a question can have many tags). It is only safe **without deduplication** when the query includes a tag filter like `WHERE tags.slug = :tagSlug`, which guarantees at most one matching tag row per question (enforced by `tags.slug` uniqueness + `question_tags` composite PK).

### What It Looked Like (Before)

```typescript
// 3-way ternary repeated in BOTH list and count methods:
const rows = tagSlug
  ? await this.db.select({...}).from(sub).leftJoin(A).leftJoin(B).leftJoin(C).leftJoin(D).where(...)
  : difficulty
    ? await this.db.select({...}).from(sub).leftJoin(A).leftJoin(B).where(...)
    : await this.db.select({...}).from(sub).leftJoin(A).where(...);
```

The `.select()`, `.from()`, `.leftJoin(practiceSessions, ...)`, `.where(and(...conditions))`, `.orderBy()`, `.limit()`, `.offset()` are identical across all three branches. Only the additional JOINs (questions, questionTags, tags) differ.

### Pre-Resolution Locations

| Method | File | Notes |
|--------|------|-------|
| `listAttemptedQuestionsByUserId` | `src/adapters/repositories/drizzle-attempt-repository.ts` | Previously had 3 branches with copy-pasted query blocks |
| `countAttemptedQuestionsByUserId` | `src/adapters/repositories/drizzle-attempt-repository.ts` | Previously had 3 branches with copy-pasted query blocks |

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

### Option A: Two-Tier Query Shape (Recommended)

Collapse the 3-way branch into a 2-way branch by making the **1:1** join(s) unconditional and branching only on the **cardinality-changing** tag join.

```typescript
// base query (always safe; does not change cardinality)
const base = db
  .select({ /* ... */ })
  .from(latestAttemptRows)
  .leftJoin(practiceSessions, /* ... */)
  .leftJoin(questions, eq(latestAttemptRows.questionId, questions.id))
  .$dynamic();

// only add the 1:N join when tagSlug is present
if (tagSlug) {
  base
    .leftJoin(questionTags, eq(questions.id, questionTags.questionId))
    .leftJoin(tags, eq(questionTags.tagId, tags.id));
}

return base
  .where(and(...conditions))
  .orderBy(/* ... */)
  .limit(limit)
  .offset(offset);
```

Why this is correct:

- `questions` join is 1:1 and can be always included (Kleppmann: “free join” at this scale).
- `question_tags`/`tags` join is 1:N and must **not** be included unless either:
  - You are filtering by a specific tag (`tags.slug = :tagSlug`) so each question matches at most one row, or
  - You add explicit deduplication (`DISTINCT`, `GROUP BY`, or `DISTINCT ON`) and verify pagination correctness.

Why this helps: it removes the “difficulty-only” branch entirely (that branch exists only to add the 1:1 `questions` join).

### Option B: Drizzle `$dynamic()` API (Verified Available)

Drizzle offers a `$dynamic()` method that allows building queries incrementally. This preserves type safety while avoiding duplication:

```typescript
const base = db.select({...}).from(sub).leftJoin(practiceSessions, ...).$dynamic();
if (difficulty || tagSlug) base.leftJoin(questions, ...);
if (tagSlug) base.leftJoin(questionTags, ...).leftJoin(tags, ...);
return base.where(and(...conditions)).orderBy(...).limit(limit).offset(offset);
```

**Verified (2026-02-14):** This repo uses `drizzle-orm@^0.45.1` (`package.json`), and `$dynamic()` exists on Postgres select builders (and other builders) in that version (e.g. `node_modules/drizzle-orm/pg-core/query-builders/select.d.ts` declares `$dynamic(): PgSelectDynamic<this>`). This is a real, available API and is viable for eliminating the 3-way ternary duplication.

Why it helps: `$dynamic()` flips the query builder into “dynamic” mode, so subsequent `.leftJoin()` calls no longer change the *static* type in a way that prevents conditional reassignment/chaining.

### Option C: Raw SQL Builder (Alternative)

Use Drizzle's `sql` template tag to build the query as raw SQL with conditional JOIN clauses. This is a good escape hatch if Drizzle typing still blocks a clean refactor, but it’s more “manual SQL” than Option A.

```typescript
private buildAttemptedQuestionsQuery(/* ... */) {
  // Build JOINs conditionally as SQL fragments
  // Build SELECT as either columns or count(distinct ...)
  // Single source of truth for the query structure
}
```

## Verification

1. Refactored methods produce identical SQL for all filter combinations (unit test with query logging)
2. All existing integration tests pass unchanged (`pnpm test:integration`)
3. `pnpm typecheck && pnpm lint && pnpm test --run`

## Audit Notes (2026-02-14)

This debt doc is scoped to the Attempt Repository duplication, but an audit was performed across **all** `src/adapters/repositories/*.ts` and all production (non-test) Drizzle query construction outside repositories:

- **Only one conditional-`leftJoin` copy-paste hotspot exists:** `DrizzleAttemptRepository` (primary) and `DrizzleQuestionRepository.listPublishedCandidateIds` (minor, already listed above). No other production `.leftJoin()` usage exists.
- **Non-repo Drizzle usage (no similar duplication found):**
  - `src/adapters/gateways/drizzle-rate-limiter.ts`
  - `app/api/health/handler.ts`
  - `scripts/seed.ts` (script-only)

### Other (Low Severity) DRY Candidates Found

| Instance | File | Lines | Notes |
|----------|------|-------|-------|
| Duplicate window-function SQL | `src/adapters/repositories/drizzle-attempt-repository.ts` | 48 | `row_number() over (partition by attempts.questionId ...)` |
| Duplicate window-function SQL | `src/adapters/repositories/drizzle-question-repository.ts` | 151 | Same SQL fragment as above (risk: drift if one changes) |
| Repeated completed-session WHERE | `src/adapters/repositories/drizzle-practice-session-repository.ts` | 93–97 and 110–113 | Same predicate appears in both count and list query paths |

## Related

- DEBT-206 (commit `f76dd0d`) — introduced the duplication
- `src/adapters/repositories/drizzle-attempt-repository.ts` — primary file
- `src/adapters/repositories/drizzle-question-repository.ts` — minor secondary instance
- Drizzle ORM `$dynamic()` API docs

## Resolution Notes

Refactored `DrizzleAttemptRepository` attempted-questions list/count queries to share a base query and conditionally add tag JOINs, eliminating copy-pasted Drizzle query construction.
