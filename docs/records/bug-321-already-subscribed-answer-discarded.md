# BUG-321: Stripe's "Already Subscribed" Answer Is Discarded for Signed-In Users

**Status:** Open — add one provider-contract case that runs `listStripeBlockingCustomerSubscriptions` against Stripe TEST; due 2026-11-29
**Priority:** P2
**Date:** 2026-10-05

---

## Summary

When Stripe held a subscription that our database did not, a signed-in user who pressed "Start free trial" or "Subscribe" landed back on the same pricing page with no message. The Stripe adapter refused to create a second Checkout, and the page ignored that refusal. If our database never learned of the subscription, a paying person had no access and no route to the billing portal.

The fix is in production. One provider-contract case remains.

## Evidence

- The adapter refused with `ALREADY_SUBSCRIBED` when the customer held a live subscription, and the action redirected to `/pricing?reason=manage_billing`.
- For signed-in users the page took its state from the database and ignored the URL's reason, as BUG-275's fix intended, so it also discarded a fresh refusal from Stripe.
- The database falls behind Stripe when a first subscriber's success-page sync did not run and the webhook is slow or failing, for seconds while a trial converts, or after a missed renewal webhook. The daily reconcile walks only existing rows, so a subscription never recorded is never repaired.

## Impact

Usually, the page looped with no explanation for seconds or minutes. In the worst case, a paying subscriber had no access and no way to manage billing until someone repaired the record by hand.

## Options

1. Honor the URL's `reason` again. Rejected: it reopens BUG-275.
2. On `ALREADY_SUBSCRIBED`, sync that customer's subscriptions from Stripe before redirecting.
3. Show a one-time notice with a portal link.

## Resolution (decided)

Option 2, with option 3's notice when the sync fails. Shipped 2026-10-06; ADR-014's amendment of that date records it.
- Only the gateway's `ALREADY_SUBSCRIBED` runs the sync (`src/application/use-cases/create-checkout-session.ts:184-214`), which then rethrows the refusal. A failed sync logs and raises `checkout_stripe_holds_unrecorded`.
- The adapter, `listStripeBlockingCustomerSubscriptions` (`src/adapters/gateways/stripe/stripe-customer-subscriptions.ts:31-75`), lists the customer's subscriptions with `status: 'all'`, retrieves and normalizes each blocking one, and refuses one under another customer. It only reads.
- The sync (`src/application/shared/sync-customer-subscription.ts`) records the canonical subscription through `persistSubscriptionObservation`, and refuses any subscription that is not the signed-in user's.
- The action redirects to `/pricing?checkout=already_subscribed`. The page shows the database's state, and a still-unentitled user sees a notice with a Manage billing button. BUG-275's stale-link protection stays.

**Remaining: the provider-contract case.** Decided 2026-11-15 by the reviewing session, at the owner's delegation; the earlier proposal to decline it is withdrawn. ADR-025 decision 3 tests adapter behavior against real infrastructure (`docs/adr/adr-025-test-doubles-by-shape-or-behaviour.md:21`). Contract scenario 5 proves Stripe's list and retrieve, but not the adapter's own list, filter, retrieve and customer check run together against Stripe.
- **The seam.** The adapter takes a whole `StripeClient` but reads only `subscriptions`. Narrow its `stripe` input to `StripeSubscriptionsClient` (`src/adapters/shared/stripe-types.ts:325`), which the normalizer already takes, so the case passes `{ subscriptions: harness.subscriptions }` with no cast.
- **The case.** Add a title to `tests/shared/stripe-checkout-client-contract-cases.ts` and its body to `tests/shared/stripe-checkout-client-contract.ts`, so it runs against both the fake and Stripe TEST. Seed an active and a canceled subscription on the harness customer (`seedSubscription`, `seedCanceledSubscription`), then call the adapter with that customer and the harness price (`subscriptionParams.line_items[0].price`) as the monthly price ID. Expect exactly one observation: the active subscription's ID, the customer, the user from its `metadata.user_id`, and plan `monthly`; the canceled one is left out.
- The fake half's seeded active subscription (`src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client-contract.test.ts:30-47`) lacks fields the normalizer's schema requires, `cancel_at_period_end`, `start_date` and `billing_cycle_anchor` (`src/adapters/gateways/stripe/stripe-webhook-schemas.ts:28-43`). Add them there, as Stripe returns them: that divergence is what the case exists to find.
- Prove it bites: dropping the blocking filter or the customer check fails the case.
- The sync's write is not part of the case: it goes through `persistSubscriptionObservation`, the webhook's and reconcile's writer, proven against Postgres.

## Verification

- [x] Use case, sync, adapter and page tests, red first, over the fake gateway and the contracted `FakeStripeCheckoutClient`: a refusal with no local row syncs and shows the user subscribed; a failed sync still shows the notice and portal link; BUG-275's stale-link case still shows the database's state.
- [ ] The new contract case passes in Stripe TEST. The runner requires every listed title (`scripts/test-lanes/run-stripe-provider-contracts.ts:25-28`), so the `Stripe provider contracts` workflow (`.github/workflows/stripe-trial-clock-smoke.yml`, Sundays 07:17 UTC, or a manual dispatch) must log `executed=15 passed=15 skipped=0`; it logged 14 of 14 on 2026-11-15. Then this record closes as Resolved.
- **Known limit.** A failed sync in production raises `checkout_stripe_holds_unrecorded`, a count only; its IDs live in Vercel Hobby's one-hour logs.

Corrected 2026-11-15: the lapsed 2026-10-20 test is kept and made builder-ready (reviewing session; the proposal to decline it is withdrawn), with a new due date of 2026-11-29. Finished build history and the pre-fix line references are in git at 34d9aea0.

## Related

- BUG-275 (closed): the stale-return-link fix this preserves.
- DEBT-501: the same hunt; its item 8 (Won't Fix) would have paged this listing.
