# BUG-321: Stripe's "Already Subscribed" Answer Is Discarded for Signed-In Users

**Status:** Verifying — the scheduled Stripe provider contracts run on `main` logs `executed=16 passed=16 skipped=0`; due 2026-11-29
**Priority:** P2
**Date:** 2026-10-05

---

## Summary

When Stripe held a subscription that our database did not, a signed-in user who pressed "Start free trial" or "Subscribe" landed back on the same pricing page with no message. The Stripe adapter refused to create a second Checkout, and the page ignored that refusal. If our database never learned of the subscription, a paying person had no access and no route to the billing portal.

The fix is in production. Its last provider-contract case was built on 2026-11-25 and waits for its first hosted run.

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
- Only the gateway's `ALREADY_SUBSCRIBED` runs the sync (`src/application/use-cases/create-checkout-session.ts:184-226`), which then rethrows the refusal. A failed sync logs and raises `checkout_stripe_holds_unrecorded`.
- The adapter, `listStripeBlockingCustomerSubscriptions` (`src/adapters/gateways/stripe/stripe-customer-subscriptions.ts`), lists the customer's subscriptions with `status: 'all'`, retrieves and normalizes each blocking one, and refuses one under another customer. It only reads.
- The sync (`src/application/shared/sync-customer-subscription.ts`) records the canonical subscription through `persistSubscriptionObservation`, and refuses any subscription that is not the signed-in user's.
- The action redirects to `/pricing?checkout=already_subscribed`. The page shows the database's state, and a still-unentitled user sees a notice with a Manage billing button. BUG-275's stale-link protection stays.

**The provider-contract case,** built 2026-11-25. Decided 2026-11-15 by the reviewing session, at the owner's delegation; the earlier proposal to decline it is withdrawn. ADR-025 decision 3 tests adapter behavior against real infrastructure (`docs/adr/adr-025-test-doubles-by-shape-or-behaviour.md:21`). Contract scenario 5 proves Stripe's list and retrieve, but not the adapter's own list, filter, retrieve and schema run together against Stripe.
- **The seam.** The adapter took a whole `StripeClient` but read only `subscriptions`. Its `stripe` input is now `StripeSubscriptionsClient` (`src/adapters/shared/stripe-types.ts`), which the normalizer already took, so the case passes `{ subscriptions: harness.subscriptions }` with no cast.
- **The case** is the contract's thirteenth scenario: its title is in `tests/shared/stripe-checkout-client-contract-cases.ts` and its body in `tests/shared/stripe-checkout-client-contract.ts`, so it runs against both the fake and Stripe TEST. It seeds an active and a canceled subscription on the harness customer (`seedSubscription`, `seedCanceledSubscription`), then calls the adapter with that customer and the harness price (`subscriptionParams.line_items[0].price`) as the monthly price ID. It expects exactly one observation: the active subscription's ID, the customer, the user from its `metadata.user_id`, plan `monthly`, status `active`, no scheduled cancellation, a period of one day to 366 after its start, and a billing anchor from its start up to that period end; the canceled one is left out.
- **The pinned counts.** Two tests pin the case list, and each failed until it named the new case: `tests/shared/stripe-checkout-client-contract-registration.test.ts` (every title and budget) and `scripts/test-lanes/run-stripe-provider-contracts.test.ts` (the count of contract titles and of cases in all, 14 and 16 once BUG-343's scenario joined in the same pull request).
- **The fake half's seeds** (`src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client-contract.test.ts`) lacked fields the normalizer's schema requires: `cancel_at_period_end`, `start_date` and `billing_cycle_anchor` (`stripeSubscriptionSchema` in `src/adapters/gateways/stripe/stripe-webhook-schemas.ts`). The case failed on the fake half with an invalid-payload error until the active seed carried them as Stripe sends them: that divergence is what the case exists to find. The canceled seed carries them too. The adapter never parses it, but with the blocking filter dropped it would, and the case should then fail on its count, not on the seed.
- **It bites:** with the blocking filter dropped, the fake half's case fails with two observations instead of one. The customer check needs a subscription under another customer, which a customer-filtered list in Stripe TEST never returns, so a contract case cannot exercise it; its unit tests do (`stripe-customer-subscriptions.test.ts`: "skips subscriptions that do not block a checkout, and other customers" and "refuses a retrieved subscription whose customer is not the one asked for").
- The sync's write is not part of the case: it goes through `persistSubscriptionObservation`, the webhook's and reconcile's writer, proven against Postgres.

## Verification

- [x] Use case, sync, adapter and page tests, red first, over the fake gateway and the contracted `FakeStripeCheckoutClient`: a refusal with no local row syncs and shows the user subscribed; a failed sync still shows the notice and portal link; BUG-275's stale-link case still shows the database's state.
- [x] The new contract case passes on the fake, and in Stripe TEST from a clone: `pnpm test:stripe-provider` logged `executed=15 passed=15 skipped=0` on 2026-11-25, and 16 of 16 the next day with BUG-343's scenario.
- [ ] A hosted run executes it. The runner requires every listed title (`STRIPE_PROVIDER_CONTRACT_CASE_TITLES` in `scripts/test-lanes/run-stripe-provider-contracts.ts`), so the `Stripe provider contracts` workflow (`.github/workflows/stripe-trial-clock-smoke.yml`, Sundays 07:17 UTC, or a manual dispatch) must log `executed=16 passed=16 skipped=0`; it logged 14 of 14 on 2026-11-22. The schedule runs from `main`, so the case must be promoted first. Then this record closes as Resolved.
- **Known limit.** A failed sync in production raises `checkout_stripe_holds_unrecorded`, a count only; its IDs live in Vercel Hobby's one-hour logs.

Corrected 2026-11-15: the lapsed 2026-10-20 test is kept and made builder-ready (reviewing session; the proposal to decline it is withdrawn), with a new due date of 2026-11-29. Finished build history and the pre-fix line references are in git at 34d9aea0.

Corrected 2026-11-25: the case is built. The builder's steps had left out the two tests that pin the case list. The canceled seed carries the missing fields as well as the active one, for the dropped-filter proof. The sync's lines are `:184-226`, not `:184-214`; the adapter, its schema and its tests are cited by name.

## Related

- BUG-275 (closed): the stale-return-link fix this preserves.
- DEBT-501: the same hunt; its item 8 (Won't Fix) would have paged this listing.
