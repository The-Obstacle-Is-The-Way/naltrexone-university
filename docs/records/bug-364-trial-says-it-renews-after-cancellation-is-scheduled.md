# BUG-364: The Trial Says It Renews After Cancellation Is Scheduled

**Status:** Open
**Priority:** P3
**Date:** 2026-10-22

---

## Summary

A trial with a saved card shows renewal copy even after the learner schedules cancellation in the Stripe portal. The app's trial banner says "Pro Monthly renews at $29 per month on your saved card when your trial ends", and the Billing page's subscription line says "Renews at $29 per month on your saved card when your trial ends, until you cancel". The same Billing page also shows "Cancellation scheduled — Your subscription will cancel on Oct 29, 2026", so it contradicts itself.

## Evidence

Found during the billing-and-entitlement QA run on the dev preview for promotion #1594, 2026-10-22, on dev `28f4407d`:
- Test account `qa-trial-1022+clerk_test@example.com` started a Pro Monthly trial and saved test card 4242.
- In the Stripe portal it chose **Cancel subscription**. Stripe showed "Cancels Oct 29".
- Back on `/app/billing`, the amber "Cancellation scheduled" notice appeared, while the banner and the subscription line still promised renewal.

The cause is in the code on `main` at `5dbff9f5`:
- `app/(app)/app/layout.tsx`, `TrialCountdownBanner`, picks its copy from `cardSaved` alone: a saved card always reads "renews at …".
- `app/(app)/app/billing/page.tsx`, `TrialRenewalLine`, does the same.
- `CheckEntitlementUseCase` (`src/application/use-cases/check-entitlement.ts`) does not return `cancelAtPeriodEnd`, so the layout cannot know that cancellation is scheduled. The persisted `Subscription` entity carries the flag.

Promotion #1594 did not introduce this: the same copy and logic are on `main` before it.

## Impact

- A learner who canceled is told they will be charged. Some will contact support or dispute the charge they fear. Others may distrust the cancellation, which is the opposite of the clear-cancellation evidence DEBT-414 is collecting.
- Auto-renewal statements are legally sensitive (DEBT-414). A renewal claim that is false after cancellation is the kind of statement that review would flag.
- No charge happens: Stripe honors the scheduled cancellation, so the defect is in the copy, not the billing.

## Options

1. **Pass `cancelAtPeriodEnd` through entitlement and branch the copy (recommended).**
   - `CheckEntitlementOutput` gains `cancelAtPeriodEnd`; the layout passes it to `TrialCountdownBanner`.
   - With cancellation scheduled, the banner and the Billing line state that the trial ends without renewing and that no charge follows, instead of the renewal sentence.
   - Small, test-first, and keeps one source of truth: the persisted subscription.
2. **Hide the banner's renewal sentence when cancellation is scheduled, and leave Billing's line.** This is cheaper, but Billing still contradicts itself.
3. **Read Stripe live in the layout.** This adds a provider call to every app request. Rejected.

## Resolution (decided)

Option 1. The new copy names no date, so it does not overlap BUG-350's cutoff formatting (#1570). The Billing notice keeps stating the date.

## Verification

- [ ] Red-first render tests: a trial with a saved card and `cancelAtPeriodEnd` shows no renewal sentence in the banner or on Billing, and says that the trial ends without a charge.
- [ ] `CheckEntitlementUseCase` returns `cancelAtPeriodEnd` (unit test).
- [ ] Business rule R11 names the new proving tests.
- [ ] Dev preview: schedule cancellation on a trial with a saved card; the banner and Billing state that it will not renew. Undo restores the renewal copy.
- [ ] Production after promotion.

## Related

- BUG-308, which introduced the saved-card renewal copy.
- BUG-350 and #1570, which format the cancellation cutoff.
- BUG-365, observed in the same QA run.
- DEBT-414.
