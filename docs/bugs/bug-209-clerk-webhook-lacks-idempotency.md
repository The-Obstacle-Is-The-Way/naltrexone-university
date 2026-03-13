# BUG-209: Clerk Webhook Handler Lacks Event Deduplication

**Status:** Open
**Priority:** P3 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

Unlike the Stripe webhook handler (which uses `stripeEvents.claim()` + `stripeEvents.lock()` with `SELECT ... FOR UPDATE` for idempotent event processing), the Clerk webhook handler has no event deduplication mechanism.

## Verification Notes

Tracer-bullet verification confirmed the missing dedup but also confirmed **both Clerk paths are naturally idempotent**:

- **`user.updated`:** Uses `upsertByClerkId` which is `INSERT ... ON CONFLICT DO UPDATE` with a `GREATEST(updatedAt)` guard. Replaying the same event is a no-op.
- **`user.deleted`:** Has `if (!user) return` guard at line 181. On retry after successful deletion, the handler returns early. Stripe cancellation is also idempotent (skips already-canceled subscriptions, uses per-subscription idempotency keys).
- **Concurrent delivery edge case:** Two simultaneous `user.deleted` events could both find the user, both attempt Stripe cancel (safe), both attempt delete (second is a no-op). No data corruption.

This is a **defense-in-depth gap** (asymmetry vs. the Stripe handler) rather than an active bug.

## Location

- `app/api/webhooks/clerk/handler.ts:100-114` -- no dedup before calling `processClerkWebhook`
- `src/adapters/controllers/clerk-webhook-controller.ts` -- no event ID tracking

## Suggested Fix

Add a `clerk_events` table (analogous to `stripe_events`) to track processed Clerk webhook event IDs. Use the same `claim/lock` pattern. Clerk webhooks include an `id` field in the Svix envelope that can serve as the deduplication key.
