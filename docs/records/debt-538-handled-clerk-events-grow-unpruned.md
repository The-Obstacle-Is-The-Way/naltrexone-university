# DEBT-538: Handled Clerk Events Grow Without Pruning, and Only the Owner Can Count Them

**Status:** Blocked — the owner runs the read-only `clerk_events` census and records its two counts; due 2026-12-01
**Priority:** P4
**Date:** 2026-11-20

---

## Summary

`clerk_events` keeps every handled `user.updated` and `user.deleted` delivery. Nothing prunes the table, so it grows with no sale needed. DEBT-449 deferred a prune to a trigger, and that trigger rests on a census of the table that only the owner can run. No census has been recorded. The records rules make a trigger that needs external data no session can check a Blocked record with a dated follow-up, so DEBT-449's Waiting row is carried here.

## Evidence

- No code deletes from `clerk_events`: its repository only inserts and updates rows (`src/adapters/repositories/drizzle-clerk-event-repository.ts:15`, `:63`, `:75`).
- `pending_stripe_cancellations` references `clerk_events.id` with `onDelete: 'cascade'` (`db/schema.ts:595`), so deleting an event also deletes its pending cancellation.
- The 2026-11-15 queue review (#1704) could not check the census: no session can read the table, and no census is recorded. That day, Vercel's storage API reported `naltrexone-db` on Neon's Free plan with `usageQuotaExceeded: false` (DEBT-534).

## Impact

No harm is recorded. Until a prune ships, the table adds to Neon storage (DEBT-534).

## Options

1. **A monthly owner census, with the prune built when the trigger below fires.** Chosen: this is DEBT-449's decided trigger.
2. Build the prune now. Not chosen: DEBT-449 deferred it to the trigger.

## Resolution (decided)

- The owner runs this read-only query against production, then records both numbers and the date here: `SELECT count(*) FILTER (WHERE processed_at IS NOT NULL), pg_total_relation_size('clerk_events') FROM clerk_events`. The next census is due a month later.
- Build the prune when either of these holds:
  - two monthly censuses show at least 1,000,000 processed rows or 1 GiB;
  - Neon's storage page or spend alert (DEBT-534) attributes growth to the table.
- The prune must skip events that still own a `pending_stripe_cancellations` row.

## Verification

- [ ] The first census's two counts and date are recorded here.

## Related

- DEBT-449 (closed): the deferred prune and its trigger, carried here from its Waiting row.
- DEBT-534: Neon's plan, storage page and spend alert.
