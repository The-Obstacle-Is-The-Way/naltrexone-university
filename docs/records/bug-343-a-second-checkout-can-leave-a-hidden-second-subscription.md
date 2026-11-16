# BUG-343: A Second Checkout Can Leave a Hidden Second Subscription

**Status:** Open — an agent re-runs the TEST-mode reproduction on released code; the owner checks the Dashboard in the pre-sale Stripe session; due 2026-11-22
**Priority:** P2
**Date:** 2026-10-13

---

## Summary

One user could end up with two live Stripe subscriptions. One Checkout page was completed while another tab's checkout request was still running; that request then handed back a second page, completable for up to 24 hours. The app kept one subscription and reported nothing about the other.

Options 2, 3, 5 and 6 shipped on 2026-10-14: #1492, #1494 and #1496, promoted by #1493, #1495 and #1497 the same day. A checkout now re-checks the customer's subscriptions before handing back a Session, and a completed Checkout ends the customer's other open subscription Sessions. What remains is two Checkouts completed before that sweep reaches either, a window of seconds. The daily reconcile cancels such a duplicate, without a refund, and raises `stripe_duplicate_subscription`; the owner refunds by hand. Automatic refunds are declined.

## Evidence

- **The race,** reproduced in Stripe TEST mode on 2026-10-14 with the real adapter: two `trialing` subscriptions for a first checkout, and two `active` paid subscriptions, $58 in all, for a returning customer. Stripe did not redirect the second page, and its refusal to expire a completed Session matched none of the adapter's terminal patterns.
- **Stripe's "limit customers to one subscription" setting** is a redirect for a customer who already holds an `active`, `past_due`, `unpaid` or `paused` subscription, not `trialing`, and Stripe describes no check at completion ([Stripe: limit customers to one subscription](https://docs.stripe.com/payments/checkout/limit-subscriptions.md?payment-ui=stripe-hosted)). It cannot stop the residual, where both pages load before either completes.
- **The existing correction.** The daily reconcile, at 08:00 UTC (`vercel.json:11-12`), lists each customer's subscriptions, `trialing` included, and cancels all but the canonical one with `subscriptions.cancel` and no options (`src/adapters/jobs/reconcile-stripe-subscriptions.ts:309-316`). It marks consent terminated only for the canonical subscription (`:287`). Nothing yet notices if the reconcile stops running: that watch is DEBT-501 item 9, not yet built.
- **What Stripe's cancel does** ([Stripe: cancel a subscription](https://docs.stripe.com/api/subscriptions/cancel)). It credits and refunds nothing. And "by default, upon subscription cancellation, Stripe stops automatic collection of all finalized invoices for the customer", which "you can resume … manually". The reconcile's cancel passes no option that changes this, so canceling the duplicate can stop collection of a finalized, unpaid invoice on the kept subscription too.

## Impact

- **The residual.** Two Checkout pages, both completed within the seconds before the first completion's webhook sweeps the other. A first-time customer gets two trials, one of which the reconcile cancels within a day at no charge. A returning customer is charged twice until the owner refunds by hand on the alert.
- **"Within a day"** holds only while the reconcile runs, and only for a customer with a local subscription row: the reconcile starts from those rows and lists each one's customer, so it finds a duplicate that has no row of its own, but not a customer the webhook stored nothing for (DEBT-501 item 1). Until DEBT-501 item 9 is built, a reconcile that stops running stops this correction without a signal. The hand refund also needs `stripe_duplicate_subscription` to reach the owner, which BUG-377's next drill proves. So DEBT-501 item 9 must ship before the first live sale, and BUG-377 must be verified.
- **A hidden trial the reconcile has not yet canceled** ends at its trial end without a charge, since it has no payment method, unless a card becomes the customer's default. The app's trial portal profile disables card updates (`src/adapters/gateways/stripe/stripe-portal-configurations.ts:34`), but the Dashboard's login-link portal uses its own configuration, so a card added there could become the default and convert the hidden trial. That is unverified; the owner's Dashboard check below settles it.
- **The hidden subscription's consent record** stays unterminated after the reconcile cancels it. No notice depends on it, since notices select by the one stored row.
- **Likelihood:** low. The product is pre-revenue; the first exposure is the first paid checkout.

