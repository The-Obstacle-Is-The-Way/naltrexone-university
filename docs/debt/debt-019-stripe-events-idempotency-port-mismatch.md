# DEBT-019: Stripe Webhook Idempotency/Locking Not Implementable With Current `StripeEventRepository` Port

**Status:** Open
**Priority:** P1
**Date:** 2026-02-01

## Summary

The SSOT webhook contract (`docs/specs/master_spec.md` §4.4.2) requires **idempotency + concurrency safety** for Stripe webhook processing:

- Claim an event via insert + `ON CONFLICT DO NOTHING RETURNING`
- Short-circuit already-processed events
- Ensure only one request proceeds for a given `event.id` (row lock or advisory lock)
- Mark processed/failed in `stripe_events`

The current application port `StripeEventRepository` (and its Drizzle implementation) does not provide the primitives needed to implement this safely:

- `ensure(eventId, type): Promise<void>` does not return whether the event was claimed.
- There is no “lock for processing” operation, and no way to atomically fetch + lock the `stripe_events` row to serialize retries.

This is not a theoretical concern: Stripe delivers duplicates and can deliver out-of-order. Once `/api/stripe/webhook` exists, this becomes a correctness issue.

## Locations

- Port: `src/application/ports/repositories.ts` (`StripeEventRepository`)
- Adapter: `src/adapters/repositories/drizzle-stripe-event-repository.ts`
- SSOT requirement: `docs/specs/master_spec.md` §4.4.2

## Why This Matters

Without claim + lock semantics, two concurrent webhook deliveries for the same `eventId` can both:

1. See `isProcessed(eventId) === false`
2. Call `ensure(eventId, type)` (one insert wins, other no-ops)
3. Both proceed to process writes concurrently

Even if subscription writes are mostly idempotent, this can still cause:

- duplicate external calls (Stripe fetches on success page + webhook)
- inconsistent “failed vs processed” bookkeeping
- brittle behavior as additional side effects are added (emails, analytics, audits)

## Proposed Fix

Update the port and implementation so the webhook handler can implement SSOT exactly.

### Option A (Recommended): Claim + row lock

Add port methods:

```ts
export interface StripeEventRepository {
  claim(eventId: string, type: string): Promise<boolean>; // true if inserted
  getForUpdate(eventId: string): Promise<{
    id: string;
    processedAt: Date | null;
    error: string | null;
  }>;
  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;
}
```

Implementation notes:
- `claim` uses `ON CONFLICT DO NOTHING RETURNING id` and returns whether inserted.
- `getForUpdate` runs inside a transaction and performs `SELECT ... FOR UPDATE` to serialize processing/retries.

### Option B: Advisory locks

If we want to avoid row-lock plumbing, implement an adapter-only helper:
- `pg_advisory_xact_lock(hash(eventId))` inside a transaction

This still requires a transactional API surface somewhere.

## Acceptance Criteria

- Port supports claim + serialization semantics required by SSOT.
- Adapter implementation is covered by integration tests with concurrent calls.
- Webhook handler can follow SSOT steps without hacks (no racy `isProcessed` + `ensure`).

