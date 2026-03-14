# BUG-208: Clerk Webhook User Deletion Is Not Transactional

**Status:** Resolved
**Priority:** P2
**Date:** 2026-03-14

## Summary

The `user.deleted` flow used to read the local Stripe customer mapping and later delete the user without any row-level barrier. That allowed a concurrent Stripe sync to insert `stripe_customers` / `stripe_subscriptions` after the lookup and before the delete, so the delete could cascade away fresh local billing rows without ever canceling the remote subscription.

This is now fixed.

## Implemented Fix

1. **The Clerk webhook path now runs through an explicit transaction seam.** `src/adapters/controllers/clerk-webhook-controller.ts:17-31` defines the transaction contract, and `app/api/webhooks/clerk/route.ts:43-52` wires tx-scoped repositories from the composition root.
2. **`user.deleted` now acquires a user-row deletion barrier before the Stripe lookup.** `src/adapters/controllers/clerk-webhook-controller.ts` locks the user row with `lockByClerkId(...)`, reads the Stripe customer mapping behind that barrier, deletes the user, and writes the Clerk deletion tombstone in the same transaction.
3. **Stripe cancellation now runs after the DB commit through durable pending state.** `src/adapters/controllers/clerk-webhook-controller.ts`, `src/application/ports/pending-stripe-cancellation-repository.ts`, and `src/adapters/repositories/drizzle-pending-stripe-cancellation-repository.ts` persist the `stripeCustomerId` by Clerk event id before commit, then cancel Stripe only after the local delete transaction succeeds. Retries reuse that persisted mapping even after the user row and cascaded Stripe rows are gone.
4. **The user repository still supplies the row lock that closes the original race.** `src/adapters/repositories/drizzle-user-repository.ts` uses `SELECT ... FOR UPDATE`, which blocks concurrent child-row inserts that need a key-share lock on the same parent user row.
5. **The schema-level cascade remains the cleanup mechanism after the guarded delete.** `db/schema.ts` still cascades `stripe_customers` and `stripe_subscriptions` from the user row, but the new lock closes the original insert-after-lookup race and the durable pending cancellation row prevents losing the Stripe customer id on retries.

## Verification Notes

1. **The controller regression now proves the race is blocked in fake-driven TDD.** `src/adapters/controllers/clerk-webhook-controller.test.ts:378-437` simulates a Stripe mapping appearing immediately after the lookup and verifies the insert is blocked instead of becoming an orphan.
2. **The repository lock is covered directly.** `src/adapters/repositories/drizzle-user-repository.test.ts:86-119` verifies `lockByClerkId(...)` returns the locked row and issues `FOR UPDATE`.
3. **The real Postgres path is covered end-to-end for both success and retry.** `tests/integration/controllers.integration.test.ts` verifies `user.deleted` still cancels Stripe, deletes the user, cascades billing rows, persists the Clerk event, and writes the deletion tombstone; it also proves a failed post-commit Stripe cancellation leaves the local delete committed and is drained correctly on replay.
4. **The fix shipped with the schema migrations required for the new Clerk webhook state.** `db/migrations/0015_certain_captain_universe.sql` creates the original `clerk_events` / `deleted_clerk_users` state, and `db/migrations/0016_odd_gressill.sql` adds the durable `pending_stripe_cancellations` table used by the post-commit retry path.

## Outcome

Concurrent Stripe sync paths can no longer insert local billing rows between the Clerk delete lookup and the user delete. The local delete commits atomically behind the user-row barrier, and Stripe cancellation now happens after commit with durable retry state, so the controller no longer couples remote side effects to an open DB transaction.
