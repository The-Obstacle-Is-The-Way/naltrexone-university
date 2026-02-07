# BUG-102: Rate Limits Table Unbounded Growth

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The `rate_limits` table was growing without bound. Every rate-limit check inserts or upserts a row keyed by `(key, window_start)`. When a window expires, the row becomes stale unless explicitly deleted.

This is the same class of issue as BUG-027 (Stripe Events Table Unbounded Growth), which was fixed by adding opportunistic pruning in the webhook controller. The `rate_limits` table has no equivalent pruning mechanism — the `RateLimiter` port interface doesn't even define a prune method.

## Impact

- **Database bloat**: Stale rows accumulate at a rate proportional to request volume (webhooks, health checks, practice actions, billing actions, bookmarks, question submissions)
- **Query degradation**: Although the composite primary key `(key, window_start)` keeps the active-window lookup fast, the `window_start` index grows unbounded, eventually increasing vacuum time and storage costs
- **Inconsistency**: `stripe_events` had pruning (BUG-027 fix), but `rate_limits` did not

## Affected Files

- `src/application/ports/gateways.ts` — `RateLimiter` interface (no prune method)
- `src/adapters/gateways/drizzle-rate-limiter.ts` — Implementation (no prune method)
- `src/application/test-helpers/fakes.ts` — `FakeRateLimiter` (no prune method)

## Root Cause

The rate limiter was initially implemented with only `limit()`, so expired windows had no cleanup path.

## Fix

1. Added `pruneExpiredWindows(before: Date, limit: number): Promise<number>` to the `RateLimiter` port interface.
2. Implemented `pruneExpiredWindows` in `DrizzleRateLimiter` (ordered batch delete) and in `FakeRateLimiter`.
3. Kept webhook-level best-effort pruning for operational hygiene.
4. Added hot-path opportunistic pruning in `DrizzleRateLimiter.limit()` when a new window row is created (`count === 1`), with best-effort semantics so pruning failures never block requests.
5. Added regression tests for the new behavior in `src/adapters/gateways/drizzle-rate-limiter.test.ts`.

## Verification

- [x] `RateLimiter` port defines `pruneExpiredWindows`
- [x] `DrizzleRateLimiter` implements deletion of expired windows
- [x] `FakeRateLimiter` implements in-memory pruning
- [x] Webhook controller calls pruning with best-effort try-catch
- [x] Unit tests cover hot-path pruning behavior
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- [BUG-027](bug-027-stripe-events-unbounded-growth.md) — Same class of issue, resolved for stripe_events
- [BUG-103](bug-103-idempotency-key-pruning-never-wired.md) — Related idempotency pruning lifecycle gap
- [ADR-016](../../adr/adr-016-rate-limiting.md) — Rate limiting design
- `db/schema.ts` — `rateLimits` table definition
