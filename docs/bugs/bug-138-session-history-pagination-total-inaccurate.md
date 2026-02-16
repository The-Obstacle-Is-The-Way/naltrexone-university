# BUG-138: Session History Pagination Total Inaccurate When Defensive Skip Triggers

**Status:** Open
**Priority:** P3
**Date:** 2026-02-16

---

## Description

`GetSessionHistoryUseCase` defensively skips sessions returned by `findCompletedByUserId()` that have `endedAt === null`, then subtracts `skippedCount` from the total. However, `skippedCount` only accounts for skipped rows in the **current page**, not globally. The adjusted total may be inaccurate, causing pagination offset drift.

**Observed:** If page 1 returns 10 sessions but 2 are skipped, `total` becomes `page.total - 2`. But if page 2 also has skipped sessions, the client's offset calculation will be wrong because the total was only reduced by page 1's skips.

**Expected:** Either the repository should never return sessions with `endedAt === null` from `findCompletedByUserId()`, or the total should account for all null-endedAt sessions globally.

## Steps to Reproduce

1. Have sessions in DB where `endedAt IS NULL` that are somehow returned by `findCompletedByUserId()`
2. Request session history with pagination (e.g., limit=10, offset=0)
3. Observe that `total` is reduced by skips on the current page only
4. Navigate to page 2 — offset may not align with actual available rows

## Root Cause

`src/application/use-cases/get-session-history.ts:47-73`:
```typescript
let skippedCount = 0;
for (const session of page.rows) {
  const endedAt = session.endedAt;
  if (!endedAt) {
    skippedCount += 1;
    continue;
  }
  // ...
}
const total = Math.max(0, page.total - skippedCount);
```

The `skippedCount` is local to the page, but `page.total` represents the global count.

## Fix

Option A (preferred): Fix the repository to never return sessions with `endedAt === null` from `findCompletedByUserId()` — enforce the invariant at the data layer.

Option B: If defensive coding is desired, throw an `ApplicationError('INTERNAL_ERROR')` instead of silently skipping, since `findCompletedByUserId` returning incomplete sessions indicates data corruption.

## Verification

- [ ] Unit test: Verify `findCompletedByUserId` never returns sessions with null `endedAt`
- [ ] Unit test: Confirm pagination totals are accurate across pages

## Related

- `src/application/use-cases/get-session-history.ts:34-81`