## Options

Shipped: 2 (re-check before handing back a Session), 3 (sweep on completion), 5 (alerts) and 6 (the fake refuses to expire a Session that is not open). Declined:

- **Option 4: correct a duplicate within seconds.** On `customer.subscription.created`, cancel the second-ranked live subscription, refund its charge, mark its consent terminated and keep collecting the kept subscription's invoices. It adds a webhook handler, a refund gateway method with its fake and contract scenario, and real-Stripe and Postgres proofs.
- **Option 4a: refund in the reconcile's existing cancel.** A keyed refund of the duplicate's paid invoice beside the reconcile's cancel, which must also resume collection of the kept subscription's invoices. No new handler; the correction still takes up to a day.
- **Option 7: shorten Session lifetime** with `expires_at`. Option 3's sweep already ends the 24-hour tail when a Checkout completes, and this does nothing for the residual.
- **Option 8: make the app the only writer of subscriptions.** Closes the race completely, but changes the purchase page, disclosures and consent.

## Resolution (decided)

Options 2, 3, 5 and 6, decided 2026-10-14, each for the case the one before cannot close. Rules R24 and R25 state options 2 and 3.

- **Automatic refunds (options 4 and 4a): declined** by the owner, 2026-11-15. On `stripe_duplicate_subscription`, the owner refunds the duplicate by hand in Stripe's Dashboard, cancels it if the reconcile has not, and checks that the kept subscription's open invoices still collect, resuming automatic collection on any the cancel stopped. When this record closes, it leaves a Waiting row that revisits option 4a the first time a charged duplicate happens in production.
- **Option 7: declined** by the reviewing session, 2026-11-15, at the owner's delegation: option 3's sweep ends the tail. Option 8 is not taken.
- **The hold on inviting former trial users back** "until the fix ships" was lifted by its own condition on 2026-10-14, when #1493 and #1495 released options 2 and 3.
- **The Dashboard checks are kept** (reviewing session, 2026-11-15), in the owner's pre-sale Stripe session: in live and test mode, whether "limit customers to one subscription" is on with the portal's login link enabled; which portal configuration that link uses, and whether a card added there becomes the customer's default; and whether the former live trials ended `canceled` with no payment method. Keep the setting on, as `docs/architecture/integrations/stripe.md` says.

## Verification

- [x] Two independent audits of the record against the code and Stripe's documentation (2026-10-13), and the TEST-mode reproduction (2026-10-14).
- [x] Options 6 and 2, 3 and 5 (2026-10-14): red-first unit, controller and contract tests, each with mutations that fail a test; the provider contracts passed in TEST mode. Rules R24 and R25 name the proving tests.
- [ ] The TEST-mode reproduction, re-run on the released code, ends with one live subscription for a trial and for a returning customer. An agent runs it with disposable test customers.
- [ ] The owner's Dashboard checks, in the pre-sale Stripe session.
- [x] R25's last sentence and the runbook row (`docs/architecture/observability.md:315`) stop promising option 4: R25 says the daily reconcile cancels the duplicate and the owner refunds any charge by hand, and the runbook row adds the check of the kept subscription's invoices. *Done 2026-11-15 in the records review.*
- [ ] At closing, the index's Waiting table gains that option-4a row.

Corrected 2026-11-15: production has had one enabled live webhook endpoint since 2026-11-13, so the two-endpoint note is gone. The owner declined automatic refunds; the session declined option 7 and kept the Dashboard checks; the former-trial hold was lifted by its own condition. Added: Stripe's cancel stops collection of the customer's finalized invoices, and "within a day" depends on DEBT-501 item 9. The promotions are #1493, #1495 and #1497, not #1497 alone. Finished build history, the pre-fix evidence at `a57f5c0f` and the review receipts are in git at 34d9aea0.

## Related

- BUG-245 (closed): the two-tab duplicate whose backstop this record re-examined.
- BUG-321: syncing a subscription Stripe holds and our database does not.
- DEBT-501: item 1 (the reconcile's reach) and item 9 (the reconcile's watch).
- DEBT-505: the alert path.
