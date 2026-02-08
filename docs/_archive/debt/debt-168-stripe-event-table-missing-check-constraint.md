# DEBT-168: Stripe Events Table Missing CHECK Constraint on processedAt/error State

**Status:** Invalidated
**Priority:** P3
**Date:** 2026-02-07

---

## Description

The `stripe_events` table uses two nullable columns (`processedAt` and `error`) to represent processing state:

| processedAt | error | Meaning |
|------------|-------|---------|
| NULL | NULL | Claimed, not yet processed |
| NOT NULL | NULL | Successfully processed |
| NOT NULL | NOT NULL | Processed with error |
| NULL | NOT NULL | Invalid state — should never occur |

There is no CHECK constraint preventing the invalid state (`processedAt IS NULL AND error IS NOT NULL`). While the application code never writes this combination, a manual query or future refactor could create inconsistent rows.

Additionally, there's no composite index on `(processedAt, error)` for efficiently querying stuck/failed events.

## Impact

- Database allows logically invalid state
- No efficient way to query "events that failed and need reprocessing"
- Low severity: application code correctly manages state, this is defense-in-depth

## Why This Is a False Positive

The state `processedAt IS NULL AND error IS NOT NULL` is **intentionally valid** — it represents a failed event eligible for retry:

- `drizzle-stripe-event-repository.ts:markFailed()` deliberately writes `{ processedAt: null, error }` so failed events remain in the retry pool
- `stripe-webhook-controller.ts` checks `processedAt !== null && error === null` for "successfully processed" skip; a failed event (`processedAt: null, error: non-null`) correctly falls through for retry
- Adding the proposed CHECK constraint would cause `markFailed()` to violate it, breaking retry semantics

## Related

- `db/schema.ts:167-183`
- `db/migrations/0006_mushy_ghost_rider.sql`
- `src/adapters/controllers/stripe-webhook-controller.ts:79`
- `src/adapters/repositories/drizzle-stripe-event-repository.ts:74`
