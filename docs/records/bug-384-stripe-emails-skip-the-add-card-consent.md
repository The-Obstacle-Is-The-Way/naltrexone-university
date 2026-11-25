# BUG-384: Stripe's Customer Emails Let a Trial Gain a Card Without the App's Consent

**Status:** Blocked — the owner turns off Stripe's trial reminder and the portal's login link in live mode; due 2026-12-01
**Priority:** P2
**Date:** 2026-11-24

---

## Summary

Stripe's customer emails link to two Stripe pages that let a trialing customer add a card without going through the app:
- the hosted "Update payment method" page;
- the customer portal's login link, "Manage your subscriptions".

ADR-027's third decision says a trial gains its first card *only* through the app's add-card flow. That flow records consent to be charged and sends an acknowledgment. DEBT-414 F05 closed the same gap in the portal sessions the app opens, by turning card updates off in the trial profile. Neither link goes through those sessions.

The owner's live trial on 2026-11-24 received such an email about a minute after the trial started.

## Evidence

- **The trial-ending email.** Stripe's "Your Addiction Boards trial ends soon" came from trial-ending@stripe.com at 2026-11-24T19:57:01Z, for the owner's live no-card trial, which started at about 19:56Z.
  - "Update payment method" links to `billing.stripe.com/subscription/update_payment_method?…&referer=free_trial_ending`.
  - "Manage your subscriptions" links to `billing.stripe.com/p/login/…`.
  - The receipt for the owner's later paid purchase carried the same login link.
  - Both were read in the owner's mailbox on 2026-11-24.
