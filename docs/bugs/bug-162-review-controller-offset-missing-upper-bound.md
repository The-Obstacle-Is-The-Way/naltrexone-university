# BUG-162: Review Controller Pagination Offset Missing Upper Bound Validation

**Status:** Open
**Priority:** P4
**Date:** 2026-02-25

---

## Description

The `GetAttemptedQuestionsInputSchema` in `review-controller.ts` validates `offset` with `.min(0)` but lacks a `.max()` upper bound. This is inconsistent with the practice controller's `GetSessionHistoryInputSchema`, which correctly bounds offset with `.max(MAX_PAGINATION_OFFSET)` (10,000).

A client can submit an arbitrarily large offset (e.g., `offset: 999_999_999`), causing the database to scan and skip a large number of rows before returning results.

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
3. **Repository port** (`attempt-repository.ts:92–102`): `offset: number` — no constraints (correctly delegated to adapter)
4. **Repository impl** (`drizzle-attempt-repository.ts:369–423`): `.offset(offset)` hits Postgres directly

The query involves a `ROW_NUMBER()` window function in the `latest_attempt_rows` subquery. Postgres must evaluate the full windowed result set before applying `OFFSET`, making the cost worse than a simple sequential scan.

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

- `src/adapters/controllers/review-controller.ts:18` — missing bound
- `src/adapters/controllers/practice-schemas.ts:71` — correct pattern
- `src/adapters/shared/validation-limits.ts:16` — `MAX_PAGINATION_OFFSET = 10_000`
- `src/adapters/repositories/drizzle-attempt-repository.ts:369–423` — SQL endpoint
- `src/adapters/controllers/review-controller.test.ts:70` — test with no upper bound check
- `src/adapters/controllers/practice-controller.test.ts:744` — correct test pattern
