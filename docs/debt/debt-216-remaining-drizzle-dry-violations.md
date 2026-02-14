# DEBT-216: Remaining Drizzle Repository Violations

**Status:** Open
**Priority:** P3
**Date:** 2026-02-14
**Prerequisite:** ~~DEBT-214~~ (resolved 2026-02-14)

---

## Description

After the primary Drizzle query duplication (DEBT-214) is resolved, six violations remain across the repository layer — DRY issues, a god method, a race condition, and an inconsistency. Two of these (items #5 and #6) are not cosmetic: one is a 142-line method that should be ~15 lines, and the other is a race condition that the codebase itself already solved correctly in a different repo.

## Inventory

### 1. Two-Way Tag Branch in Question Repository

**File:** `src/adapters/repositories/drizzle-question-repository.ts:123-142`

```typescript
if (!hasTagFilter) {
  const rows = await this.db
    .select({ id: questions.id })
    .from(questions)
    .where(and(...whereParts))
    .orderBy(...baseOrderBy);
  return rows.map((r) => r.id);
}

const rows = await this.db
  .select({ id: questions.id, createdAt: questions.createdAt })
  .from(questions)
  .innerJoin(questionTags, eq(questionTags.questionId, questions.id))
  .innerJoin(tags, eq(tags.id, questionTags.tagId))
  .where(and(...whereParts, inArray(tags.slug, [...filters.tagSlugs])))
  .groupBy(questions.id, questions.createdAt)
  .orderBy(desc(questions.createdAt), asc(questions.id));
return rows.map((r) => r.id);
```

Same pattern as DEBT-214: conditional JOIN via code duplication instead of dynamic query building. The two branches share `.from(questions)`, `.where(...)`, `.orderBy(...)`, and the `.map()` call.

**Fix:** Use `$dynamic()` (same approach as DEBT-214). Build the base query, conditionally add tag JOINs + GROUP BY when `hasTagFilter` is true.

**Note:** The tag branch uses `INNER JOIN` (not LEFT JOIN) and adds `GROUP BY` — this is correct because `inArray(tags.slug, ...)` with multiple slugs can match multiple tags per question, and GROUP BY deduplicates. The fix must preserve this `INNER JOIN` + `GROUP BY` semantics.

### 2. Duplicate `row_number()` Window Function SQL

**Files:**
- `src/adapters/repositories/drizzle-attempt-repository.ts:48`
- `src/adapters/repositories/drizzle-question-repository.ts:151`

Both repositories have a `private latestAttemptRowsSubquery(userId)` method that constructs an identical window function:

```typescript
sql<number>`row_number() over (partition by ${attempts.questionId} order by ${attempts.answeredAt} desc, ${attempts.id} desc)`.as('attempt_rank')
```

The attempt repository's version selects `questionId, answeredAt, practiceSessionId, isCorrect, attemptRank`. The question repository's version selects `questionId, isCorrect, attemptRank` (fewer columns).

**Risk:** If the window function ordering logic changes (e.g., tie-breaking rule), it must be updated in both places. If one drifts, the "latest attempt" semantics silently diverge between the History tab and the question status filter.

**Fix:** Extract a shared helper into `src/adapters/repositories/shared/` or `src/adapters/shared/` that builds the window function SQL fragment. Each repository calls the shared helper but can still select different columns from the subquery.

**Alternative:** Accept as-is. The fragment is 1 line, both are tested via integration tests, and extracting a shared SQL fragment helper may be over-engineering. Document the coupling with a comment in each file pointing to the other.

### 3. Repeated Completed-Session WHERE Predicate

**File:** `src/adapters/repositories/drizzle-practice-session-repository.ts:93-97` and `110-113`

```typescript
// Line 93-97 (count query):
and(
  eq(practiceSessions.userId, userId),
  isNotNull(practiceSessions.endedAt),
)

// Line 110-113 (list query):
and(
  eq(practiceSessions.userId, userId),
  isNotNull(practiceSessions.endedAt),
)
```

The same WHERE predicate is constructed twice in `findCompletedByUserId` — once for the count query (line 89-97) and once for the list query (line 109-113, via Drizzle relational `.findMany()`).

**Fix:** Extract into a local helper:

```typescript
private completedSessionCondition(userId: string) {
  return and(
    eq(practiceSessions.userId, userId),
    isNotNull(practiceSessions.endedAt),
  );
}
```

Then call `this.completedSessionCondition(userId)` in both the count and list paths.

**Note:** The count uses `.select().from().where()` while the list uses `.query.findMany({ where: ... })` — verify both accept the same condition format.

### 4. Inconsistent Pagination Validation Across Repositories

**Files:**
- `src/adapters/repositories/drizzle-practice-session-repository.ts:100-103` — validates with `Number.isFinite()` + `Math.floor()` + `Math.max(0, ...)`
- `src/adapters/repositories/drizzle-attempt-repository.ts:155-159` — same pattern (correct)
- `src/adapters/repositories/drizzle-stripe-event-repository.ts:84` — validates limit only with `Number.isInteger()`, no offset validation
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts:164-165` — validates limit only with `Number.isInteger()`, no offset validation

Some repos do full validation (`Number.isFinite` + `Math.floor` + `Math.max(0, ...)`). Others only check `Number.isInteger()` on limit and skip offset entirely. The inconsistency means different repos have different robustness against malformed pagination input.

**Fix:** Standardize to the most defensive pattern everywhere:

```typescript
const safeLimit = Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : 0);
const safeOffset = Math.max(0, Number.isFinite(offset) ? Math.floor(offset) : 0);
```

Or extract a shared `safePagination(limit, offset)` helper in `src/adapters/shared/`.

**Note:** The stripe-event and idempotency-key repos use `limit` for pruning, not user-facing pagination. They don't take offset at all. The fix for those two is just standardizing the limit validation to match the others (`Number.isFinite` instead of `Number.isInteger`).

### 5. Bookmark `add()` — Race Condition and Unnecessary Second Query

**File:** `src/adapters/repositories/drizzle-bookmark-repository.ts:20-54`

```typescript
// Current: INSERT → if conflict → SELECT → if missing → throw
const [inserted] = await this.db
  .insert(bookmarks)
  .values({ userId, questionId })
  .onConflictDoNothing({ target: [bookmarks.userId, bookmarks.questionId] })
  .returning();

