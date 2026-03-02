# BUG-184: Attempted Questions Count/Page Divergence Can Drop Real Rows

**Status:** Open
**Priority:** P2
**Date:** 2026-03-02

---

## Description

`GetAttemptedQuestionsUseCase` fetches `count` and `page` concurrently, then returns an empty result when `totalCount === 0 || page.length === 0`. If snapshots diverge under concurrent writes, it can drop non-empty page data.

Observed behavior:
- A response can return `rows: []` even when the page query produced rows.

Expected behavior:
- Non-empty page data should not be discarded because count is stale.

---

## Steps to Reproduce

1. Execute attempted-questions query while user activity changes attempts around the same time.
2. `count` observes 0 while `list` observes 1+ rows.
3. Use case short-circuits to empty output.

Executable verification performed on 2026-03-02:
1. Repro harness injected repository responses: `count=0`, `list=[one row]`.
2. Use case returned `{ totalCount: 0, rowsLength: 0 }`, proving row drop path.

---

## Root Cause

Tracer-bullet path:
1. Use case runs count/list in parallel at [get-attempted-questions.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-attempted-questions.ts:76).
2. Short-circuit condition at [get-attempted-questions.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-attempted-questions.ts:86) returns empty rows when `totalCount === 0`, regardless of `page`.
3. Repository list ([drizzle-attempt-repository.ts:381](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:381)) and count ([drizzle-attempt-repository.ts:437](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:437)) are separate SQL statements, so snapshot divergence is possible under concurrent writes.

**Practical likelihood:** Both queries execute near-simultaneously via `Promise.all`. Under Postgres READ COMMITTED isolation, divergence requires a write to commit in the microsecond window between the two queries starting — vanishingly unlikely in normal operation.

---

## Fix (TDD)

Not fixed yet.

### Red — write the failing test first

In `get-attempted-questions.test.ts`:

```typescript
it('returns page rows even when count returns 0 (snapshot divergence)', async () => {
  // Arrange: inject a fake that returns count=0 but list=[one row]
  //   (simulating a concurrent write between the two queries)
  // Act: execute({ userId, limit: 20, offset: 0 })
  // Assert: rows.length === 1, totalCount === 0
  //   (page data is preserved; count is stale but not destructive)
});
```

This test must FAIL before the fix — confirming the row-drop path.

### Green — minimum code to pass

In `GetAttemptedQuestionsUseCase.execute()`, change line 86 from:

```typescript
if (totalCount === 0 || page.length === 0) {
```

to:

```typescript
if (page.length === 0) {
```

The `totalCount` is still returned as-is for pagination UI — only the short-circuit condition changes. When `page.length === 0`, there is genuinely nothing to enrich, so the early return is still correct.

### Refactor

None needed — the change is a single condition simplification.

---

## Verification

- [ ] Unit test added (Red phase test above)
- [ ] Manual verification post-fix

