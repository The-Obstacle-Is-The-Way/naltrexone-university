# BUG-208: Clerk Webhook User Deletion Is Not Transactional

**Status:** Invalidated (false positive)
**Priority:** ~~P2~~ N/A
**Date:** 2026-03-13

## Summary

The `user.deleted` handler in `clerk-webhook-controller.ts:169-194` performs three sequential operations without a database transaction: find user, cancel Stripe subscriptions, delete user.

## Invalidation Reason

**Tracer-bullet verification revealed CASCADE constraints and idempotent Stripe cancellation make this safe.**

1. **`ON DELETE CASCADE` on all FK references:** The schema in `db/schema.ts` shows every table referencing `users.id` uses `onDelete: 'cascade'` -- including `stripe_customers`, `stripe_subscriptions`, `attempts`, `bookmarks`, `practice_sessions`, and `idempotency_keys`. When `deleteByClerkId` executes, PostgreSQL cascades the delete atomically.

2. **Stripe cancellation is gracefully idempotent:** `cancelStripeCustomerSubscriptions` in `stripe-subscription-canceler.ts` skips already-canceled subscriptions (checks `canceled`/`incomplete_expired` status), catches `isAlreadyCanceledError` and logs as info, and uses per-subscription idempotency keys.

3. **Retry behavior is safe:** If `deleteByClerkId` fails after Stripe cancellation, Clerk retries, user is found again, Stripe cancel is idempotent (no-op), and delete retries. If the user IS deleted but Stripe cancel failed, the cascade already cleaned up `stripe_customers` rows, and the Stripe subscriptions will be caught by the existing reconciliation cron job.

The "orphaned data" concern is unfounded given the CASCADE constraints.
