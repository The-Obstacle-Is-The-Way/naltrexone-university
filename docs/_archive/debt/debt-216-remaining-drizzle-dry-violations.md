# DEBT-216: Remaining Drizzle Repository Violations

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-14
**Resolved:** 2026-02-14
**Prerequisite:** ~~DEBT-214~~ (resolved 2026-02-14)

---

## Description

After the primary Drizzle query duplication (DEBT-214) was resolved, six follow-up issues remained across the repository layer — DRY issues, a god method, a race condition, and an inconsistency. This document is now resolved; the inventory below reflects the post-fix code.

## Inventory

### 1. Two-Way Tag Branch in Question Repository

**File:** `src/adapters/repositories/drizzle-question-repository.ts:121-141`

```typescript
const baseOrderBy = [desc(questions.createdAt), asc(questions.id)] as const;

const baseQuery = this.db
  .select({ id: questions.id, createdAt: questions.createdAt })
  .from(questions);

const where = hasTagFilter
  ? and(...whereParts, inArray(tags.slug, [...filters.tagSlugs]))
  : and(...whereParts);

const query = hasTagFilter
  ? baseQuery
      .innerJoin(questionTags, eq(questionTags.questionId, questions.id))
      .innerJoin(tags, eq(tags.id, questionTags.tagId))
      .where(where)
      .groupBy(questions.id, questions.createdAt)
  : baseQuery.where(where);

const rows = await query.orderBy(...baseOrderBy);

return rows.map((r) => r.id);
```

Resolved by extracting a shared base query and branching only for the tag `INNER JOIN` + `GROUP BY` query shape.

### 2. Duplicate `row_number()` Window Function SQL

**Files:**
- `src/adapters/repositories/shared/latest-attempt-rank-sql.ts:1-10`
- `src/adapters/repositories/drizzle-attempt-repository.ts:41-56`
- `src/adapters/repositories/drizzle-question-repository.ts:144-158`

```typescript
export function latestAttemptRankSql(columns: {
  questionId: AnyColumn;
  answeredAt: AnyColumn;
  id: AnyColumn;
}) {
  return sql<number>`row_number() over (partition by ${columns.questionId} order by ${columns.answeredAt} desc, ${columns.id} desc)`;
}
```

Resolved by extracting the shared window-function SQL into `latestAttemptRankSql(...)` and using it from both repositories’ `latestAttemptRowsSubquery` methods.

### 3. Repeated Completed-Session WHERE Predicate

**File:** `src/adapters/repositories/drizzle-practice-session-repository.ts:51-117`

```typescript
private completedSessionCondition(userId: string) {
  return and(
    eq(practiceSessions.userId, userId),
    isNotNull(practiceSessions.endedAt),
  );
}
```

Resolved by extracting the completed-session predicate into a private helper and reusing it in both the count query and the `.query.findMany({ where })` call in `findCompletedByUserId`.

### 4. Inconsistent Pagination Validation Across Repositories

