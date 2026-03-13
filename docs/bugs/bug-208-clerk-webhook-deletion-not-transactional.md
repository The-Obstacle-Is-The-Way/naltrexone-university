# BUG-208: Clerk Webhook User Deletion Is Not Transactional

**Status:** Resolved
**Priority:** P2
**Date:** 2026-03-13

## Summary

The `user.deleted` flow used to read the local Stripe customer mapping and later delete the user without any row-level barrier. That allowed a concurrent Stripe sync to insert `stripe_customers` / `stripe_subscriptions` after the lookup and before the delete, so the delete could cascade away fresh local billing rows without ever canceling the remote subscription.

This is now fixed.

## Implemented Fix

1. **The Clerk webhook path now runs through an explicit transaction seam.** `src/adapters/controllers/clerk-webhook-controller.ts:17-31` defines the transaction contract, and `app/api/webhooks/clerk/route.ts:43-52` wires tx-scoped repositories from the composition root.
2. **`user.deleted` now acquires a user-row deletion barrier before the Stripe lookup.** `src/adapters/controllers/clerk-webhook-controller.ts:258-273` locks the user row with `lockByClerkId(...)`, then reads the Stripe customer mapping, optionally cancels remote subscriptions, and only then deletes the user.
3. **The user repository now exposes a real row lock.** `src/adapters/repositories/drizzle-user-repository.ts:56-68` uses `SELECT ... FOR UPDATE`, which blocks concurrent child-row inserts that need a key-share lock on the same parent user row.
4. **The schema-level cascade remains the cleanup mechanism after the guarded delete.** `db/schema.ts:106-178` still cascades `stripe_customers` and `stripe_subscriptions` from the user row, but the new lock closes the race window that previously let fresh billing rows appear after the lookup.

## Verification Notes

1. **The controller regression now proves the race is blocked in fake-driven TDD.** `src/adapters/controllers/clerk-webhook-controller.test.ts:378-437` simulates a Stripe mapping appearing immediately after the lookup and verifies the insert is blocked instead of becoming an orphan.
2. **The repository lock is covered directly.** `src/adapters/repositories/drizzle-user-repository.test.ts:86-119` verifies `lockByClerkId(...)` returns the locked row and issues `FOR UPDATE`.
3. **The real Postgres path is covered end-to-end.** `tests/integration/controllers.integration.test.ts:900-979` verifies `user.deleted` still cancels Stripe, deletes the user, cascades billing rows, persists the Clerk event, and writes the deletion tombstone.
4. **The fix shipped with the schema migration required for the new Clerk webhook state.** `db/migrations/0015_certain_captain_universe.sql` creates the supporting `clerk_events` / `deleted_clerk_users` tables that the new transactional Clerk flow uses.

## Outcome

Concurrent Stripe sync paths can no longer insert local billing rows between the Clerk delete lookup and the user delete. The remote-cancel decision and the delete now run behind a user-row barrier, which closes the orphaned-billing race that originally filed this bug.
