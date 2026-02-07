# BUG-104: Double Pruning — Webhook Controller and Hot Paths Both Prune

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

When BUG-102 and BUG-103 were fixed, pruning was added to the hot paths (`DrizzleRateLimiter.limit()` and `withIdempotency()`) so that expired rows are cleaned during normal request traffic. However, the **same pruning was never removed from the webhook controller**, which was the original-only call site.

This means every webhook event triggers **three** pruning operations (stripe_events, idempotency_keys, rate_limits), while the hot paths **also** trigger pruning for idempotency_keys and rate_limits during normal requests. Two tables are pruned in two places — redundant database work on every webhook.

### What's pruned where

| Table | Webhook Controller | Hot Path | Result |
|-------|-------------------|----------|--------|
| `stripe_events` | Lines 122-136 | None | Single (correct) |
| `idempotency_keys` | Lines 138-150 | `withIdempotency()` lines 55-59 | **DOUBLE** |
| `rate_limits` | Lines 152-164 | `DrizzleRateLimiter.limit()` lines 61-68 | **DOUBLE** |

### Secondary issues in the same change

1. **Redundant deps on `StripeWebhookDeps`**: `rateLimiter` and `idempotencyKeys` were added to the webhook controller type solely for pruning. Once webhook pruning is removed for these tables, these deps are dead weight.

2. **Silent `catch {}` in hot paths**: Hot-path pruning uses empty `catch {}` blocks (silent failure). The webhook controller logs failures via `logger.warn`. Silent failures are invisible to operators.

3. **Duplicated constants**: `DAY_MS`, `PRUNE_RETENTION_DAYS`, and `PRUNE_BATCH_LIMIT` are defined independently in `stripe-webhook-controller.ts`, `drizzle-rate-limiter.ts`, and `with-idempotency.ts`. A value change in one file won't propagate.

## Impact

- **Wasted I/O**: Every Stripe webhook does two unnecessary prune queries (one for idempotency_keys, one for rate_limits) that the hot paths already handle.
- **Misleading architecture**: The webhook controller carries `rateLimiter` and `idempotencyKeys` deps that exist only for redundant pruning, inflating its dependency surface.
- **8 stale tests**: The webhook controller test file has 4 pruning tests for idempotency_keys and rate_limits that test redundant behavior.
- **Maintenance risk**: Three independent copies of retention/batch constants can silently diverge.

## Root Cause

The previous agent added hot-path pruning (commit `94b2ffb`) but did not remove the webhook-side pruning (added in commit `53bc601`). The webhook controller file was untouched between the two commits — the cleanup was simply missed.

## Fix

1. **Remove** idempotency_keys and rate_limits pruning blocks from the webhook controller (keep stripe_events pruning — it has no hot-path alternative)
2. **Remove** `rateLimiter` and `idempotencyKeys` from `StripeWebhookDeps` type
3. **Remove** unused deps from container wiring (`lib/container/controllers.ts`)
4. **Remove** stale tests and update container assertions
5. **Remove** now-unused constants from the webhook controller (`DAY_MS`, `PRUNE_RETENTION_DAYS`, `PRUNE_BATCH_LIMIT` — only needed for the remaining stripe_events pruning, which uses its own inline calculation)
6. **Update** all test files that construct `StripeWebhookDeps` inline

## Affected Files

- `src/adapters/controllers/stripe-webhook-controller.ts` — Remove 2 pruning blocks + 2 deps from type
- `src/adapters/controllers/stripe-webhook-controller.test.ts` — Remove 4 stale pruning tests + deps from helper
- `lib/container/controllers.ts` — Remove 2 dep injections
- `lib/container.test.ts` — Remove 2 dep assertions
- `app/api/stripe/webhook/route.test.ts` — Remove inline idempotencyKeys/rateLimiter from webhook deps
- `tests/integration/controllers.integration.test.ts` — Remove inline deps

## Verification

- [x] Webhook controller only prunes `stripe_events`
- [x] `StripeWebhookDeps` has no `rateLimiter` or `idempotencyKeys` fields
- [x] Hot-path pruning unchanged (rate_limits in `limit()`, idempotency_keys in `withIdempotency()`)
- [x] All existing tests pass (979 passing, no regressions)
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` clean

## Related

- [BUG-102](../_archive/bugs/bug-102-rate-limits-table-unbounded-growth.md) — Original rate_limits pruning fix
- [BUG-103](../_archive/bugs/bug-103-idempotency-key-pruning-never-wired.md) — Original idempotency_keys pruning fix
- Commit `53bc601` — Added webhook pruning
- Commit `94b2ffb` — Added hot-path pruning (but didn't remove webhook pruning)
