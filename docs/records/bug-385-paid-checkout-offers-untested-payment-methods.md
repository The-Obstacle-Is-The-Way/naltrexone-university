# BUG-385: Paid Checkout Offers Payment Methods Nothing Has Tested

**Status:** Open — the owner turns off three live payment methods, due 2026-12-01; then cards only in Checkout and the paid portal (option 1), red first
**Priority:** P2
**Date:** 2026-11-28

---

## Summary

The app's subscription Checkout Session names no payment methods. So Stripe offers every method that the account's default payment-method configuration enables and that suits a subscription. In live mode that is Cash App Pay, Amazon Pay and Klarna as well as cards.

The paid customer portal profile and Stripe's hosted invoice pages also follow a Dashboard configuration. So a paying customer can add some of those methods later.

The app's tests, the hosted smoke and the billing QA procedure pay only by card. Three methods, one of them a buy-now-pay-later product, have never been exercised through Checkout, the webhook, the success sync, renewals or refunds. The trial's add-card Session already offers only cards (BUG-310).

## Evidence

- **Checkout.** `createStripeCheckoutSession` builds a `mode: 'subscription'` Session with no `allowed_payment_method_types` and no `payment_method_configuration` (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:1441-1457`). Only the setup-mode add-card Session sets `allowed_payment_method_types: ['card']` (`:282-290`). The port type allows the field only for setup mode (`src/adapters/shared/stripe-types.ts:41-62`). A unit test pins the paid Session to dynamic methods, as BUG-310 decided (`stripe-checkout-sessions.test.ts:113-124`).
- **The portal.**
  - The paid portal profile enables `payment_method_update` and names no configuration (`src/adapters/gateways/stripe/stripe-portal-configurations.ts:34`).
  - Without one, Stripe uses the default payment-method configuration.
  - Cash App Pay and Amazon Pay support the customer portal; Klarna does not.
- **Hosted invoice pages.**
  - These are the pages Stripe's failed-payment emails link to, which BUG-384 kept.
  - They take their methods from the invoice default payment-method configuration in the Dashboard.
  - `subscription_data` cannot carry `payment_settings`, so a Checkout-created subscription cannot narrow them.
- **What a live buyer sees.**
  - Stripe's Dashboard preview (Settings → Payment methods → Review, by Checkout Session ID) was read on 2026-11-28 at about 04:20Z, with that morning's settings.
  - The Session was the owner's live $29.00 purchase of 2026-11-24, which went through Link before DEBT-501 item 7 turned Link off.
  - The preview lists Card, Cash App Pay, Amazon Pay and Klarna.
- **The live configuration.**
  - A partial read of its methods list, the same morning, showed Cards, Apple Pay, Amazon Pay and Cash App Pay enabled, and Google Pay and Link disabled.
  - Klarna's own row was not read. Its place in the preview shows it enabled and eligible.
- **What has been tested.**
  - The hosted smoke fills a card (`tests/e2e/helpers/stripe-hosted-checkout.ts:54-87`).
  - The billing QA procedure pays with test card 4242 (`docs/guides/qa/billing-and-entitlement.md`, step 12).
  - No test, contract or QA step pays through Cash App Pay, Amazon Pay or Klarna.
- **The trial-start Session.** It collects a payment method only if required (`payment_method_collection: 'if_required'`), so a trial sees none of these today.
- **No live customer has paid this way.** Live Payments, all time, holds one payment, the owner's, through Link (read 2026-11-28).

## Impact

- **Untested paths.** All three redirect the buyer to the provider's own page. Stripe documents immediate confirmation for each, but no test shows that the success sync, entitlement, renewals, failed-payment emails, portal updates and refunds behave for them as they do for cards.
- **Refunds and disputes differ.**
  - A Cash App Pay refund is asynchronous and can take up to 10 business days.
  - A Klarna refund cancels the buyer's remaining installments.
  - Cash App Pay puts the liability for off-session fraud on the merchant.
  - BUG-343's hand refunds were written for cards.
- **A credit product on a renewing subscription.** Klarna finances the purchase; in the US its Pay in 4 covers long-term subscriptions, so this concerns the $199 annual plan most. Whether that suits the product and the renewal-law disclosures (DEBT-414) has not been asked.
- **Support.** A buyer who pays this way and needs help gets a support path nobody has rehearsed.

## Options

1. **Cards only, in the app's code, for everything the app opens.**
   - Set `allowed_payment_method_types: ['card']` on the subscription Sessions, as the add-card Session does. Card wallets such as Apple Pay and Google Pay stay, per Stripe's wallet docs. The `link` type is filtered out.
   - Have the paid portal profile name a card-only payment-method configuration that the adapter creates and versions, as it does its portal configurations.
   - A method outside the allow-list never appears, even if someone turns it on later in the Dashboard (Stripe's integration-options page). Stripe's pages differ on whether the Dashboard also bounds the list: the API reference calls it a filter on the eligible set, and a support article calls it an opt-out from Dashboard-managed methods. The add-card Session keeps cards enabled in the Dashboard either way (BUG-310).
   - Hosted invoice pages stay outside the app's reach, so the Dashboard restriction in option 2 stays for them, permanently.
2. **Turn the three methods off in the live Dashboard.** It is quick and needs no release. But it is the owner's setting, a later toggle undoes it silently, and nothing tests it.
3. **Exclude the three by name** (`excluded_payment_method_types`). A method enabled later would still appear.
4. **Keep them, and test each.** It needs a hosted journey and a QA step per method, counsel's view on Klarna, refund notes and support notes. That cost buys nothing until buyers show they want them.

## Resolution (decided)

Options 1 and 2 together, decided 2026-11-28 at the owner's delegation. It is the call DEBT-501 item 7 made for Link: offer what is tested, and revisit a method once sales show demand for it.

It overturns a recorded choice. BUG-310 kept paid Checkout on dynamic methods for three reasons:
- its copy and consent say "payment method";
- subscription mode offers only methods that support recurring billing;
- access waits on the subscription's status, so a method that settles later never grants access early.

All three still hold, but none covers what this record found. No test exercises those methods' renewals, refunds or disputes, and Klarna is a credit product. BUG-310 limited the trial's add-card flow to cards partly because renewal on those methods was untested. The paid copy needs no change, since a card is a payment method.

- **First, the Dashboard (option 2).**
  - The owner, or an agent at the owner's explicit yes, turns off Cash App Pay, Amazon Pay and Klarna in live mode's default payment-method configuration, and in the invoice default configuration if it is separate.
  - A fresh read of the Review preview for a $29 subscription then shows only Card.
  - It stays off permanently for the hosted invoice pages.
- **Then the code (option 1), red first.**
  - A unit test asserts `allowed_payment_method_types: ['card']` on the paid and trial-start Session parameters, replacing the test that pins dynamic methods.
  - Another asserts that the paid portal profile names the card-only configuration, with `PORTAL_CONFIGURATION_VERSION` bumped. A payment-method configuration carries no metadata, so the adapter finds its own by name, and uses it only after checking that only cards are on.
  - Widen the port type in `src/adapters/shared/stripe-types.ts`.
  - Carry the field through `FakeStripeCheckoutClient` and its contract scenario.
  - Update the register row in `docs/guides/testing/fake-contracts.md`.
- **Provider proof.** The provider contract, which already retrieves the app's Session (`tests/e2e/helpers/checkout-success-provider-contract.ts`), asserts `payment_method_types` is `['card']`, as `tests/e2e/helpers/checkout-consent.ts` does for the add-card Session. Apple Pay rests on Stripe's docs, since a test browser cannot show it.
- **Open Sessions.**
  - The reuse match compares price, variant and consent metadata only (`stripe-checkout-sessions.ts:1294-1306`), so an open Session from before the change is handed back for up to 24 hours.
  - Timing the release cannot close this. The old code can open a Session just before the release, however long after the Dashboard change.
  - So every path that reuses or hands back a Session requires its `payment_method_types` to read exactly `['card']`, and expires and replaces one that does not. This is red first.
  - What stays open: a pre-fix Session that reads only cards, because the Dashboard was already card-only when it was opened, can still be reused for those 24 hours. Its methods follow the Dashboard, which this record keeps card-only. Turning a method back on in the Dashboard within 24 hours of the release is the one case the check may not catch.
- **Release.**
  - The fix adds two steps to the billing QA procedure (`docs/guides/qa/billing-and-entitlement.md`). Both run in test mode, where the other methods stay enabled, and expect only cards and card wallets:
    - one reads the methods the paid Checkout page offers;
    - one reads the methods the paid portal offers when adding a payment method.

    The portal's opening and cancellation steps (15-17) pass whatever methods it offers, so they cannot show this.
  - The procedure's paid checkout (step 12), those two steps and the portal steps run on the dev preview before promotion.
  - `stripe.md`'s Checkout Rules say that every app-opened Session and the paid portal offer only cards, and why.

## Verification

- [ ] The Dashboard change: the live Review preview of a $29 subscription shows only Card.
- [ ] The invoice default payment-method configuration, read in the live Dashboard, has only cards and card wallets enabled, so hosted invoice pages offer nothing else. If it is the same configuration as Checkout's, the record says so. If it still has another method enabled, that method is turned off before this box is ticked.
- [ ] The code merged with its red-first tests, and the provider contract asserts card-only. On the dev preview, the billing QA's two payment-method steps that the fix adds showed only cards and card wallets, and its paid checkout and portal steps passed.
- [ ] The code holds on its own. Read the Review preview of a subscription Session that the fixed code created, by its Session ID, in test mode, where the methods stay enabled. It shows only cards, allowing for Link's save box, which test mode still pre-ticks.
- [ ] Production. The fix is promoted, and two live reads are recorded:
  - the Review preview of a subscription Session the released code created shows only cards;
  - after the first paid portal session in live mode, the live Dashboard lists the app's card-only payment-method configuration, with only cards and card wallets on.

## Related

- BUG-310: the add-card Session's card-only restriction, and the choice, overturned here, to keep paid Checkout on dynamic methods.
- BUG-384: the hosted payment-method page kept for failed payments.
- DEBT-501 item 7: Link turned off in live mode.
- DEBT-414: the renewal-law review, for any method kept later.
- BUG-343: hand refunds.
- ADR-027: the consent design.
