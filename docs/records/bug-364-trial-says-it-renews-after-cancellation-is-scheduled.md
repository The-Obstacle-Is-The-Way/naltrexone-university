# BUG-364: The Trial Says It Renews After Cancellation Is Scheduled

**Status:** Verifying — the owner's no-card live trial check, which also covers BUG-365, in the owner's pre-sale Stripe session; due 2026-11-22
**Priority:** P3
**Date:** 2026-10-22

---

## Summary

The trial copy ignored a scheduled cancellation. This record is the engineering of DEBT-414 F22, decided 2026-10-06, and adds the saved-card variant found in the billing QA run for promotion #1594. F22 stays the decision of record.

- **With a saved card**, after the learner canceled in the Stripe portal, the banner and the Billing line still promised a renewal on the saved card, while the same Billing page said "Cancellation scheduled".
- **Without a card** (F22's case), the banner still offered the add-card dialog, and adding a card recorded an initial-offer renewal consent and sent an acknowledgment for a renewal that would not happen.

This record's production check also records BUG-365's half: both fixes shipped in promotion #1613, and one live trial checks both. BUG-365 closes as Resolved when it is recorded here.

## Evidence

Found on the dev preview on 2026-10-22: a Pro Monthly trial with test card 4242 saved, canceled in the Stripe portal ("Cancels Oct 29"). `/app/billing` showed the amber notice while the banner and the subscription line still promised renewal. The banner and the Billing line chose their copy from `cardSaved` alone, the layout's entitlement read did not return `cancelAtPeriodEnd`, and the add-card use case checked only for an unexpired trial. The copy and logic were on `main` before #1594.

## Impact

- A learner who canceled was told they would be charged, or invited to add a card for a renewal that would not happen. In the no-card case, a false renewal consent and acknowledgment email were created.
- No charge happened: Stripe honors the scheduled cancellation.
- P3 for both variants; F22's P4 is raised to match.

## Options

1. Return `cancelAtPeriodEnd` from `CheckEntitlementUseCase`.
2. Also add one pure domain function that classifies how a trial ends, shared by the banner, the Billing line and the add-card guard, so the three cannot diverge again. Chosen.

## Resolution (decided)

DEBT-414 F22's decision, built on option 2 and released in promotion #1613 (2026-11-01):
- `classifyTrialEnding` (`src/domain/services/trial-ending.ts`) answers `cancellationScheduled`, `renewsOnSavedCard` or `needsCard`; a scheduled cancellation wins whether or not a card is saved. The banner and the Billing line use it. Creation's guard checks `cancelAtPeriodEnd` itself (`src/application/use-cases/create-trial-payment-method-setup-session.ts:68`), the condition the classifier tests first, so the shared rule is that one field rather than one function. *Corrected 2026-11-17: option 2 had said the guard calls the classifier.*
- With cancellation scheduled, the banner states when access ends and links to Billing, with no add-card dialog; the Billing line drops the renewal copy; creation refuses with `CONFLICT`.
- Completion of a setup Session checks twice, before calling Stripe and in the transaction that records consent (`checkSetupSubscription`, `src/adapters/controllers/stripe-webhook-controller.ts:246-278`). A scheduled cancellation ends it as `trial_cancellation_scheduled`, and a trial that no longer runs as `subscription_inactive`: the card is detached, its default cleared first, and no consent or acknowledgment is recorded.
- Rule R11 states it.

## Verification

- [x] Red-first unit, render, controller and Postgres tests for the banner, the Billing line, creation's refusal, both completion checks and the detached default (`tests/integration/stripe-webhook-trial-setup-cancellation.integration.test.ts`); the contract's ninth scenario proves the cleared default against TEST mode.
- [x] Dev preview on `5c8c9f2b` (2026-10-27 and 10-28), the tree released in #1613: with and without a card, a portal cancel removed the renewal and add-card copy and stated the access end, and an undo restored it. The portal sets `cancel_at` to the trial end with `cancel_at_period_end` false, which the app reads.
- [ ] Production, before the first live sale: the owner, on their own account, starts a no-card trial and cancels it in the live portal. The frame and Billing say the cancellation is scheduled, with no renewal or add-card copy, and Renew restores the add-card copy. Then, with the app open, the owner cancels it immediately in the live Dashboard, and navigating in the app lands on Pricing (BUG-365's half). This checks the live portal's cancellation mode and the live webhook. Starting a live trial is the owner's decision. If they decline the check itself, both records close with that decision recorded; until one or the other, both stay open, as the index's Tracking rule requires.

Corrected 2026-11-15: BUG-365's only open check was this one, word for word, so it is run once and recorded here; BUG-365 stays Verifying until then. Re-dated from 2026-11-08, when the check had not been run: it joins the owner's one pre-sale Stripe session with BUG-343's Dashboard checks and DEBT-501 item 7. Finished build history is in git at 34d9aea0.

## Related

DEBT-414 (F22, F04), BUG-365 (its production check is recorded here), BUG-308, BUG-350.
