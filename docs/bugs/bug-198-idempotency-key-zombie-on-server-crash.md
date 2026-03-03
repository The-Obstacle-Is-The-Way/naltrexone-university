# BUG-198: Idempotency Key Zombie on Server Crash

**Status:** Open
**Priority:** P3
**Date:** 2026-03-03

---

## Description

If the server crashes (or the serverless function times out) after `withIdempotency` claims an idempotency key but before `storeResult` or `storeError` runs, the key becomes a "zombie" — claimed, never completed, not yet expired. All subsequent requests with the same key enter the poll loop, time out after 2 seconds, and throw `CONFLICT: Request timed out waiting for idempotency key`.

The zombie persists until the key's TTL expires (24 hours by default).

Observed behavior:
- After a server crash during a mutation, retrying the same action with the same idempotency key fails with `CONFLICT` for up to 24 hours.
- The user must either wait 24 hours, use a different idempotency key (client-side key rotation), or the key must be manually cleaned up.

Expected behavior:
- Zombie keys should be detected and reclaimable after a reasonable timeout (e.g., 30-60 seconds without completion).

## Steps to Reproduce

1. Start a mutation that uses idempotency (e.g., `submitAnswer` with idempotency key).
2. Kill the server process (or simulate serverless timeout) after `claim` succeeds but before `storeResult`.
3. Retry the same mutation with the same idempotency key.
4. Observe: poll loop runs for 2 seconds, then throws `CONFLICT`.

## Root Cause

Tracer-bullet path:
1. `claim()` at [with-idempotency.ts:71-76](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/shared/with-idempotency.ts:71) — key inserted with `expiresAt = now + 24h`, `completedAt = null`, `resultJson = null`, `errorCode = null`.
2. `execute()` at [with-idempotency.ts:80](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/shared/with-idempotency.ts:80) — server crashes here.
3. `storeResult()` at [with-idempotency.ts:81-86](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/shared/with-idempotency.ts:81) — never reached.
4. `storeError()` at [with-idempotency.ts:89-95](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/shared/with-idempotency.ts:89) — never reached.
5. Retry enters poll loop at [with-idempotency.ts:120-155](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/shared/with-idempotency.ts:120) — key exists, no result, no error, not expired → loops until timeout.
6. `pruneExpiredBefore` at [with-idempotency.ts:56-68](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/shared/with-idempotency.ts:56) — only prunes expired keys, not zombies.
7. `claim()` reclaim path in `drizzle-idempotency-key-repository.ts:49-69` — only reclaims when `lt(expiresAt, now())`. A 24-hour TTL key is not expired, so reclaim fails.

## Fix

Not yet implemented.

Expected fix shape:
- Add a `claimedAt` column (or reuse existing timestamps) to track when the key was claimed.
- In the poll loop or claim path, detect zombie keys: `completedAt IS NULL AND errorCode IS NULL AND claimedAt < now() - zombieThresholdMs`.
- Reclaim zombie keys by resetting them, allowing the retry to proceed.
- Alternative: reduce TTL for uncompleted keys to a shorter window (e.g., 60 seconds), separate from the completed-result TTL (24 hours).

## Verification

- [ ] Unit test added
- [ ] Integration test added
- [ ] Manual verification
- [x] Code-level tracer-bullet verified (Audit #12, 2026-03-03)

## Related

- `withIdempotency` is used by `startPracticeSession`, `submitAnswer`, `toggleBookmark`, and `endPracticeSession` controller wrappers.
- Client-side idempotency key rotation (generating a new key on retry) partially mitigates this, but only if the client knows to rotate.
