# DEBT-538: Handled Clerk Events Grow Without Pruning, and Only the Owner Can Count Them

**Status:** Verifying — the census is recorded under both limits, so DEBT-449's Neon half moves to a Waiting row and the record closes; due 2026-11-25
**Priority:** P4
**Date:** 2026-11-20

---

## Summary

`clerk_events` keeps every handled `user.updated` and `user.deleted` delivery: the webhook ignores every other type (`src/adapters/controllers/clerk-webhook-controller.ts:220-222`). No production code prunes the table, so it grows with no sale needed. DEBT-449 parked automatic pruning until two consecutive monthly production censuses show it is needed. Only the owner can run that census, and none has been recorded. The records rules make a trigger that needs external data no session can check a Blocked record with a dated follow-up, so DEBT-449's Waiting row is carried here.

## Evidence

- No production code deletes from `clerk_events`: its repository only inserts and updates rows (`src/adapters/repositories/drizzle-clerk-event-repository.ts:15`, `:63`, `:75`).
- `pending_stripe_cancellations` references `clerk_events.id` with `onDelete: 'cascade'` (`db/schema.ts:595`), so deleting an event also deletes its pending cancellation.
- The 2026-11-15 queue review (#1704) could not check the census: no session can read the table, and no census is recorded. That day, Vercel's storage API reported `naltrexone-db` on Neon's Free plan with `usageQuotaExceeded: false` (DEBT-534).

## Impact

No harm is recorded. Until a prune ships, the table adds to Neon storage (DEBT-534).

## Options

1. **Monthly owner censuses until DEBT-449's trigger fires.** Chosen: DEBT-449 parked the prune on this trigger. Narrowed on 2026-11-21 to one census unless it reaches 100,000 handled rows or 100 MB (below).
2. Build the prune now. Not chosen: DEBT-449 parked it.

## Resolution (decided)

- The census is the owner's, since no session can read the table, and the records rules give it a due date. The owner runs this read-only query against production, then records both numbers and the date here: `SELECT count(*) FILTER (WHERE processed_at IS NOT NULL), pg_total_relation_size('clerk_events') FROM clerk_events`. Each census that continues them sets the next one's due date, a month later, in the status.
- DEBT-449's trigger fires when either holds:
  - two consecutive monthly censuses show at least 1,000,000 handled rows (the query's first count) or 1 GiB for the table and its indexes;
  - Neon reports backup, storage or latency impact attributable to the table. #1704 (DEBT-533) named Neon's storage page and spend alert (DEBT-534) as where that shows.
- **Decided 2026-11-21 at the owner's delegation: one census, unless it reaches 100,000 handled rows or 100 MB.** The first census runs with DEBT-503's usage-row read, which is due the same day. If it shows under 100,000 handled rows and under 100 MB, the owner declines further censuses, and this record closes. That drops the census half of DEBT-449's trigger, which needs two consecutive censuses. Its other half moves unchanged to a Waiting row: Neon reports backup, storage or latency impact attributable to the table, read on Neon's storage page and spend alert (DEBT-534). Otherwise the monthly censuses continue.
- **The census, 2026-11-24:** 0 handled rows, and 32,768 bytes for the table and its indexes, far under 100,000 rows and 100 MB. So, as decided on 2026-11-21, further censuses are declined. At the owner's request, an agent ran the query above in a read-only transaction against production's database, after checking that the connection's host was production's, not Preview's.
- When it fires, the prune goes back to direction review before it is built (DEBT-449). A revived design must:
  - preserve unresolved outcomes;
  - exclude any event with an outstanding `pending_stripe_cancellations` child;
  - not age-delete a customer-cleanup obligation;
  - respect BUG-246's cascade and prune-horizon constraint.

## Verification

- [x] The trigger fires, and the prune's direction review opens as its own record; or the owner declines further censuses, and DEBT-449's Neon half becomes a Waiting row. Done 2026-11-24: the census was under both limits, so further censuses are declined, and the Neon half moves to a Waiting row with the prune's constraints.

## Related

- DEBT-449 (closed): parked the prune on this trigger. Its final text, reached through its ledger line, holds the full constraints.
- DEBT-533 (closed in #1704): added Neon's storage page and spend alert as evidence.
- DEBT-534: Neon's plan, storage page and spend alert.
- BUG-246 (closed): the cascade and prune-horizon constraint.

Corrected 2026-11-21: decided at the owner's delegation that one census under 100,000 handled rows and 100 MB ends the monthly censuses, dropping the census half of DEBT-449's trigger and keeping its Neon half; the census moves to 11-22, beside DEBT-503's read.

Corrected 2026-11-24: the census is recorded. An agent ran it at the owner's request, so "only the owner can" no longer holds.
