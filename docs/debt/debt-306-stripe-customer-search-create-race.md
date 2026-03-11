# DEBT-306: Stripe Customer Search/Create Race — Concurrent or Late-Visible Customers Can Violate the 1:1 Mapping

**Priority:** P2
**Created:** 2026-03-11
**Status:** Open
**Related:** ADR-005 (Payment Boundary / 1:1 Stripe customer mapping), BUG-106, BUG-117

---

## Context

`createStripeCustomer()` currently performs a Stripe-side search by `metadata.user_id`. If that search returns no matches, the adapter creates a new customer with deterministic idempotency key `create_stripe_customer:${userId}`.

That is safe for retrying the same logical create request, but it does not close the broader read-then-act race:

- another app request can create a Stripe customer for the same user between `customers.search` and `customers.create`
- an external actor can create a customer out of band
- Stripe Search can lag behind recent writes, so a just-created customer may not be visible yet

The result is that Stripe can end up with multiple customers carrying the same `metadata.user_id`, even though the local architecture expects a 1:1 mapping.

---

## Current Behavior

Today the adapter does this:

1. `customers.search` for `metadata['user_id']:'<userId>'`
2. If exactly one match exists, return it
3. If no match exists, `customers.create(...)`
4. If a later search finds `>1` matches, throw `ApplicationError('STRIPE_ERROR', 'Multiple Stripe customers found for this user')`

This means the flow only detects duplicates after they already exist. The local repository still enforces one mapping row per user, but Stripe can contain duplicate external customers for the same user, which can split billing history, portal state, or future operator workflows.

## Expected Behavior

The customer-creation flow should uphold the intended 1:1 mapping more strongly than Stripe Search alone can guarantee. A fix should:

1. Prevent concurrent in-app requests from creating multiple Stripe customers for one user
2. Avoid relying on eventually consistent Stripe Search as the sole duplicate-prevention mechanism
3. Provide a deterministic reconcile/adopt path when external state already exists, instead of discovering duplicates only after the fact

## Recommended Fix

The exact implementation is still open, but the fix should move duplicate prevention to a stronger coordination boundary than `customers.search` alone.

Possible directions include:

- claiming or reusing the local `StripeCustomerRepository` mapping before any Stripe create
- adding an application-level create-customer claim/lock keyed by internal user id
- reconciling/adopting an existing externally created Stripe customer deterministically when feasible

The deterministic Stripe idempotency key should stay in place, but it should not be treated as the only protection against duplicate customer creation.

## Test Plan

1. Add a concurrency test: two create-customer requests for the same user collapse to one external customer id
2. Add a test for externally pre-existing Stripe state that is not yet visible through Search lag: the flow should not create an avoidable duplicate
3. Preserve the current hard-failure path for genuinely ambiguous duplicate state when automatic reconciliation is not possible

## Risk

P2 because:

- The issue violates an explicit architecture invariant from ADR-005
- Duplicate Stripe customers are low-frequency but high-cost to clean up manually
- The failure mode is external data drift that can surface later in billing support, portal flows, or subscription recovery work

## Source

Tracer-bullet verification on 2026-03-11 during the Stripe mutation call-site sweep.
