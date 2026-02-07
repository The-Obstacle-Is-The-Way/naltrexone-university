# BUG-102: Rate Limits Table Unbounded Growth

**Status:** In Progress
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The `rate_limits` table grows without bound. Every rate limit check inserts or upserts a row keyed by `(key, window_start)`. When a window expires, the row becomes stale but is never deleted. Over months of operation, millions of stale rows accumulate.

This is the same class of issue as BUG-027 (Stripe Events Table Unbounded Growth), which was fixed by adding opportunistic pruning in the webhook controller. The `rate_limits` table has no equivalent pruning mechanism — the `RateLimiter` port interface doesn't even define a prune method.

## Impact

- **Database bloat**: Stale rows accumulate at a rate proportional to request volume (webhooks, health checks, practice actions, billing actions, bookmarks, question submissions)
- **Query degradation**: Although the composite primary key `(key, window_start)` keeps the active-window lookup fast, the `window_start` index grows unbounded, eventually increasing vacuum time and storage costs
- **Inconsistency**: `stripe_events` has pruning (BUG-027 fix), `idempotency_keys` has a defined-but-unwired prune method (see BUG-103), but `rate_limits` has nothing

## Affected Files

- `src/application/ports/gateways.ts` — `RateLimiter` interface (no prune method)
- `src/adapters/gateways/drizzle-rate-limiter.ts` — Implementation (no prune method)
- `src/application/test-helpers/fakes.ts` — `FakeRateLimiter` (no prune method)

## Root Cause

The rate limiter was implemented with only the `limit()` method. Unlike the `IdempotencyKeyRepository` (which has `pruneExpiredBefore()`) and the `StripeEventRepository` (which has `pruneProcessedBefore()`), no garbage collection method was designed into the `RateLimiter` port.

## Fix

1. Add `pruneExpiredWindows(before: Date, limit: number): Promise<number>` to the `RateLimiter` port interface
2. Implement in `DrizzleRateLimiter`: DELETE rows WHERE `window_start < cutoff` with batch limit
3. Implement in `FakeRateLimiter` for test parity
4. Wire opportunistic best-effort pruning into the webhook controller, following the `stripe_events` pattern (try-catch with logger.warn on failure)

## Verification

- [ ] `RateLimiter` port defines `pruneExpiredWindows`
- [ ] `DrizzleRateLimiter` implements deletion of expired windows
- [ ] `FakeRateLimiter` implements in-memory pruning
- [ ] Webhook controller calls pruning with best-effort try-catch
- [ ] Unit tests cover pruning behavior (happy path, empty table, limit respected)
- [ ] All existing tests pass (no regressions)

## Related

- [BUG-027](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md) — Same class of issue, resolved for stripe_events
- [BUG-103](bug-103-idempotency-key-pruning-never-wired.md) — Related: idempotency_keys pruning exists but is never called
- [ADR-016](../adr/adr-016-rate-limiting.md) — Rate limiting design
- `db/schema.ts` — `rateLimits` table definition
