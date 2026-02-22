# BUG-149: Idempotency Null Result Indistinguishable from Pending State

**Status:** Open
**Priority:** P3
**Date:** 2026-02-22

---

## Description

The `withIdempotency` helper in `src/adapters/shared/with-idempotency.ts:114` uses `resultJson !== null` to determine whether an idempotent operation has completed:

```typescript
if (existing.resultJson !== null) {
  // Return cached result
}
// Otherwise: poll and wait for completion
```

The idempotency key lifecycle is:

| State | `resultJson` | `errorCode` |
|-------|-------------|-------------|
| Pending (in-progress) | `null` | `null` |
| Completed successfully | `<serialized result>` | `null` |
| Failed | `null` | `<error code>` |

If an operation legitimately completes with a `null` result (e.g., a void use case that returns `undefined`/`null`), the `resultJson` column would be `null`, which is indistinguishable from the "pending" state. This would cause the concurrent caller to enter the polling loop and eventually timeout after ~2 seconds, returning the `null` result only after the delay.

## Current Impact

**Latent / None** — All current idempotent operations return non-null objects:
- `createCheckoutSession` returns `{ url: string }`
- `endPracticeSession` returns a session object
- `toggleBookmark` returns a bookmark status object
- `setPracticeSessionQuestionMark` returns a session state object
- `submitAnswer` returns an attempt result object

No current use case triggers this bug.

## Steps to Reproduce

1. Create a use case wrapped in `withIdempotency` that returns `null` or `undefined`
2. Submit two concurrent requests with the same idempotency key
3. First request completes and stores `resultJson = null`
4. Second request polls, sees `resultJson === null`, treats it as pending
5. Second request times out after ~2 seconds instead of returning immediately

## Root Cause

The schema uses `null` as both the "no result yet" sentinel and a valid result value. There is no separate "completed" flag.

## Recommended Fix

Option A — Add a `completedAt` timestamp column to the idempotency key record:

```typescript
if (existing.completedAt !== null) {
  // Operation completed — return resultJson (which may be null)
}
```

Option B — Use a JSON sentinel value instead of `null` for pending state:

```typescript
// Store pending as missing key (not found), completed-null as JSON "null" string
if (existing.resultJson !== undefined) {
  return JSON.parse(existing.resultJson);
}
```

Option A is cleaner and avoids changing serialization semantics.

## Verification

- [ ] Unit test: idempotent operation returning `null` replays correctly
- [ ] Unit test: concurrent caller gets `null` result without polling timeout

## Related

- `src/adapters/shared/with-idempotency.ts:114`
- `src/adapters/shared/with-idempotency.test.ts`
- BUG-096, BUG-091, BUG-095 (idempotency key additions)