if (inserted) { return ...; }

// Second query — race window: row could be deleted between INSERT and SELECT
const existing = await this.db.query.bookmarks.findFirst({
  where: and(eq(bookmarks.userId, userId), eq(bookmarks.questionId, questionId)),
});
if (!existing) throw new ApplicationError('INTERNAL_ERROR', ...);
```

**The codebase already has the correct pattern.** The Stripe customer repo (`drizzle-stripe-customer-repository.ts:36-43`) uses `onConflictDoUpdate` with a no-op SET to always get a RETURNING row in one query:

```typescript
// Correct pattern (already in the codebase):
.onConflictDoUpdate({
  target: stripeCustomers.userId,
  set: { stripeCustomerId: sql`${stripeCustomers.stripeCustomerId}` }, // no-op
})
.returning();
```

**Fix:** Replace `onConflictDoNothing()` + fallback SELECT with `onConflictDoUpdate()` + no-op SET + RETURNING:

```typescript
async add(userId: string, questionId: string) {
  const [row] = await this.db
    .insert(bookmarks)
    .values({ userId, questionId })
    .onConflictDoUpdate({
      target: [bookmarks.userId, bookmarks.questionId],
      set: { userId: sql`${bookmarks.userId}` }, // no-op to get RETURNING
    })
    .returning();

  if (!row) {
    throw new ApplicationError('INTERNAL_ERROR', 'Failed to insert bookmark');
  }

  return { userId: row.userId, questionId: row.questionId, createdAt: row.createdAt };
}
```

One query. No race. No second SELECT. ~10 lines instead of 34.

### 6. User `upsertByClerkId()` — God Method (142 Lines, Duplicated Recovery Logic)

**File:** `src/adapters/repositories/drizzle-user-repository.ts:85-226`

142 lines. 6+ code paths. The UPDATE-with-clock-guard-then-fetch-and-check recovery pattern is duplicated across lines 109-145 and 192-225 (~35 lines of copy-paste).

The method's complexity comes from doing multiple round-trips to handle race conditions that Postgres can handle atomically in a single statement.

**What Uncle Bob, Ousterhout, and Kent Beck would say:**

- **Uncle Bob (Clean Code):** Functions should be short, ideally under 20 lines. This is 142.
- **John Ousterhout (A Philosophy of Software Design):** Push complexity into the database. The SQL layer handles concurrency — don't re-implement it in application code.
- **Kent Beck (Simple Design):** Remove duplication. The clock-guard-then-fetch pattern appears twice.

**Fix:** Replace with a single atomic `INSERT ... ON CONFLICT DO UPDATE` with a clock guard in the SET clause:

```typescript
async upsertByClerkId(
  clerkId: string,
  email: string,
  options?: UpsertUserByClerkIdOptions,
): Promise<User> {
  const observedAt = options?.observedAt ?? this.now();

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
          email: sql`CASE WHEN ${users.updatedAt} < ${observedAt} THEN ${email} ELSE ${users.email} END`,
          updatedAt: sql`GREATEST(${users.updatedAt}, ${observedAt})`,
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

~20 lines. One query. No races. Atomic clock-guard. The CASE expression only updates email when the incoming event is newer than what's stored. `GREATEST` always bumps `updatedAt` to the latest seen timestamp. The `bumpUpdatedAtIfStale` private method (lines 45-75) also becomes unnecessary.

**Caution:** Verify that the existing integration tests and the `bumpUpdatedAtIfStale` tests cover the same semantics (stale event ignored, newer event wins, email updated only when newer). The refactored version should pass all existing tests with zero assertion changes.

## Impact

- **Race condition (item #5):** Theoretical data loss — bookmark could disappear between INSERT and SELECT. Extremely unlikely in practice but trivially fixable since the correct pattern already exists in the codebase.
- **God method (item #6):** 142 lines with duplicated recovery logic. Highest maintenance burden in the entire repository layer. Any change to clock-guard semantics requires updating two places.
- **Drift risk (item #2):** The window function defines "latest attempt" semantics. If the two copies diverge, History and question status filters silently disagree on which attempt is "latest."
- **Maintenance burden (items #1, #3):** Minor but real — anyone changing the query logic must remember to update both copies.
- **Inconsistency (item #4):** Different repos have different robustness against malformed pagination input. Not a bug today (controllers validate upstream), but violates the principle that each layer should defend its own boundaries.

## Verification

1. `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration`
2. All existing tests pass with zero assertion changes — the refactors are purely structural
3. Grep for duplicated/eliminated patterns:
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
