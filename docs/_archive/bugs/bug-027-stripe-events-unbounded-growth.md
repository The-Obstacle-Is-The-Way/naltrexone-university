# BUG-027: Stripe Events Table Unbounded Growth

**Status:** Resolved
**Priority:** P2 - Medium
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The `stripe_events` table tracks webhook deliveries for idempotency, but had no retention policy. Over time, this table would grow unbounded, increasing storage, index bloat, and backup size.

## Root Cause

We recorded webhook event IDs indefinitely and never pruned successfully-processed rows.

## Fix

Implemented a bounded retention strategy based on `processed_at`:

1. Added `StripeEventRepository.pruneProcessedBefore(cutoff, limit)` to delete old rows where:
   - `processed_at IS NOT NULL`
   - `processed_at < cutoff`
2. Updated `processStripeWebhook()` to call prune after successful processing:
   - Retention window: 90 days
   - Batch size: 100 rows per webhook delivery

This keeps the table bounded without requiring a separate cron job, while retaining failed/unprocessed rows for debugging.

## Verification

- [x] Unit tests added:
  - `src/adapters/repositories/drizzle-stripe-event-repository.test.ts` (prune behavior)
  - `src/adapters/controllers/stripe-webhook-controller.test.ts` (prune invocation)
- [x] `pnpm test --run`

## Related

- `src/adapters/controllers/stripe-webhook-controller.ts`
- `src/adapters/repositories/drizzle-stripe-event-repository.ts`
