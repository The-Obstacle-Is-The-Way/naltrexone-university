# BUG-310: Trial Add-Card Checkout Offers Payment Methods That Are Not Cards

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open
**Priority:** P3
**Date:** 2026-09-29
**Resolved:** —
**Verification receipts:** —

---

## Description

The trial add-card flow is a card flow from end to end:
- The consent dialog is titled "Add a card to keep access" and says "Review the terms, then add a card on Stripe's secure page." (`app/(app)/app/trial-payment-consent-dialog.tsx`).
- The app records whether a trial "renews on a saved card" (`src/application/use-cases/check-trial-saved-card.ts`, BUG-308).
- Billing states the renewal in terms of that card.

But the setup-mode Checkout Session the flow creates (`createTrialPaymentMethodSetupSession` in `src/adapters/gateways/stripe/stripe-checkout-sessions.ts`) sets no `payment_method_types`. Stripe therefore chooses the methods it offers from the account's Dashboard payment-method configuration, limited to those compatible with this setup Session.

Stripe's hosted page in test mode on 2026-09-29 offered Card, Cash App Pay, Klarna and Amazon Pay. The webhook takes whatever payment method the SetupIntent returns (`stripe-webhook-processor.ts`, `stripePaymentMethodId`), with no type check, and that method becomes the trial's renewal method.

Expected: the add-card flow saves a card, as its copy and consent say.

## How it was found

Stripe's hosted Checkout changed its layout on 2026-09-29, and the hosted E2E helper had to be updated to choose card (#1226). The page snapshot listed the four methods.

## Impact

- **Consent accuracy.** A learner who saves Cash App Pay, Klarna or Amazon Pay consented to "add a card"; the recorded consent and the app's copy then describe the renewal on a card they did not save.
- **Renewal behaviour.** Off-session renewal on these methods is not something the app designs for or tests. Klarna in particular is not a card-like recurring method.
- **Scope.** The production dashboard's enabled methods decide what production learners see. Test mode shows the risk; the code places no limit either way.

## Why this is a decision, not a quick fix

DEBT-414 made the opposite choice on purpose. Its design for this setup Session says: "Do not add `payment_method_types`; preserve dynamic payment methods" ([DEBT-414](../debt/debt-414-public-legal-pages-privacy-terms.md)). The Session's unit test pins that choice: `expect(params).not.toHaveProperty('payment_method_types')`.

Dynamic payment methods let the owner manage methods in the Stripe Dashboard without a code change. That choice was made before the evidence that the Dashboard's enabled methods put non-card methods on this card flow. So the fix overturns a recorded design decision in a payment and consent flow, and belongs to the owner.

What production learners see depends on the production Dashboard's enabled methods, which only the owner can check.

## Decision needed (owner)

- **(a) Restrict this Session to card in code** (recommended).
  - Set `payment_method_types: ['card']` on the trial add-card setup Session only, pin it in the adapter test, and assert in the hosted journey that the page offers card and nothing else.
  - Card-backed wallets such as Apple Pay and Google Pay remain available under `card`.
  - The flow then does what its copy and consent say, whatever the Dashboard enables.
  - The idempotency design already recovers from the changed request: a parameter mismatch on the primary key retries under the request-fingerprint key.
- **(b) Keep dynamic methods, and limit this flow to card in Stripe.** Pass a card-only `payment_method_configuration` for this Session. The limit then lives in Stripe configuration rather than in code.
- **(c) Keep dynamic methods, and change the copy and consent** from "card" to "payment method". The renewal behaviour of each enabled method is then something the app must design for and test.

The paid subscription Checkout's methods are a separate business choice and are not part of this record.

## Verification

- [ ] Owner decision recorded
- [ ] Implementation per the decision, red first
- [ ] Production release verified; record resolved and archived
