# BUG-364: The Trial Says It Renews After Cancellation Is Scheduled

**Status:** Open — implement DEBT-414 F22's decided fix after #1570 (BUG-350) lands
**Priority:** P3
**Date:** 2026-10-22

---

## Summary

The trial copy ignores a scheduled cancellation. This record is the engineering of DEBT-414 F22, decided 2026-10-06, and adds the saved-card variant found in the billing QA run for promotion #1594. F22 stays the decision of record; this record carries the fix, its tests and its verification.

**With a saved card**, after the learner cancels in the Stripe portal:
- The app's trial banner says "Pro Monthly renews at $29 per month on your saved card when your trial ends".
- The Billing line says "Renews at $29 per month on your saved card when your trial ends, until you cancel".
- The same Billing page shows "Cancellation scheduled — Your subscription will cancel on …", so it contradicts itself.

**Without a card** (F22's case):
- The banner still says "Add a card before your trial ends to keep access", and opens the add-card dialog.
- The Billing line still promises a charge if a card is added.
- Adding one records an initial-offer renewal consent and sends a renewal acknowledgment for a renewal that will not happen.

## Evidence

Found on the dev preview during the billing-and-entitlement QA run for promotion #1594, 2026-10-22. The test account had a Pro Monthly trial with test card 4242 saved. After **Cancel subscription** in the Stripe portal, which showed "Cancels Oct 29", `/app/billing` showed the amber notice while the banner and the subscription line still promised renewal.

The code on `main` after #1594:
- **The banner** chooses its copy from `cardSaved` alone (`app/(app)/app/layout.tsx`, `TrialCountdownBanner`).
- **The Billing line** does the same (`app/(app)/app/billing/page.tsx`, `TrialRenewalLine`).
- **The no-card branch** offers the add-card dialog on the trial status alone.
- **The layout's data has no cancellation flag.** `CheckEntitlementUseCase` (`src/application/use-cases/check-entitlement.ts`) does not return `cancelAtPeriodEnd`, so the layout cannot see it. The Billing page already receives the subscription.
- **The persisted flag is already complete.** `cancelAtPeriodEnd` folds in the portal's `cancel_at` (`src/adapters/gateways/stripe/stripe-cancellation.ts`), so no adapter work is needed.
- **The add-card use case** (`create-trial-payment-method-setup-session.ts`) checks only for an unexpired trial.
- **A code comment states the false premise.** `check-trial-saved-card.ts` says a saved card means the trial renews.

Promotion #1594 did not introduce this: the copy and the logic were on `main` before it.

**Surfaces checked, none missed.** In-app renewal claims exist only in the banner and the Billing line. Paid `active` subscriptions show no renewal line. Pricing, checkout and terms text is pre-purchase. The renewal-notice job already excludes `cancelAtPeriodEnd` (`send-due-renewal-notices.ts`).

## Impact

- A learner who canceled is told they will be charged, or is invited to add a card for a renewal that will not happen. That works against DEBT-414's clear-cancellation evidence (F04 recorded a no-card trial journey).
- In the no-card case, a false renewal consent record and acknowledgment email are created.
- No charge happens: Stripe honors the scheduled cancellation, and adding a card only sets the default payment method.
- P3 for both variants; F22's P4 is raised to match.

## Options

F22's options were reviewed 2026-10-06. Within its decision, the open choice is where the cancellation reaches the layout:
1. Return `cancelAtPeriodEnd` from `CheckEntitlementUseCase`, as `plan` and `trialEndsAt` already are.
2. Add one pure domain function that classifies how a trial ends (renews on a card, ends without a charge, needs a card). The banner, the Billing line and the add-card guard then share one classification. Preferred, so the three cannot diverge again.

## Resolution (decided)

DEBT-414 F22's decision, unchanged. When cancellation is scheduled:
- The trial banner shows when access ends and links to billing, in place of the add-card dialog, so the dialog cannot be opened.
- The Billing line drops the renewal copy.
- The Billing page shows the scheduled end and support while the trial still blocks Checkout. It offers a new paid subscription only after the trial no longer blocks.
- The creation use case refuses with `CONFLICT`, for a page loaded before the cancellation.
- Completion rechecks the cancellation, so a setup session opened before it produces no renewal acknowledgment after it.

The access-end date uses #1570's cutoff formatter, so this lands after #1570. The comment in `check-trial-saved-card.ts` is corrected in the same change.

## Verification

- [ ] Red-first render tests for the banner and the Billing line: with cancellation scheduled, in both the saved-card and no-card cases, no renewal or add-card copy, and the access end is shown.
- [ ] The add-card use case refuses with `CONFLICT` when cancellation is scheduled (unit test).
- [ ] Completion after a cancellation records no renewal consent and sends no acknowledgment (use case test and persistence integration case).
- [ ] `tests/e2e/stripe-hosted-portal-cancellation.spec.ts`: the trial case also asserts that no renewal or add-card copy remains after cancelling. Today it checks only the amber notice.
- [ ] Business rule R11 is reworded to cover in-app renewal statements, not only renewal notices, and names the new proving tests.
- [ ] Dev preview: cancel a trial in the portal, with and without a card; undo restores the renewal or add-card copy.
- [ ] Production after promotion.

## Related

DEBT-414 (F22, F04), BUG-308, BUG-350 and #1570, BUG-365.
