# BUG-049: Silent Pruning Failures in Stripe Webhook Controller

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-03

---

## Description

The Stripe webhook controller's event pruning logic catches and silently swallows all errors without any logging, metrics, or alerting. When the database cleanup routine fails, there is no visibility into the failure.

**Expected behavior:** Pruning failures should be logged as warnings so operators can detect and respond to infrastructure issues.

**Actual behavior:** Pruning failures are completely silent, allowing database bloat to occur undetected.

## Location

**File:** `src/adapters/controllers/stripe-webhook-controller.ts`
**Lines:** 91-98

```typescript
try {
  await stripeEvents.pruneProcessedBefore(
    new Date(Date.now() - STRIPE_EVENT_RETENTION_DAYS * DAY_MS),
    STRIPE_EVENT_PRUNE_LIMIT,
  );
} catch {
  // Best-effort cleanup: do not fail webhook processing if pruning fails.
}
```

## Root Cause

The empty catch block was intentionally added to prevent pruning failures from failing webhook processing (which is correct), but the logging was omitted, making failures invisible.

## Impact

1. **Database Bloat:** If pruning consistently fails (e.g., due to permissions, locks, or connection issues), the `stripe_events` table will grow unbounded.

2. **Invisible Infrastructure Issues:** Operators have no visibility into why the table keeps growing.

3. **Late Discovery:** The issue will only be discovered when the database runs out of space or queries slow down significantly.

**Severity Assessment:**
- Not data-corrupting (P1)
- Not security-related (P0-P1)
- Operational visibility issue (P3)
- Workaround exists: Monitor table size directly via database metrics

## Steps to Reproduce

1. Trigger a pruning failure (e.g., by revoking DELETE permissions temporarily)
2. Send a Stripe webhook event
3. Observe: No error appears in logs
4. Table continues to grow

## Fix

Add a warning log to the catch block while preserving the non-failing behavior:

```typescript
try {
  await stripeEvents.pruneProcessedBefore(
    new Date(Date.now() - STRIPE_EVENT_RETENTION_DAYS * DAY_MS),
    STRIPE_EVENT_PRUNE_LIMIT,
  );
} catch (error) {
  // Best-effort cleanup: do not fail webhook processing if pruning fails.
  // Log warning so operators can detect persistent pruning failures.
  deps.logger.warn(
    {
      eventId: event.eventId,
      error: error instanceof Error ? error.message : String(error),
      retentionDays: STRIPE_EVENT_RETENTION_DAYS,
      pruneLimit: STRIPE_EVENT_PRUNE_LIMIT,
    },
    'Stripe event pruning failed',
  );
}
```

**Requirements:**
1. Ensure `StripeWebhookDeps` includes a non-optional `logger`
2. Inject logger from the DI container
3. Log a warning with error context

## Verification

- [x] Unit test: Verify logger.warn is called when pruning throws
- [x] Unit test: Verify webhook processing still succeeds when pruning fails

## Related

- `docs/_archive/bugs/bug-027-stripe-events-unbounded-growth.md` — Original unbounded growth fix (added pruning)
- `src/adapters/controllers/stripe-webhook-controller.test.ts` — Test file to update
- `lib/container.ts` — Inject logger dependency
