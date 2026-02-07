# DEBT-155: Stripe Legacy Duplicate Subscription Reconciliation

**Status:** Open
**Priority:** P1
**Date:** 2026-02-07

---

## Description

Checkout is now guarded against creating new duplicates, but existing Stripe customers may already have multiple active/trialing subscriptions from legacy behavior.

This is operational debt: we need a repeatable reconciliation process to detect and remediate duplicate paid subscriptions already present in Stripe.

## Impact

- Users can be billed multiple times for the same product until duplicates are canceled.
- Support/refund workload increases.
- Trust and billing correctness are at risk even after code-level prevention is fixed.

## Resolution

1. Build and run a one-time reconciliation workflow for Stripe test + production:
   - Find customers with more than one blocking subscription (`active`, `trialing`, `past_due`, `unpaid`, `incomplete`, `paused`).
   - Keep the canonical subscription per customer and cancel extras safely.
2. Record an audit trail (customer id, canceled subscription ids, timestamp, operator).
3. Backfill/verify local `stripe_subscriptions` rows align with canonical Stripe state after reconciliation.

## Verification

- [ ] Reconciliation run completed in Stripe test mode
- [ ] Reconciliation run completed in Stripe production mode
- [ ] Spot-check billing portal for affected users shows one current subscription
- [ ] No duplicate-billing support incidents after rollout window

## Related

- `docs/_archive/bugs/bug-101-stripe-checkout-allows-duplicate-subscriptions-when-db-stale.md`
- `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`
