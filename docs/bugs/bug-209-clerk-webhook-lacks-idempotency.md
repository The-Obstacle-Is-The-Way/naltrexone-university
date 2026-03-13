# BUG-209: Clerk Webhook Replay Gap Can Recreate Deleted Users

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

Unlike the Stripe webhook path, the Clerk webhook path never claims or records webhook deliveries before processing and never leaves any deletion tombstone behind. That means the sequence `user.updated` -> `user.deleted` -> replay of the same old `user.updated` recreates a fresh local user row after deletion.

## Verification Notes

Tracer-bullet verification confirmed the replay gap and the concrete failure mode:

1. **The Clerk route never deduplicates before processing.** `app/api/webhooks/clerk/handler.ts:86-116` verifies the webhook and calls `processClerkWebhook(...)`, but there is no `claim()` / `lock()` / `markProcessed()` step analogous to the Stripe path.
2. **The local type drops the event envelope ID at the boundary.** `src/adapters/controllers/clerk-webhook-controller.ts:9-12` defines `ClerkWebhookEvent` as only `{ type, data }`, and `app/api/webhooks/clerk/route.ts:13-16` narrows Clerk's verified output into that local type. Even if the verified Clerk/Svix payload carries an event ID, this adapter boundary does not preserve it.
3. **The Stripe webhook path does implement event-level dedup.** `src/adapters/controllers/stripe-webhook-controller.ts:67-112` uses `stripeEvents.claim()` and `stripeEvents.lock()`, and `src/adapters/repositories/drizzle-stripe-event-repository.ts:13-21` plus `40-57` persist and row-lock the event record.
4. **`user.updated` only behaves idempotently while the row still exists.** `src/adapters/controllers/clerk-webhook-controller.ts:159-165` passes Clerk's observed timestamp into `userRepository.upsertByClerkId(...)`, and `src/adapters/repositories/drizzle-user-repository.ts:61-80` only updates the row when the incoming `observedAt` is newer. Existing coverage at `src/adapters/controllers/clerk-webhook-controller.test.ts:41-68` proves an older replay cannot overwrite newer data when the user row is still present.
5. **`user.deleted` removes the only state that prevents that replay from inserting again.** `src/adapters/controllers/clerk-webhook-controller.ts:180-193` looks up the user and then calls `deleteByClerkId(...)`. `src/adapters/repositories/drizzle-user-repository.ts:122-129` hard-deletes the row; it does not leave behind any tombstone, processed-event marker, or deleted-at state for that Clerk user ID.
6. **After delete, replaying the old `user.updated` falls back to the insert path.** `src/adapters/repositories/drizzle-user-repository.ts:64-89` inserts when no `clerkUserId` row exists. A tracer-bullet executable repro with the existing fake repositories confirmed `user.updated -> user.deleted -> replay same user.updated` recreates a new local user row with a new local ID.
7. **Current tests do not cover post-delete replay.** The existing Clerk controller tests only cover older-update ordering and the happy-path / missing-user delete cases at `src/adapters/controllers/clerk-webhook-controller.test.ts:41-68` and `140-166`.

This is a **real replay bug**, not just a symmetry gap with the Stripe webhook path.

## Impact

- A replayed stale `user.updated` can recreate a local user after `user.deleted`, violating the intended terminal semantics of account deletion.
- The recreated user gets a fresh local ID, so the system can silently reintroduce local state for an account that was already deleted.
- The current adapter boundary would need to change before true transport-level dedup can be added, because the event ID is not presently preserved.

## Precise TDD Fix

1. Add a failing regression that processes a valid `user.updated`, then `user.deleted`, then replays the same old `user.updated`, and assert that `findByClerkId(...)` still returns `null`.
2. Extend the route/controller boundary so a transport replay key survives verification instead of being discarded; extracting a request header such as `svix-id` at the route boundary is the correct shape.
3. Add a `clerk_events` table + repository with claim/mark-processed semantics analogous to the Stripe webhook path so exact delivery replays are short-circuited before business logic runs.
4. Persist terminal deletion state for deleted Clerk user IDs, or an equivalent tombstone, so post-delete `user.updated` deliveries are ignored instead of recreating deleted users.