**Files:**
- `src/adapters/repositories/drizzle-attempt-repository.ts:153-164` — pagination-like `limit/offset` now uses strict-integer validation
- `src/adapters/repositories/drizzle-practice-session-repository.ts:95-107` — pagination-like `limit/offset` now uses strict-integer validation
- `src/adapters/repositories/drizzle-stripe-event-repository.ts:83-86` — pruning `limit` is strict-integer (unchanged; enforced by unit tests)
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts:163-166` — pruning `limit` is strict-integer (unchanged; enforced by unit tests)

Resolved by standardizing “pagination-like” repository inputs to the same strict-integer policy already used by pruning methods.

```typescript
const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
const safeOffset = Number.isInteger(offset) ? Math.max(0, offset) : 0;
```

### 5. Bookmark `add()` — Race Condition and Unnecessary Second Query

**File:** `src/adapters/repositories/drizzle-bookmark-repository.ts:20-39`

```typescript
async add(userId: string, questionId: string) {
  const [row] = await this.db
    .insert(bookmarks)
    .values({ userId, questionId })
    .onConflictDoUpdate({
      target: [bookmarks.userId, bookmarks.questionId],
      set: { createdAt: sql`${bookmarks.createdAt}` },
    })
    .returning();

  if (!row) {
    throw new ApplicationError('INTERNAL_ERROR', 'Failed to insert bookmark');
  }

  return {
    userId: row.userId,
    questionId: row.questionId,
    createdAt: row.createdAt,
  };
}
```

Resolved by replacing `onConflictDoNothing()` + fallback `SELECT` with a single `onConflictDoUpdate()` + `returning()` statement (no race window, no second query).

### 6. User `upsertByClerkId()` — God Method (Resolved)

**File:** `src/adapters/repositories/drizzle-user-repository.ts:53-90`

**Integration coverage:** `tests/integration/repositories.integration.test.ts:1809-1853`

```typescript
async upsertByClerkId(
  clerkId: string,
  email: string,
  options?: UpsertUserByClerkIdOptions,
): Promise<User> {
  const observedAt = options?.observedAt ?? this.now();
  const observedAtParam = sql.param(observedAt, users.updatedAt);

  try {
    const [row] = await this.db
      .insert(users)
      .values({
        clerkUserId: clerkId,
        email,
        createdAt: observedAt,
        updatedAt: observedAt,
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          email: sql`CASE WHEN ${users.updatedAt} < ${observedAtParam} THEN ${email} ELSE ${users.email} END`,
          updatedAt: sql`GREATEST(${users.updatedAt}, ${observedAtParam})`,
        },
      })
      .returning();

    if (!row) {
      throw new ApplicationError('INTERNAL_ERROR', 'Failed to ensure user row');
    }

    return this.toDomain(row);
  } catch (error) {
    throw this.mapDbError(error);
  }
}
```

Resolved by replacing the previous multi-roundtrip implementation with a single atomic `INSERT ... ON CONFLICT DO UPDATE` using a clock guard (CASE + GREATEST).

**Important:** The `postgres` driver requires `Date` parameters inside Drizzle `sql\`...\`` fragments to be encoded via `sql.param(value, encoder)`. This is why the implementation uses `sql.param(observedAt, users.updatedAt)` instead of interpolating `${observedAt}` directly.

## Impact

- **Item #5:** Removed the INSERT→SELECT race window by using a single `onConflictDoUpdate(...).returning()` statement.
- **Item #6:** Replaced a 142-line, multi-roundtrip upsert with one atomic upsert (CASE + GREATEST) and added integration regression coverage for clock-guard semantics.
- **Item #2:** Eliminated drift risk by extracting the latest-attempt window-function SQL into a shared helper.
- **Items #1 and #3:** Removed small DRY hotspots by extracting a shared base query and a shared predicate helper.
- **Item #4:** Standardized repository `limit/offset` validation to strict integers for pagination-like methods.

## Audit Notes (2026-02-14)

Repository-wide greps were used to sanity-check completeness:

- `onConflictDoNothing` appears in:
  - `DrizzleStripeEventRepository.claim` (intentional: claim-only, no returning row needed)
  - `DrizzleIdempotencyKeyRepository.claim` (intentional: claim-or-refresh-if-expired flow; no INSERT→SELECT race)
- No other `row_number() over (...)` fragments exist outside item #2.
- No other INSERT→SELECT fallback patterns were found in `src/adapters/repositories/drizzle-*.ts`.

## Verification

1. `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build`
2. Grep for eliminated patterns:
   - `rg "row_number.*partition by.*questionId" src/adapters/repositories/` — should appear once (shared helper) or twice (if accepted as-is with comments)
   - `rg "isNotNull.*endedAt" src/adapters/repositories/drizzle-practice-session-repository.ts` — should appear once (extracted helper)
   - `rg "onConflictDoNothing" src/adapters/repositories/drizzle-bookmark-repository.ts` — should be zero (replaced with `onConflictDoUpdate`)
   - `rg "bumpUpdatedAtIfStale" src/adapters/repositories/drizzle-user-repository.ts` — should be zero (method removed)

## Related

- DEBT-214 — Primary Drizzle duplication fix (prerequisite)
- `src/adapters/repositories/drizzle-question-repository.ts`
- `src/adapters/repositories/drizzle-attempt-repository.ts`
- `src/adapters/repositories/drizzle-practice-session-repository.ts`
- `src/adapters/repositories/drizzle-bookmark-repository.ts`
- `src/adapters/repositories/drizzle-user-repository.ts`
