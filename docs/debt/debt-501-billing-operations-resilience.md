# DEBT-501: Billing Operations Can Leave Payers Without Access as the Service Grows or Changes

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — filed 2026-10-05; resolution decided per item below
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

The owner-requested adversarial hunt of the payment flows (2026-10-05) found no defect that charges an ordinary Checkout buyer without granting access. It did find gaps in billing operations. Each one can leave a payer without access, or charge someone twice, when the service grows, an operator changes something, or timing is unlucky. None is triggered today. Each item names its trigger. Every claim below was checked in code. The live (non-test) purchase path has never been recorded working end to end.

## Items

### 1. The daily reconcile never reaches the tail once the table grows (P2)

- **Evidence.**
  - The all-pages sweep starts at offset 0 on every run (`src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts:131`) and stops after a 40-second budget (`:12`, `:142-147`). It logs "resume at offset N", but nothing ever resumes there: the cron passes no offset (`app/api/cron/reconcile-stripe-subscriptions/route-handler.ts:220-221`).
  - Rows are never removed, so canceled subscriptions and lapsed trials count too.
- **Trigger.** Somewhere between roughly 500 and 1,000 rows (an estimate, not measured).
- **Impact.** For users past that point, a missed webhook is never repaired. A stopped-early run that overruns `maxDuration = 60` also kills the deleted-account cleanup that runs after it (BUG-262's safety net).
- **Decided.** Resume from a cursor stored between runs, recorded per run. Exclude rows that are terminal and past their period end.

### 2. Only one price ID per plan is recognized (P2)

- **Evidence.** `getSubscriptionPlanFromPriceId` matches only the current environment's monthly and annual IDs (`src/adapters/config/stripe-prices.ts:15-22`). Any other ID fails:
  - webhooks return 500 (`stripe-subscription-normalizer.ts:99-105`);
  - reads throw `INTERNAL_ERROR` (`drizzle-subscription-repository.ts:44-51`), as in DEBT-310's incident;
  - reconcile rows fail;
  - the success page redirects with `unknown_plan`.
- **Trigger.** Any change of Price for new customers. DEBT-414 freezes existing subscribers' prices, and the portal disables plan changes, so a new Price plus an environment change is the expected way to change a price. That change would lock out every existing subscriber.
- **Decided.** A recognized list of legacy price IDs per plan, configured alongside the current ones. Add an operator check that refuses a price change while live subscriptions use an ID the list doesn't hold. Until this ships, the runbook must say: never change a price ID.

### 3. A subscription created outside the app's Checkout is acknowledged and dropped (P3)

- **Evidence.** The normalizer requires `subscription.metadata.user_id` (`stripe-subscription-normalizer.ts:37-55`). The controller logs `metadata_missing` and returns 200 without recording the event (`stripe-webhook-controller.ts:679-689`), although the customer's own `metadata.user_id` and the `stripe_customers` mapping could identify the user.
- **Trigger.** Support creating a subscription in the Dashboard (the natural repair for "I paid but can't get in"), a Payment Link, or a script.
- **Decided.** Fall back to the customer's mapping, and record unresolved events in the ledger so they can be found.

### 4. A card added at or after trial end is never applied (P3)

- **Evidence.**
  - The trial is checked only when the add-card session is created (`create-trial-payment-method-setup-session.ts:57-65`).
  - The session lasts Stripe's default 24 hours (`stripe-checkout-sessions.ts:276-299`, no `expires_at`).
  - With `missing_payment_method: 'cancel'`, Stripe cancels at trial end, and a canceled subscription cannot take a default payment method, so the webhook fails for days.
  - The billing page only says "Stripe is confirming your card".
- **Decided.** Expire the add-card session at trial end. On completion against a canceled trial, tell the user to start a paid subscription instead of failing silently.

### 5. The success page tells someone who paid that "Checkout failed" (P3)

- **Evidence.** Every validation failure in `app/(marketing)/checkout/success/checkout-success-sync.tsx` redirects to `?checkout=error`. That includes `user_id_mismatch` (`:190-196`): paid on account A, returned signed in to account B. B can then buy again, creating a second customer and a second charge.
- **Decided.** A specific message for a mismatched account ("This purchase belongs to another account"), and no repurchase offer on that path.

### 6. The Stripe circuit breaker also counts ordinary 4xx errors (P3)

- **Evidence.** `src/adapters/shared/circuit-breaker.ts:62-76` counts every thrown error, and one breaker is shared per instance (`stripe-retry.ts:11-16,43`). Five consecutive client errors fail every Stripe call in that instance for 60 seconds, Checkout included.
- **Decided.** Count only transient failures: network errors, 5xx and 429.

### 7. Stripe settings not recorded in the repository (P3, owner)

- Not recorded: the live webhook endpoint's event list (last recorded in DEBT-406, before the add-card flow, so `checkout.session.expired` may be missing), the live Price IDs, and the live Checkout payment-method settings.
- No live-mode purchase has been recorded working end to end. All hosted E2E tests run in test mode, and a paid monthly Checkout has none.
- **Decided.** The owner makes one live purchase followed by a refund, under DEBT-465 Part 4's QA procedures, and records the live webhook's events.

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or deferred with its trigger in the register; and item 7's live purchase recorded.

## Related

- [BUG-319](../bugs/bug-319-subscribe-actions-break-after-a-deploy.md), [BUG-320](../bugs/bug-320-first-pricing-render-user-upsert-race.md), [BUG-321](../bugs/bug-321-already-subscribed-answer-discarded.md), [BUG-322](../bugs/bug-322-checkout-error-hidden-behind-dialog.md), [DEBT-502](./debt-502-account-identity-and-action-hardening.md): the same hunt.
- DEBT-422 (archived): reconcile paging deferred, without this item's restart-at-zero starvation.
