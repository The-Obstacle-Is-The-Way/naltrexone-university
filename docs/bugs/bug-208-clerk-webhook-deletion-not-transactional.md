# BUG-208: Clerk Webhook User Deletion Is Not Transactional

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

The `user.deleted` handler in `clerk-webhook-controller.ts:169-194` performs three sequential operations without a database transaction:
1. `findByClerkId` -- look up the internal user
2. `cancelStripeCustomerSubscriptions` -- cancel Stripe subscriptions via API
3. `deleteByClerkId` -- delete the user row

If step 2 succeeds but step 3 fails (e.g., DB connection drops), the user row remains in the database with canceled Stripe subscriptions, creating an inconsistent state.

## Impact

- Orphaned user rows with canceled subscriptions that cannot be cleaned up by retry (Stripe cancel is already done, but user row persists).
- On Clerk webhook retry, `cancelStripeCustomerSubscriptions` is called again for already-canceled subscriptions (mitigated by Stripe's idempotency, but wasteful).

## Location

- `src/adapters/controllers/clerk-webhook-controller.ts:169-194`

## Suggested Fix

Wrap the user lookup and deletion in a database transaction. The Stripe API call is inherently non-transactional, so the recommended pattern is:
1. Within a transaction: find user, mark for deletion (soft-delete or flag)
2. Outside transaction: cancel Stripe subscriptions
3. Within a transaction: hard-delete the user row

Or, accept the current behavior and add a reconciliation mechanism that detects orphaned users (users in DB but deleted in Clerk).

## Prevention

- Document multi-step webhook handlers and their failure modes.
- Consider adding a `user.deleted` reconciliation check to the existing Stripe reconciliation cron job.
