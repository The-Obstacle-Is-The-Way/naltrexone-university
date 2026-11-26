# BUG-384: Stripe's Customer Emails Let a Trial Gain a Card Without the App's Consent

**Status:** Verifying — the owner starts a live trial from an address they read: the app's acknowledgment arrives and Stripe's trial reminder does not; due 2026-12-01
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
- **Earlier live trials are unchecked.** Whether any earlier live trial followed either link has not been checked. In the live Dashboard, such a trial shows a payment method on a subscription whose customer never completed the app's add-card flow. The owner's own trial was canceled without a card. *Checked 2026-11-25: none did (Verification).*

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

Option 1, decided on 2026-11-24 at the owner's delegation, with its second half replaced on 2026-11-25:
- **Stripe's trial reminder is off,** as option 1 says.
- **Stripe's emails stop linking to the login page,** but the login link itself stays on. The Dashboard's default portal configuration, which the login page uses, offers cancellation and no card or plan change, as the app's trial profile does.
- It removes both side doors from every email a trial receives, closes the login page to cards, leaves paid billing recovery as it is, and needs no code.

Why the login link stays on:
- Stripe's Checkout setting "Limit customers to one subscription" works only while the link is on: "Disabling the login link disables this feature, which means that customers can create multiple subscriptions" ([Limit customers to one subscription](https://docs.stripe.com/payments/checkout/limit-subscriptions)).
- `docs/architecture/integrations/stripe.md` and BUG-343 keep that setting on as a guard against a second subscription.
- The login link uses the Dashboard's default configuration. The app never does: every session it opens names its own profile (`src/adapters/gateways/stripe/stripe-portal.ts:28-39`). So restricting the default configuration closes the login page to cards without touching the app's sessions.

Corrected 2026-11-25: option 1 also turned the login link off, which turns off Checkout's one-subscription limit; the record and its challenge missed that dependency.

## Done in live mode, 2026-11-25 (the owner, from about 17:46Z)

- **Settings → Billing → Subscriptions and emails.**
  - "Send a reminder email 7 days before a trial ends" is off.
  - "Include a link for customers to manage their subscriptions" is off, so Stripe's emails no longer carry the login link.
  - Payment method updates stay on "Link to a Stripe-hosted page", for failed payments.
  - The other customer emails (upcoming renewals, expiring cards, failed card and bank-debit payments) stay on. So does the "trial over" statement descriptor.
- **Settings → Billing → Customer portal.**
  - The login link was deactivated at about 17:50Z. The old link then answered HTTP 404.
  - It was re-activated at about 17:54Z, with the same URL, once the dependency above was found.
  - The default configuration then had plan switching turned off. Stripe requires payment-method updates while plan switching is on.
  - Payment-method updates were then turned off.
  - Cancellation stays on, at the end of the billing period.
  - The Dashboard's preview of the configuration shows "Cancel subscription" and no "Add payment method" or "Update subscription".
- **Checkout's "Limit customers to 1 subscription"** (Settings → Payments → Checkout and Payment Links).
  - An agent read it in the owner's signed-in Dashboard at about 19:18Z: off in live mode, and off in test mode.
  - Stripe turns it off when the login link is deactivated, so the 17:50Z deactivation probably did. Whether it was on before is not known; BUG-245 recorded the owner's note that it was.
  - While it was off, the app's own guards (BUG-343's options 2, 3, 5 and 6) still ran, and the only active live subscription was the owner's.
  - The owner then turned it on and saved it, with "Customer portal" as the place customers manage their subscription. An agent's fresh load read it on in live mode at 21:03Z.

## Verification

- [x] The owner, in live mode, turns off Stripe's trial reminder and its emails' link to the login page, and the Dashboard shows both off (2026-11-25, above).
- [x] The login page offers no way to add a card. The default configuration's payment-method updates and plan switching are off (2026-11-25, Dashboard preview).
- [x] A hosted payment-method link from a trial reminder sent before the change can no longer add a card.
  - The owner's own link, from the 2026-11-24 reminder, now redirects to Stripe's `update_payment_method/error` page. That trial was canceled, so this does not show that the setting change ends other trials' links.
  - Stripe documents its shared payment-update links as working only while a subscription is active, past due or trialing ([Subscription invoices](https://docs.stripe.com/billing/invoices/subscription)), and gives no expiry for the links in its emails.
  - So a trial whose reminder went out before about 17:47Z on 2026-11-25 could still add a card through it until that trial ends.
  - The live Dashboard, read at about 19:18Z, lists no trialing subscription. So no such trial exists, and nothing waits for 2026-12-02.
- [ ] The owner starts a live trial from an address they read. It gets the app's acknowledgment and no Stripe trial reminder, and the owner then cancels it.
- [x] ADR-027 decision 2's note reads that the app's acknowledgment is the trial notice.
- [x] No live trial gained a payment method outside the add-card flow (live Dashboard, 2026-11-25).
  - Live mode holds 9 subscriptions. Two are the owner's from 2026-11-24 (DEBT-501 item 7).
  - The other 7 are trials from 2026-08-09 to 2026-10-04. Each was canceled at its trial end, seven days after it was created.
  - A cancellation at trial end alone would not show that no card was added, since a trial with a card can also be canceled at period end. So each of the 7 customers' pages was read at about 21:25Z: each lists no payment method and no payment.
- [x] "Limit customers to 1 subscription" reads on in live mode, with the login link on (21:03Z).

## Related

- ADR-027: decisions 2, 3, 6 and 9.
- DEBT-414: F05 (the portal's trial profile), F03b (the add-card consent) and F19b (the trial's calendar dates).
- BUG-308 (the saved-card check), BUG-310 (card-only consent) and BUG-364 (the trial banner).
- DEBT-501 item 7: the owner's live purchase, whose receipt carried the login link.
