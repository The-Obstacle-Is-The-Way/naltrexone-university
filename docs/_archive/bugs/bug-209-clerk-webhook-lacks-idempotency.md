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
5. **Deletion is now serialized per Clerk user ID before either branch touches local state.** `db/schema.ts:217-229` defines `deleted_clerk_users`, `src/adapters/repositories/drizzle-deleted-clerk-user-repository.ts:11-32` now acquires a transaction-scoped advisory lock per `clerkUserId`, `src/adapters/controllers/clerk-webhook-controller.ts:215-255` takes that lock before `user.updated` checks tombstones or upserts, and `:267-294` takes the same lock before `user.deleted` decides whether a local user exists and then writes the tombstone. The post-upsert tombstone re-check remains as a safety net inside the same critical section.

## Verification Notes

1. **Controller regressions now cover all four recreation paths.** `src/adapters/controllers/clerk-webhook-controller.test.ts:603-638` proves replaying the same `user.updated` delivery no longer recreates the user, `:640-693` proves later stale `user.updated` deliveries are ignored after deletion, `:695-753` proves a delete that commits between the tombstone pre-check and the upsert still leaves the user deleted, and `:755-840` proves `user.deleted` can no longer read "no user" and then write a tombstone after a concurrent `user.updated` commits.
2. **The new event repo is covered directly.** `src/adapters/repositories/drizzle-clerk-event-repository.test.ts:7-100` verifies claim, peek, lock, and processed/failed state transitions.
3. **The new tombstone repo is covered directly.** `src/adapters/repositories/drizzle-deleted-clerk-user-repository.test.ts:6-60` verifies existence checks and idempotent tombstone writes.
4. **The real DB-backed delete/update races are covered end-to-end.** `tests/integration/controllers.integration.test.ts:1023-1149` proves a concurrent `user.updated` / `user.deleted` pair still leaves the user deleted, and `:1151-1218` proves `user.updated`, then `user.deleted`, then replay of the original `user.updated` still leaves the tombstone intact.

## Outcome

Clerk webhook deliveries are now deduplicated at the event level, and deletion is a terminal state for a Clerk user ID. Exact replay deliveries short-circuit on `clerk_events`, later stale `user.updated` deliveries are rejected by `deleted_clerk_users`, and concurrent `user.updated` / `user.deleted` processing is serialized per `clerkUserId` so delete cannot observe "no user" and then leave behind a live row plus tombstone.
