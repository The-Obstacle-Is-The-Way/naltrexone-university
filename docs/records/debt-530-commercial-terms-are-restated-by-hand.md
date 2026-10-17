# DEBT-530: Commercial Terms Are Restated by Hand, and Nothing Checks That Stripe Charges the Amount Shown

**Status:** Open — one offer module read by the server and the copy, a check that each configured Stripe price matches it, and one cutoff formatter
**Priority:** P2
**Date:** 2026-10-17

---

## Summary

Several commercial terms have no single owner. Each is typed by hand where it appears:
- the trial length;
- the plan amounts;
- the yearly saving;
- the support address;
- the terms version and its effective date.

They agree today: $29 and $199, a 7-day trial, 12 × 29 − 199 = 149, one address.

What a customer is charged comes from the Stripe price ID in the environment. No production check compares that price's amount with the amount shown and consented to. The E2E preflight checks only the billing interval, and the paid E2E checks one amount in test mode.

Two further copies decide or present the offer:

- **The pricing page and the checkout guard** decide what to offer through two different domain functions:
  - the page uses a fall-through default for any status it does not name;
  - checkout uses an explicit list.

  They agree for all eight statuses today. A new status would split them silently. This extends DEBT-524's three blocking-status lists with a fourth, implicit one.
- **The billing page shows a scheduled cancellation as a bare UTC date.** The renewal emails state the same instant in UTC and in US Eastern and Pacific time, as DEBT-414 F06 requires.

  For a period ending between midnight and about 07:00 UTC, the page names the next day. Example: access ends on 31 October at 9 PM Eastern, and the page says "cancel on Nov 1… keep access until then". This is live today, and it concerns how cancellation terms are presented.

## Evidence

**Trial length:**
- The server's private constant is `FREE_TRIAL_DAYS = 7` (`src/application/use-cases/create-checkout-session.ts:25,132`).
- "7" is typed separately in:
  - `lib/pricing-data.ts:37,49,82`
  - `app/pricing/plan-consent-dialog.tsx:99`
  - `app/pricing/pricing-view.tsx:262`
  - `app/(marketing)/checkout/success/page.tsx:61`
  - `app/(marketing)/terms/terms-content.ts:45`
  - the frozen consent registry, `lib/checkout-disclosures.ts:26-60`
- The offer fence (`create-checkout-session.ts:144-155`) catches a change to the text, not to the days granted.

**Amounts and saving:**
- `lib/pricing-data.ts:32,43` (`amountCents`) and the terms text.
- The saving is typed: `savings: 'Save $149 per year'` (`lib/pricing-data.ts:47`).
- The charged price is the environment's price ID (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts`).
- The preflight compares the interval only (`tests/e2e/helpers/credential-health-check.ts:508-517`).

**Support address:**
- The owner is `lib/support.ts:4`.
- The address is also typed in:
  - `lib/pricing-data.ts` (3)
  - `app/pricing/page.tsx`
  - `app/pricing/pricing-view.tsx`
  - `src/application/shared/renewal-notice-email-format.ts` (4)
  - the terms (7) and the privacy policy

**Terms version and date:**
- `TERMS_VERSION = '2026-08-09'` (`lib/pricing-data.ts:13`) and `effectiveDate: 'August 9, 2026'` (`terms-content.ts:6`) are not linked.
- The content hash covers only the body.

**Email copy:** the notice and acknowledgment emails each carry their own footer and `formatAmount`:
- `src/application/use-cases/send-due-renewal-notices.ts`
- `src/application/use-cases/send-renewal-acknowledgment.ts`

The footers already differ in punctuation and in how the refund line is introduced.

**The offer, decided twice:**
- `determineNonEntitledReason` (`src/domain/services/entitlement.ts:23-32`) returns `'manage_billing'` for every status it does not name. `app/pricing/page.tsx` offers "Manage billing" for it.
- Checkout refuses on `BlockingCheckoutSubscriptionStatuses` (`src/domain/value-objects/subscription-status.ts:40-41`), at `create-checkout-session.ts:120-129`.
- Trial eligibility is stated on the page and again in checkout (`:132`).

**The cancellation date:**
- `app/(app)/app/billing/page.tsx:22-31` formats with `timeZone: 'UTC'`, used at `:148-157`.
- `src/application/shared/renewal-notice-email-format.ts:57-74` (`formatRenewalNoticeCutoff`) is DEBT-414 F06's formatter.
- The billing formatter also duplicates `lib/format-date.ts`.

**History:**
- DEBT-181: pricing data duplicated.
- DEBT-410 and DEBT-412: trial copy.
- BUG-247: a failure route showing checkout copy.
- BUG-308: the trial banner copy.
- BUG-338 and DEBT-480: a published contact that led nowhere.
- BUG-052, BUG-075, DEBT-383: the pricing CTA and the checkout guard disagreeing.
- BUG-229 and DEBT-414 F06: dates in the wrong time zone.

## Impact

A changed Stripe price, or a changed constant in one copy, would charge or grant something other than what the customer read and accepted. Nothing would fail until a customer noticed. That carries legal weight under DEBT-414's renewal-consent work, and it matters most before the first live sale. P2.

## Options

1. **One offer module, and a check against Stripe.** *Recommended:* it ends the hand copies, and adds the one check that compares what is shown with what is charged.
   - The module holds the amounts, trial days, support contact, terms version and date. The server use case reads it, and the copy is built from it.
   - Frozen consent texts stay frozen as evidence; a test ties each live copy to the module.
   - A deploy-time check (or the existing daily job) reads each configured Stripe price and compares its amount, currency and interval with the module, alerting on a mismatch.
   - One `checkoutOffer(subscription, now)` domain function serves the page and the checkout guard.
   - The billing page uses F06's cutoff formatter.
2. **Fix the cancellation date only,** and leave the rest to DEBT-501 item 2's stored-terms work. That fixes the live defect and leaves the price check unbuilt.

Legal texts must stay literal; the module feeds their tests, not their bytes.

## Resolution (proposed)

The cancellation date first, red first with a period ending at 03:00 UTC. Then the Stripe price check before the first live sale, beside DEBT-501 item 2. Then the offer module.

## Verification

- [ ] The billing page states a scheduled cancellation with F06's formatter.
- [ ] A check fails when a configured Stripe price's amount, currency or interval differs from the offer shown.
- [ ] Trial days, amounts, saving and support address each have one source, and tests tie every copy to it.
- [ ] The pricing page and checkout read one offer function.

## Related

- DEBT-414 (F06, F22): renewal consent and cutoff presentation.
- DEBT-501 item 2: stored plan terms.
- DEBT-524: the three blocking-status lists this adds a fourth to.
