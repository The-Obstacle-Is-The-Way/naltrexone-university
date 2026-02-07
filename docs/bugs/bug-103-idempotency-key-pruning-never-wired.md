# BUG-103: Idempotency Key Pruning Never Wired to Production

**Status:** In Progress
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The `IdempotencyKeyRepository` port defines `pruneExpiredBefore(cutoff, limit)` for garbage collection. Both the Drizzle implementation and the fake implement it correctly. However, **no production code ever calls this method**. The `idempotency_keys` table grows unbounded with expired keys.

ADR-015 explicitly designed this as part of the "self-cleaning" strategy:

> *"Self-cleaning — TTL + `pruneExpiredBefore` prevent unbounded table growth."*

The design was completed but the wiring was missed.

## Impact

- **Database bloat**: Every idempotent operation (checkout, portal session, answer submission, bookmark toggle, session start/end, question mark) creates a row with a 24-hour TTL. After expiry, rows remain forever.
- **Inconsistency with stripe_events**: `StripeEventRepository.pruneProcessedBefore()` is called in the webhook controller (lines 111-129). The identical pattern for idempotency keys was designed but never wired.
- **False confidence**: ADR-015 claims the table is self-cleaning, but it isn't.

## Affected Files

- `src/application/ports/idempotency-key-repository.ts:56` — Port defines `pruneExpiredBefore` (never called)
- `src/adapters/repositories/drizzle-idempotency-key-repository.ts:163` — Implementation exists (never called)
- `src/application/test-helpers/fakes.ts:624` — Fake exists (never called)
- `src/adapters/controllers/stripe-webhook-controller.ts` — Where pruning should be wired (has stripe_events pruning but not idempotency_keys)

## Root Cause

The pruning method was implemented as part of ADR-015 (idempotency strategy) but was never wired into any production call site. The stripe_events pruning was wired in the webhook controller, but the same pattern was not applied to idempotency keys.

## Fix

Wire `idempotencyKeys.pruneExpiredBefore()` into the webhook controller alongside the existing `stripeEvents.pruneProcessedBefore()` call. Follow the same best-effort try-catch pattern with `logger.warn` on failure.

1. Add `idempotencyKeys: IdempotencyKeyRepository` to `StripeWebhookDeps` (or expand the transaction to include it)
2. Add a best-effort pruning call after webhook processing
3. Use the same retention/limit constants as stripe_events (90 days, 100 batch limit) — or use the 24-hour TTL as the natural cutoff

## Verification

- [ ] `pruneExpiredBefore` is called in production code
- [ ] Best-effort pattern matches stripe_events (try-catch with logger.warn)
- [ ] Webhook controller test covers idempotency key pruning
- [ ] All existing tests pass (no regressions)

## Related

- [BUG-102](bug-102-rate-limits-table-unbounded-growth.md) — Same class of issue for rate_limits table
- [BUG-027](../_archive/bugs/bug-027-stripe-events-unbounded-growth.md) — Precedent fix for stripe_events
- [ADR-015](../adr/adr-015-idempotency-strategy.md) — Idempotency design (documents pruneExpiredBefore)
- `src/adapters/controllers/stripe-webhook-controller.ts:111-129` — Existing stripe_events pruning pattern