- **Why it came at once.** Stripe sends the reminder 7 days before a trial ends, or "as soon as the trial begins" for a trial shorter than 7 days ([Manage compliance requirements for trials](https://docs.stripe.com/billing/subscriptions/trials/manage-trial-compliance)). Our trial is 7 days, so it reaches the customer at signup.
- **The app already sends what the card networks require.**
  - Visa asks for a notice at least seven days before a trial expires, with a simple way to cancel. For a shorter trial, those details go in the initial confirmation.
  - Mastercard's 3-to-7-day notice "does not apply to free trials 7 days long or less" ([Stripe's Mastercard guidance](https://support.stripe.com/questions/guidance-for-mastercard-recurring-billing-compliance-updates)).
  - The app's own acknowledgment goes out when the trial starts (ADR-027 decision 6, `src/adapters/controllers/stripe-webhook-controller.ts:686-696`). For a 7-day trial, that is seven days before it ends. The owner's copy states the plan, "$29.00 USD every month", the trial end, the cancellation deadline, and "Cancel online on the Billing page: https://addictionboards.com/app/billing".
- **The portal login link.**
  - The login link uses the Dashboard's default configuration, which applies "unless it is overridden". The app's configurations set no `login_page` (`src/adapters/gateways/stripe/stripe-portal-configurations.ts:22-53`).
  - TEST mode's default configuration, read on 2026-11-24, has `payment_method_update` enabled and `subscription_cancel` set to `at_period_end`. Its plan changes are off and its login page is off.
  - Live's login page is on, since the emails link to it. Live's default features were not read, because live keys are not used.
- **What a card added on either page does.**
  - It becomes the subscription's payment method, so the trial converts and Stripe charges $29 at its end. The trial's `cancel` end behavior applies only when no payment method exists.
  - Consent is written only through checkout and the add-card setup (`stripe-webhook-controller.ts:416-441`, `:555`), so the app records no add-card consent and sends no acknowledgment.
  - `CheckTrialSavedCardUseCase` reads only the setup operations (`src/application/use-cases/check-trial-saved-card.ts:27-31`), so the banner keeps offering "Add a card".
  - Stripe's pages may also accept non-card methods, against BUG-310's card-only consent.
- **The reminder's wording.** It tells a no-card trial "You have an upcoming payment on December 1, 2026". That is Stripe's template, and only its conditional sentence about adding a payment method is accurate.

## Impact

- **A trial can convert without its consent record.** A trialing customer who follows either link converts to paid with only the trial's own consent. The add-card step's opt-in, record and acknowledgment are skipped, though ADR-027 and DEBT-414 F03b require them when a card is added.
- **The app keeps offering a card.** It shows that customer "Add a card" until the trial converts.
- **Paid customers bypass the paid profile too.** Through the login link, a paid customer also gets the default configuration's cancellation and plan settings instead of the app's paid profile (ADR-027 decision 9). That holds wherever the live default differs from the profile.
- **Earlier live trials are unchecked.** Whether any earlier live trial followed either link has not been checked. In the live Dashboard, such a trial shows a payment method on a subscription whose customer never completed the app's add-card flow. The owner's own trial was canceled without a card.

## Options

1. **Turn Stripe's trial reminder off, and turn the portal's login link off.**
   - The app's acknowledgment already gives the 7-day notice with a cancellation link, so the reminder adds only the side door and a misleading "upcoming payment".
   - Without the login link, the emails' "Manage your subscriptions" link no longer opens the default configuration. The app opens every portal session itself, with its own profile.
   - Stripe's other emails keep their Stripe-hosted links. Paid customers use the hosted page to pay an outstanding invoice, and the paid profile allows card updates.
   - ADR-027 decision 2's note, "DEBT-410 D8 left that to Stripe's trial-ending email", changes to say the app's acknowledgment is the trial notice.
2. **Point Stripe's email links at `https://addictionboards.com/app/billing`** (Settings → Billing → Subscriptions and emails; one destination for every email, with `stripe_source` appended, per [Send customer emails](https://docs.stripe.com/invoicing/send-email)). It is rejected for now, for two reasons:
   - Stripe's trial page says the reminder needs "Link to a Stripe-hosted page". Its send-email page lists `free_trial_ending` for custom links. Whether a custom link stops the reminder is undocumented, and TEST mode sends no reminders, so it cannot be checked.
   - Failed-payment emails would lose Stripe's hosted invoice payment. `unpaid` customers land on `/pricing?reason=manage_billing`, and `paymentFailed` customers on `/pricing?reason=subscription_required`, which offers no way to recover billing (`app/(app)/app/layout.tsx:64-66`, `src/domain/services/entitlement.ts:23-32`).
3. **Accept a card added outside the flow, and record consent from the trial's own opt-in.** That opt-in reads "if I add a payment method, Pro Monthly renews automatically…". This weakens DEBT-414 F03b's decision, so it is the owner's and counsel's call, not an engineering fix.

## Resolution (decided)

Option 1, decided on 2026-11-24 at the owner's delegation. It removes both side doors from every email a trial receives, leaves paid billing recovery as it is, and needs no code. The ADR-027 note changes in the pull request that records the owner's settings.

## Verification

- [ ] The owner, in live mode, turns off "Send a reminder email 7 days before a free trial ends" (Settings → Billing → Subscriptions and emails) and the customer portal's login link (Settings → Billing → Customer portal). The Dashboard then shows both off.
- [ ] `billing.stripe.com/p/login/…` from an old email reports the link inactive.
- [ ] A hosted payment-method link from a trial reminder sent before the change reports inactive, or the record states the remaining validity window and the residual risk.
- [ ] The next live trial gets the app's acknowledgment and no Stripe trial reminder.
- [ ] ADR-027 decision 2's note reads that the app's acknowledgment is the trial notice.
- [ ] The owner checks the live Dashboard for any earlier trial that gained a payment method outside the add-card flow, and records what it finds.

## Related

- ADR-027: decisions 2, 3, 6 and 9.
- DEBT-414: F05 (the portal's trial profile), F03b (the add-card consent) and F19b (the trial's calendar dates).
- BUG-308 (the saved-card check), BUG-310 (card-only consent) and BUG-364 (the trial banner).
- DEBT-501 item 7: the owner's live purchase, whose receipt carried the login link.
