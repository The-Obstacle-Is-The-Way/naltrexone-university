# DEBT-168: Stripe Events Table Missing CHECK Constraint on processedAt/error State

**Status:** Open
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

## Resolution

1. Add CHECK constraint: `CHECK (NOT (processed_at IS NULL AND error IS NOT NULL))`
2. Consider partial index: `CREATE INDEX ON stripe_events (type) WHERE processed_at IS NULL` for efficient event reprocessing queries

## Verification

- [ ] Migration adding CHECK constraint
- [ ] Optional: partial index for unprocessed events
- [ ] Existing data validated against constraint before migration

## Related

- `db/schema.ts:167-183`
- `db/migrations/0006_mushy_ghost_rider.sql`
- `src/adapters/controllers/stripe-webhook-controller.ts:79`
