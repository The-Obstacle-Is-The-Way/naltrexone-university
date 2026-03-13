# BUG-209: Clerk Webhook Handler Lacks Event Deduplication

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

Unlike the Stripe webhook handler (which uses `stripeEvents.claim()` + `stripeEvents.lock()` with `SELECT ... FOR UPDATE` for idempotent event processing), the Clerk webhook handler has no event deduplication mechanism. If Clerk retries a webhook event (due to timeout, 5xx response, or network failure), the handler processes it again from scratch.

## Impact

- `user.deleted` retries trigger redundant Stripe API calls to cancel already-canceled subscriptions.
- `user.updated` retries perform redundant upserts (functionally idempotent due to upsert semantics, but wasteful).
- No protection against concurrent processing of the same event from multiple webhook deliveries.

## Location

- `app/api/webhooks/clerk/handler.ts:100-114` -- no dedup before calling `processClerkWebhook`
- `src/adapters/controllers/clerk-webhook-controller.ts` -- no event ID tracking

## Suggested Fix

Add a `clerk_events` table (analogous to `stripe_events`) to track processed Clerk webhook event IDs. Use the same `claim/lock` pattern the Stripe handler uses. Clerk webhooks include an `id` field in the Svix envelope that can serve as the deduplication key.

## Prevention

- All webhook handlers should follow the same idempotency pattern established by the Stripe webhook handler.
