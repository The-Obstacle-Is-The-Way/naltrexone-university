# BUG-310: Trial Add-Card Checkout Offers Payment Methods That Are Not Cards

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-03; the trial add-card setup offers only cards, and its completion attaches only a card that Stripe saved, promoted and release-verified, with its suites re-run on `main`'s code before archival
**Priority:** P3
**Date:** 2026-09-29
**Resolved:** 2026-10-03
**Verification receipts:** [Verified closeout](#verified-closeout--2026-10-03-utc)

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

DEBT-414 made the opposite choice on purpose. Its design for this setup Session says: "Do not add `payment_method_types`; preserve dynamic payment methods" ([DEBT-414](../../debt/debt-414-public-legal-pages-privacy-terms.md)). The Session's unit test pins that choice: `expect(params).not.toHaveProperty('payment_method_types')`.

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

## Decision — 2026-10-03

Decided under the owner's 2026-10-03 delegation ("deciding all that we need to decide … anything that can be done in code"), after a read-only investigation against `main` at `94b3b87a`.

**Option (a): this Session offers card only.** The reasons:
- **The flow's purpose is a card.** The dialog, the Billing copy, the saved-card banner and the stored consent text (`trialPaymentDisclosure`, which the acknowledgment email quotes verbatim) all say "card".
- **Renewal on other methods is untested.** The method saved here renews the trial off-session at its end, and the app has never designed or tested that for Klarna, Cash App Pay or Amazon Pay.
- **Wallets are unaffected.** Card-backed wallets stay available under `card`.
- **Why not (b) or (c).** Option (b) puts the same limit in Stripe settings that differ per environment and are not reviewed with the code. Option (c) would need a new consent version and a renewal design for every method.

**Also: the setup must have succeeded, and on a card.** The completion handler retrieves the SetupIntent but checks neither its status nor its method's type (`stripe-webhook-processor.ts`, the setup completion path). It then attaches the method as the trial's renewal method, and Billing says "Your card is saved." The handler will require `status === 'succeeded'` and a `card` payment method, and otherwise record nothing and attach nothing. With card-only this should never trigger, but the handler should not rely on the Session's parameters.

**The paid subscription Checkout keeps dynamic methods.** The difference from this flow:
- Its copy and consent say "payment method", and Terms §4 says "Your payment method is charged at each renewal".
- Stripe offers in subscription mode only methods that support recurring billing.
- Access already waits on the subscription's status: `incomplete` grants no access, and the success page shows "Payment processing" (`stripe-subscription-status.ts`, `checkout-success-sync.tsx`). So a method that settles later never grants access early.

Nothing is changed there, and this rationale is recorded so that the choice is no longer implicit.

## Fix — 2026-10-03

Implemented as decided, each change red first.
- **The setup Session offers only cards.**
  - `createStripeTrialPaymentMethodSetupSession` sends `payment_method_types: ['card']`, pinned in `stripe-checkout-sessions-trials.test.ts`.
  - A Session created before the change and replayed under the same key is a parameter mismatch, which the existing recovery path handles under the request-fingerprint key.
  - `stripe-checkout-sessions.test.ts` pins paid Checkout's dynamic methods.
- **Setup completion accepts only a card that Stripe saved.**
  - The webhook retrieves the SetupIntent with its payment method expanded, and requires `status: 'succeeded'` and a `card` payment method.
  - Anything else fails the event before any write, with a logged error naming the SetupIntent's status and the method's type. Nothing is attached or recorded. The route answers 400, and Stripe shows the delivery as failed and retries it.
- **The hosted journey checks what Stripe was told.**
  - The add-card evidence step retrieves the completed Session from Stripe and asserts that its `payment_method_types` is `['card']`. It asserts the Session rather than the rendered page, whose markup is Stripe's and changes ([DEBT-471](../debt/debt-471-e2e-ci-external-fragility.md)); Stripe renders the page from the Session.
  - The same step replays Stripe's actual `checkout.session.completed` event through the signed webhook route, so the expansion and both checks run against real Stripe.
- **Evidence.**
  - The setup-completion cases moved, unchanged apart from the expanded SetupIntent, to their own file, as the expiration cases already were. Four refusal cases are new.
  - Nine targeted mutations each fail a case: the card-only parameter, the status check, the card type, the expanded-object requirement, the expand request, the log message, each of the two logged fields, and the fake's recorded params.
  - The fake records each SetupIntent retrieval's params; the contract register says that it models no expansion.

## Verification

- [x] Owner decision recorded (2026-10-03, delegated)
- [x] Implementation per the decision, red first (see Fix):
  - the setup Session sends `payment_method_types: ['card']`, pinned in the adapter test;
  - the hosted journey asserts that Stripe's Session offers only card;
  - setup completion refuses a SetupIntent that has not succeeded, or whose method is not a card.
- [x] Production release verified; record resolved and archived (see Verified closeout)

## Verified closeout — 2026-10-03 UTC

- **Merged.** #1329 (CodeRabbit **5399437013** on `b3addce5`; merged `d6cf5602`). The decision was recorded in #1326.
- **Released** through promotion #1331 (`6411d7e8`):
  - main CI **37107592388**, `test` passed **08:01:47Z**;
  - production assigned **08:01:50.199Z**;
  - `main` and `dev` trees `6f4e2ff9`;
  - production health 200 (`{"ok":true,"db":true}`).
- **Real Stripe.** The hosted Stripe lane's `stripe-hosted-trial-add-card` journey ran in every local full gate from #1329's head on. It saves a real card in TEST mode, asserts that Stripe's Session offers only `card`, and replays Stripe's actual `checkout.session.completed` event through the signed webhook route, where the new SetupIntent checks accept it.
- **Re-verified** on `main`'s code before archival: `src/adapters/gateways/stripe/` is identical on `main` and `dev`, and its 27 suites (275 tests) pass.
- **Not verified in production Stripe.** No production checkout was made, by policy (TEST mode only). The live Session's `payment_method_types` comes from the same code path the hosted journey exercises.
