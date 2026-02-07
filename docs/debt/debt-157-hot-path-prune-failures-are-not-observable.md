# DEBT-157: Hot-Path Prune Failures Are Not Observable

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

`withIdempotency()` and `DrizzleRateLimiter.limit()` both run best-effort pruning and intentionally continue on failure, but they currently swallow prune errors silently (`catch {}`).

This prevents operators from detecting persistent prune failures in production.

## Impact

- Expired `idempotency_keys` and `rate_limits` rows can begin accumulating again without visibility.
- Operational regressions become difficult to detect early because there is no warning signal.
- BUG-102/103 regression risk increases if pruning fails repeatedly.

## Evidence

- `src/adapters/shared/with-idempotency.ts:59` uses `catch {}` around `pruneExpiredBefore`.
- `src/adapters/gateways/drizzle-rate-limiter.ts:67` uses `catch {}` around `pruneExpiredWindows`.
- BUG-104 removed webhook-side duplicate pruning, so these hot paths are now the sole pruning owners for these tables.

## Resolution

1. Add non-blocking observability to both hot paths:
   - Emit structured warn logs on prune failure.
   - Keep request behavior fail-open (do not block user/webhook flows).
2. Keep logging dependencies adapter-safe:
   - Either inject logger where these utilities are constructed, or
   - Expose an optional prune-error callback in helper APIs and wire from controllers/composition root.
3. Add tests verifying:
   - Prune failures do not fail requests.
   - Warn logging/callback is emitted exactly once per failure path.

## Verification

- [ ] `with-idempotency` prune failure path emits structured warning and still returns/rethrows primary flow behavior
- [ ] `drizzle-rate-limiter` prune failure path emits structured warning and still returns rate-limit result
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- `docs/_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md`
- `docs/_archive/bugs/bug-103-idempotency-key-pruning-never-wired.md`
- `docs/_archive/bugs/bug-104-double-pruning-webhook-and-hot-paths.md`
- `src/adapters/shared/with-idempotency.ts`
- `src/adapters/gateways/drizzle-rate-limiter.ts`
