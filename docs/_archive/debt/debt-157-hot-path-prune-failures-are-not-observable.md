# DEBT-157: Hot-Path Prune Failures Are Not Observable

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

`withIdempotency()` and `DrizzleRateLimiter.limit()` both run best-effort pruning and intentionally continue on failure. They previously swallowed prune errors silently (`catch {}`).

This prevents operators from detecting persistent prune failures in production.

## Impact

- Expired `idempotency_keys` and `rate_limits` rows can begin accumulating again without visibility.
- Operational regressions become difficult to detect early because there is no warning signal.
- BUG-102/103 regression risk increases if pruning fails repeatedly.

## Resolution Implemented

- `withIdempotency()` now requires a logger and emits structured `warn` logs when `pruneExpiredBefore` fails while preserving fail-open behavior.
- Billing/bookmark/question/practice controllers now inject logger via DI and pass it through all `withIdempotency()` calls.
- `DrizzleRateLimiter.limit()` now emits structured `warn` logs when `pruneExpiredWindows` fails while preserving fail-open behavior.
- Container gateway wiring now injects logger into `DrizzleRateLimiter`.
- Health route rate limiter now passes logger to preserve observability outside container factories.
- Added and updated unit coverage for both prune-failure paths.

## Verification

- [x] `with-idempotency` prune failure path emits structured warning and still returns/rethrows primary flow behavior
- [x] `drizzle-rate-limiter` prune failure path emits structured warning and still returns rate-limit result
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- `docs/_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md`
- `docs/_archive/bugs/bug-103-idempotency-key-pruning-never-wired.md`
- `docs/_archive/bugs/bug-104-double-pruning-webhook-and-hot-paths.md`
- `src/adapters/shared/with-idempotency.ts`
- `src/adapters/gateways/drizzle-rate-limiter.ts`
