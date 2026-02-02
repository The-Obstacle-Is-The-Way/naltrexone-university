# BUG-015: Memory Exhaustion for Power Users — All Attempts Loaded Into Memory

**Status:** Open
**Priority:** P1
**Date:** 2026-02-02

---

## Description

The stats and review controllers load ALL attempts for a user into memory before filtering or paginating. For power users with thousands of attempts, this will cause memory pressure or OOM errors.

**Observed behavior:**
- `stats-controller.ts` loads all attempts, then filters in-memory for 7-day window
- `review-controller.ts` loads all attempts, then paginates in-memory

**Expected behavior:** Database-level filtering and pagination.

## Steps to Reproduce

1. Create a user with 5,000+ attempts
2. Navigate to `/app/dashboard` or request missed questions
3. Observe: All 5,000 attempts loaded into Node.js memory
4. With enough concurrent users, memory exhaustion occurs

## Root Cause

Both controllers call `attemptRepository.findByUserId(userId)` which returns all attempts, then process in JavaScript:

**stats-controller.ts:90**
```typescript
const attempts = await d.attemptRepository.findByUserId(userId);
const totalAnswered = attempts.length;
const attemptsLast7Days = filterAttemptsInWindow(attempts, STATS_WINDOW_DAYS, now);
```

**review-controller.ts:87**
```typescript
const attempts = await d.attemptRepository.findByUserId(userId);
// ... in-memory deduplication and filtering ...
const page = missed.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit);
```

## Fix

1. Add date-range filtering to `AttemptRepository` interface:
```typescript
findByUserIdInDateRange(userId: string, since: Date): Promise<Attempt[]>;
```

2. Add pagination to repository for missed questions:
```typescript
findMissedByUserId(userId: string, limit: number, offset: number): Promise<Attempt[]>;
```

3. Move aggregation to database:
```typescript
countByUserId(userId: string): Promise<number>;
countCorrectByUserIdInDateRange(userId: string, since: Date): Promise<number>;
```

## Verification

- [ ] Load test with 10,000 attempts per user
- [ ] Memory profiling before/after fix
- [ ] Query plan analysis showing index usage
- [ ] Integration test with large dataset

## Related

- `src/adapters/controllers/stats-controller.ts:90`
- `src/adapters/controllers/review-controller.ts:87`
- `src/application/ports/repositories.ts` - AttemptRepository interface
