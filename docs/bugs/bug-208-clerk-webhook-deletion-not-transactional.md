# BUG-208: Clerk Webhook User Deletion Is Not Transactional

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

The `user.deleted` flow in `processClerkWebhook()` reads the local Stripe customer mapping before it deletes the user, but it does so without any transaction or row-level deletion barrier. A concurrent Stripe sync can insert `stripe_customers` and `stripe_subscriptions` for that user after the lookup and before the delete. The delete then cascades those new local rows away without ever canceling the remote Stripe subscription.

## Verification Notes

Tracer-bullet verification confirmed a real race:

1. **The `user.deleted` flow is a read-then-delete sequence with no lock:** `src/adapters/controllers/clerk-webhook-controller.ts:180-193` does `findByClerkId(...)`, then `stripeCustomerRepository.findByUserId(user.id)`, then optional `cancelStripeCustomerSubscriptions(...)`, then `deleteByClerkId(...)`.
2. **Two live code paths can create Stripe linkage after that read:** `src/adapters/controllers/stripe-webhook-controller.ts:90-99` inserts `stripe_customers` and `stripe_subscriptions` inside its transaction, and `app/(marketing)/checkout/success/checkout-success-sync.tsx:235-246` does the same during checkout-success sync.
3. **The later user delete removes those new local rows atomically:** `src/adapters/repositories/drizzle-user-repository.ts:124-129` deletes the user row, and `db/schema.ts:124-142` plus `db/schema.ts:145-173` define `onDelete: 'cascade'` for both `stripe_customers.userId` and `stripe_subscriptions.userId`.
4. **Recovery does not exist after that interleaving:** the reconciliation entrypoint only enumerates surviving local `stripe_subscriptions` rows in `app/api/cron/reconcile-stripe-subscriptions/route.ts:149-175`, and `src/adapters/jobs/reconcile-stripe-subscriptions.ts:64-67` begins from that local row set. Once the cascade removes those rows, reconciliation has nothing left to discover or cancel.
5. **Existing integration coverage does not disprove the race:** `tests/integration/controllers.integration.test.ts:875-915` verifies the happy path where the Stripe mapping already exists before `user.deleted` runs; it does not exercise the concurrent-after-read interleaving.
6. **The current invalidation rationale only covers a narrower case:** cancel-before-delete ordering and idempotent retry behavior do make already-observed Stripe cancellations safe, but they do not protect against a Stripe mapping that appears after the webhook's lookup and before its delete.

## Impact

- A deleted Clerk user can retain an active remote Stripe customer/subscription with no remaining local mapping.
- Subsequent Clerk retries can no longer repair the state once the user row is gone.
- Reconciliation cannot repair it either, because it scans local subscription rows only.

## Precise TDD Fix

1. Add a failing regression around `processClerkWebhook()` proving this interleaving:
   - `user.deleted` reads `findByUserId(...)` and sees no Stripe customer
   - a concurrent Stripe sync inserts `stripe_customers` and `stripe_subscriptions` for the same user
   - `user.deleted` proceeds to delete the user
   - no cancellation is attempted, the local Stripe rows are cascaded away, and the race is observable
2. Introduce a deletion barrier around the user row before the Stripe-customer lookup. A transaction that locks the user row (`SELECT ... FOR UPDATE` or equivalent) is one workable design.
3. Run the `user.deleted` flow through that barrier so concurrent Stripe sync paths cannot insert `stripe_customers` / `stripe_subscriptions` between the lookup and the delete.
4. Add a follow-up regression proving the concurrent Stripe sync now blocks or fails until the delete path finishes instead of being inserted and silently cascaded away.
