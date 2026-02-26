# BUG-162: Review Controller Pagination Offset Missing Upper Bound Validation

**Status:** Open
**Priority:** P4
**Date:** 2026-02-25

---

## Description

`GetAttemptedQuestionsInputSchema` in `review-controller.ts` validates `offset` with `.min(0)` but has no `.max()` upper bound. This diverges from `GetSessionHistoryInputSchema` in `practice-schemas.ts`, which correctly bounds `offset` with `.max(MAX_PAGINATION_OFFSET)` (10,000).

A client can submit arbitrarily large offsets (for example `999_999_999`), forcing expensive DB work before returning an empty page.

## Root Cause

`src/adapters/controllers/review-controller.ts:18`:

```typescript
const GetAttemptedQuestionsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),  // ✓ bounded
    offset: z.number().int().min(0),                            // ✗ unbounded
    // ...
  })
  .strict();
```

Compare with `src/adapters/controllers/practice-schemas.ts:69–71`:

```typescript
const GetSessionHistoryInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
    offset: z.number().int().min(0).max(MAX_PAGINATION_OFFSET),  // ✓ bounded
    // ...
  })
  .strict();
```

The shared constant `MAX_PAGINATION_OFFSET` (10,000) from `src/adapters/shared/validation-limits.ts` exists but is not imported or used by the review controller.

## Full SQL Path (Tracer-Bullet Verified)

The unbounded offset flows through the entire stack without any clamping:

1. **Controller** (`review-controller.ts:18`): Zod accepts `offset: 999_999_999` (passes `.min(0)` and `.int()`)
2. **Use case** (`get-attempted-questions.ts:17`): `offset: number` — no domain bounds, passes through verbatim
3. **Repository port** (`src/application/ports/attempt-repository.ts:92–102`): `offset: number` — no constraints (correctly delegated to adapter boundary validation)
4. **Repository impl** (`drizzle-attempt-repository.ts:369–423`): `.offset(offset)` hits Postgres directly

The query uses a `ROW_NUMBER()` window function (`latest-attempt-rank-sql.ts:9`) in the `latest_attempt_rows` subquery. Large offsets therefore tend to become increasingly expensive because many ranked rows must be scanned/skipped before page rows are returned.

**Note:** The same repository file's `findByUserId` method (line 203–223) has defensive clamping (`Math.max(0, page.offset)`), but `listAttemptedQuestionsByUserId` has no equivalent protection.

## Scope

**Isolated bug.** Only 2 controllers in the entire codebase accept an `offset` parameter:
- `practice-schemas.ts` (`GetSessionHistoryInputSchema`) — correctly bounded with `.max(MAX_PAGINATION_OFFSET)`
- `review-controller.ts` (`GetAttemptedQuestionsInputSchema`) — **MISSING** upper bound

No other controllers are affected.

## Impact

- **Performance:** Postgres `OFFSET` is O(n) — large offsets with `ROW_NUMBER()` windowing cause expensive queries
- **Abuse potential:** A malicious or buggy client could degrade DB performance with extreme offsets
- **Mitigated by:** Authentication (must be entitled user) and rate limiting on server actions

## Existing Test Gap

`src/adapters/controllers/review-controller.test.ts:70–83` tests `offset: -1` (below min) but has no test for offset exceeding an upper bound. Compare with `src/adapters/controllers/practice-controller.test.ts:744–757` which explicitly tests `offset: MAX_PAGINATION_OFFSET + 1`.

## Fix

Two changes: one import addition, one schema addition.

### 1. Import Change (`review-controller.ts:5`)

```typescript
// FROM:
import { MAX_PAGINATION_LIMIT } from '@/src/adapters/shared/validation-limits';

// TO:
import { MAX_PAGINATION_LIMIT, MAX_PAGINATION_OFFSET } from '@/src/adapters/shared/validation-limits';
```

### 2. Schema Change (`review-controller.ts:18`)

```typescript
// FROM:
offset: z.number().int().min(0),

// TO:
offset: z.number().int().min(0).max(MAX_PAGINATION_OFFSET),
```

### 3. Test Addition (`review-controller.test.ts`, after line 83)

Mirror `practice-controller.test.ts:744–757`:

```typescript
it('returns VALIDATION_ERROR when offset exceeds the maximum', async () => {
  const deps = createDeps();

  const result = await getAttemptedQuestions(
    { limit: 10, offset: MAX_PAGINATION_OFFSET + 1 },
    deps,
  );

  expect(result).toMatchObject({
    ok: false,
    error: { code: 'VALIDATION_ERROR' },
  });
  expect(deps.getAttemptedQuestionsUseCase.inputs).toEqual([]);
});
```

Import `MAX_PAGINATION_OFFSET` at the top of the test file.

### 4. Boundary Pass Test (`review-controller.test.ts`)

Add a positive boundary case to lock the contract:

```typescript
it('accepts offset at MAX_PAGINATION_OFFSET boundary', async () => {
  const deps = createDeps();

  const result = await getAttemptedQuestions(
    { limit: 10, offset: MAX_PAGINATION_OFFSET },
    deps,
  );

  expect(result.ok).toBe(true);
  expect(deps.getAttemptedQuestionsUseCase.inputs).toEqual([
    expect.objectContaining({ offset: MAX_PAGINATION_OFFSET }),
  ]);
});
```

### Horizontal Audit (No Other Bugs)

All 10 controller files scanned. Only 2 controllers accept an `offset` parameter:
- `practice-schemas.ts` — correctly bounded ✓
- `review-controller.ts` — **this bug** ✗

`question-controller.ts` has a `fromIndex` field with `.min(0)` but no `.max()` — this is NOT a pagination offset; it's a session-specific question index already bounded by `MAX_PRACTICE_SESSION_QUESTIONS`.

## Verification

- [ ] Unit test: `getAttemptedQuestions` rejects `offset: MAX_PAGINATION_OFFSET + 1` with `VALIDATION_ERROR`
- [ ] Unit test: `getAttemptedQuestions` accepts `offset: MAX_PAGINATION_OFFSET` (boundary passes)
- [ ] Regression: Existing tests still pass

## Tracer-Bullet Verification (2026-02-25)

Full vertical trace from controller → use case → repository port → Drizzle impl → SQL. Horizontal trace across all 10 controller files confirmed this is the sole instance.

## Related

- `src/adapters/controllers/review-controller.ts:15–27` — missing `.max(MAX_PAGINATION_OFFSET)`
- `src/adapters/controllers/practice-schemas.ts:68–74` — correct offset bound pattern
- `src/adapters/shared/validation-limits.ts:16` — `MAX_PAGINATION_OFFSET = 10_000`
- `src/application/ports/attempt-repository.ts:92–102` — offset passes through as number
- `src/adapters/repositories/drizzle-attempt-repository.ts:369–423` — unbounded `.offset(offset)` sink
- `src/adapters/repositories/shared/latest-attempt-rank-sql.ts:9` — `row_number()` ranking used in query path
- `src/adapters/controllers/review-controller.test.ts:70–83` — current validation test gap
- `src/adapters/controllers/practice-controller.test.ts:744–757` — existing correct max-offset test pattern
