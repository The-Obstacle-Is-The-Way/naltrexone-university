# BUG-209: Clerk Webhook Replay Gap Can Recreate Deleted Users

**Status:** Resolved
**Priority:** P2
**Date:** 2026-03-13

## Summary

The Clerk webhook path used to discard the Svix delivery ID at the route boundary, never claim or lock deliveries before processing, and never persist any deletion tombstone. That allowed the sequence `user.updated -> user.deleted -> replay old user.updated` to recreate a deleted local user.

This is now fixed.

## Implemented Fix

1. **The route boundary now preserves the replay key.** `app/api/webhooks/clerk/route.ts:13-30` extracts `svix-id` (with a payload `id` fallback) and passes it into the local `ClerkWebhookEvent`.
2. **The local event contract now requires that replay key.** `src/adapters/controllers/clerk-webhook-controller.ts:11-15` defines `eventId` on the controller input type.
3. **The Clerk controller now mirrors Stripe-style event dedup.** `src/adapters/controllers/clerk-webhook-controller.ts:173-195` performs `claim() -> peek() -> lock()` before business logic, and `:279-280` records failure state with `markFailed(...)` on errors.
4. **Webhook event state now has first-class persistence.** `db/schema.ts:199-215` defines `clerk_events`, and `src/adapters/repositories/drizzle-clerk-event-repository.ts:13-81` implements claim/peek/lock/markProcessed/markFailed against it.
5. **Deletion tombstones now prevent both replayed and in-flight stale recreations.** `db/schema.ts:217-229` defines `deleted_clerk_users`, `src/adapters/repositories/drizzle-deleted-clerk-user-repository.ts:11-29` implements it, `src/adapters/controllers/clerk-webhook-controller.ts:216-218` short-circuits `user.updated` when a tombstone already exists, `:236-244` re-checks tombstone state after the upsert to close the `READ COMMITTED` interleaving where `user.deleted` commits between the pre-check and the upsert, and `:258-277` writes the tombstone after successful delete processing.

## Verification Notes

1. **Controller regressions now cover all three recreation paths.** `src/adapters/controllers/clerk-webhook-controller.test.ts:439-474` proves replaying the same `user.updated` delivery no longer recreates the user, `:476-529` proves later stale `user.updated` deliveries are ignored after deletion, and `:531-589` proves a delete that commits between the tombstone pre-check and the upsert still leaves the user deleted.
2. **The new event repo is covered directly.** `src/adapters/repositories/drizzle-clerk-event-repository.test.ts:7-100` verifies claim, peek, lock, and processed/failed state transitions.
3. **The new tombstone repo is covered directly.** `src/adapters/repositories/drizzle-deleted-clerk-user-repository.test.ts:6-60` verifies existence checks and idempotent tombstone writes.
4. **The real DB-backed replay path is covered end-to-end.** `tests/integration/controllers.integration.test.ts:982-1049` proves `user.updated`, then `user.deleted`, then replay of the original `user.updated` leaves the user deleted and the tombstone intact.

## Outcome

Clerk webhook deliveries are now deduplicated at the event level, and deletion is a terminal state for a Clerk user ID. Exact replay deliveries short-circuit on `clerk_events`, later stale `user.updated` deliveries are rejected by `deleted_clerk_users`, and even the `READ COMMITTED` interleaving where delete commits between the tombstone check and the upsert now self-heals before the update transaction commits.
