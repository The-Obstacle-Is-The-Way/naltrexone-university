# BUG-103: Idempotency Key Pruning Never Wired to Production

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The `IdempotencyKeyRepository` port defines `pruneExpiredBefore(cutoff, limit)` for garbage collection. The Drizzle and fake implementations existed, but pruning was not consistently invoked from production request paths.

ADR-015 explicitly designed this as part of the "self-cleaning" strategy:

> *"Self-cleaning — TTL + `pruneExpiredBefore` prevent unbounded table growth."*

The design existed, but practical call-site wiring was incomplete.

## Impact

- **Database bloat**: Every idempotent operation (checkout, portal session, answer submission, bookmark toggle, session start/end, question mark) creates a row with a 24-hour TTL. After expiry, rows remain forever.
- **Inconsistency with stripe_events**: `StripeEventRepository.pruneProcessedBefore()` was already wired for webhooks, but idempotency cleanup was not consistently triggered by idempotent action traffic.
- **False confidence risk**: ADR-015 expects self-cleaning behavior.

## Affected Files

- `src/application/ports/idempotency-key-repository.ts:56` — Port defines `pruneExpiredBefore` (never called)
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts:163` — Implementation exists (never called)
- `src/application/test-helpers/fakes.ts:624` — Fake exists (never called)
- `src/adapters/controllers/stripe-webhook-controller.ts` — webhook cleanup wiring
- `src/adapters/shared/with-idempotency.ts` — idempotent request hot path

## Root Cause

Pruning existed at the repository layer, but enforcement was not sufficiently coupled to the high-volume idempotent execution path.

## Fix

1. Wired `idempotencyKeys.pruneExpiredBefore()` into the webhook controller with best-effort logging.
2. Added hot-path best-effort pruning to `withIdempotency` so expired keys are routinely pruned during idempotent action traffic.
3. Added regression tests in `src/adapters/shared/with-idempotency.test.ts` for prune invocation and prune-failure tolerance.

## Verification

- [x] `pruneExpiredBefore` is called in production code
- [x] Best-effort webhook pattern matches `stripe_events` (try-catch + logger.warn)
- [x] Webhook controller test covers idempotency key pruning
- [x] `withIdempotency` test suite covers prune invocation and failure tolerance
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- [BUG-102](bug-102-rate-limits-table-unbounded-growth.md) — Same class of issue for rate_limits table
- [BUG-027](bug-027-stripe-events-unbounded-growth.md) — Precedent fix for stripe_events
- [ADR-015](../../adr/adr-015-idempotency-strategy.md) — Idempotency design (documents pruneExpiredBefore)
- `src/adapters/controllers/stripe-webhook-controller.ts` — Existing stripe_events pruning pattern
