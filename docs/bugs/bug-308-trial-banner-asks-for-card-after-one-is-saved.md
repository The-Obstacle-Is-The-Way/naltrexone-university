# BUG-308: The Trial Banner Asks for a Card After One Is Saved

**Status:** Open
**Severity:** P3
**Date:** 2026-09-28
**Confirmed:** 2026-09-28 (hosted Stripe test-mode run on this clone, during DEBT-414 F03b)
**Component:** Trial add-card flow / app shell banner / Billing page

---

## Summary

After a trialing learner saves a card through the add-card flow, the app keeps telling them to add one. The dashboard banner still reads "Add a card before your trial ends to keep access." beside the "Add a card to keep access" button. Yet the card is attached, the trial's Stripe subscription renews on it, and the consent is recorded.

Two smaller defects sit on the same path:
- Returning from Stripe shows no confirmation.
- Stripe asks the learner to type an email address the app already knows.

## Evidence

- **Hosted run, 2026-09-28.** A temporary probe extended `tests/e2e/stripe-hosted-trial-add-card.spec.ts`: a real no-card trial, the add-card dialog, and a card saved on Stripe's setup page. Stripe's real `checkout.session.completed` event was replayed through the signed webhook route.
  - The spec's assertions passed: the consent record matched the dialog text, and the Stripe subscription's default payment method was the saved card.
  - The probe then loaded `/app/dashboard`, where the "Add a card to keep access" button was still visible (`bannerStillAsksForCard=true`).
- **Banner.** `app/(app)/app/layout.tsx` renders `TrialCountdownBanner` for every subscription whose status is `inTrial`, and nothing reads whether a card is on file.
- **Billing.** `app/(app)/app/billing/page.tsx` reads only the `error` query parameter. The setup Session returns to `/app/billing?trial_payment_method=success&session_id=…`, and the page ignores both.
  - The same page also ignored the add-card failure code, `error=trial_payment_method_failed`. DEBT-414 F03b fixed that part, because its stale-terms refusal returns through it.
  - The subscription line prints the raw domain values, for example `monthly · inTrial`, instead of the plan's name and the trial's end date.
- **Email.** `createStripeTrialPaymentMethodSetupSession` sends neither `customer` nor `customer_email`, so Stripe's setup page shows an empty, required Email field.

## Impact

- **Misleading.** Every learner who adds a card is told they have not, on the page they return to.
- **Duplicates.** Following the prompt again attaches a second card, moves the subscription's default to it, and records a second consent. No wrong charge or loss of access results: the trial still converts once, on the default card.
- **Friction.** Retyping an email on Stripe's page adds a step and a chance of a mismatched address on the payment method.

## Proposed fix

1. **Know when a trial has a card.** A trial gains a card only through the add-card flow, because the trial's billing portal offers no payment-method update (DEBT-414 F05). So a trial has one exactly when its current Stripe subscription has a completed setup operation whose subscription default was set.
2. **Banner.** For such a trial, the banner states the renewal instead: the plan, and the date it renews on the saved card, with a link to Billing. There is no add-card button.
3. **Billing.** Acknowledge the return: confirm a saved card, say it is still being confirmed while the webhook is pending, and handle `cancel` as well. Name the plan and state the trial's end, and whether it renews on a saved card, instead of printing raw domain values.
4. **Email.** Prefill the learner's email on the setup Session. Verify the parameter against Stripe's setup-mode contract first, because the Session deliberately names no customer until the webhook has verified ownership.
5. **Tests.** Red-first unit and component cases for each change. Extend the hosted add-card journey to assert the banner after the card is saved.
