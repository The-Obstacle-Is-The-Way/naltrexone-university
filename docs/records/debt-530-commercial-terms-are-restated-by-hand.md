# DEBT-530: Commercial Terms Are Restated by Hand in Each Place That Shows Them

**Status:** Open — share versioned offer values and active-copy checks while preserving historical consent; consolidate blocking statuses only under DEBT-501's billing contract
**Priority:** P3
**Date:** 2026-10-17

---

Corrected 2026-10-17: restored existing test evidence, preserved historical consent and owner approval, and specified inward offer contracts and period-sensitive status behavior.

## Summary

Several commercial terms have no single owner. Each is typed by hand where it appears:
- the trial length;
- the plan amounts;
- the yearly saving;
- the support address;
- the terms version and its effective date;
- which subscription statuses block a new checkout.

They agree today: $29 and $199, a 7-day trial, 12 × 29 − 199 = 149, and one address. But each change to an offer must find every copy, and the values are pinned by separate tests rather than one complete cross-surface offer contract. Existing tests check granted trial days, active disclosure text/version, amounts and historical hashes; a lone trial-constant change would fail them.

The blocking statuses are kept in three explicit lists, and the pricing page's fall-through in `determineNonEntitledReason` is a fourth, implicit copy: for a current subscription period it treats canceled/paymentFailed as nonblocking, paymentProcessing as pending, and falls back to manage_billing for the others. Expired periods have a separate path. They agree for all eight statuses today. DEBT-524 found the three lists and closed on 2026-10-17 without placing them in a live record; this record owns them.

Whether Stripe charges the amount shown is owned elsewhere: DEBT-501 item 2's step 5, where checkout refuses a configured price whose amount or interval differs from `lib/pricing-data.ts`.

The billing page's cancellation date, a live presentation defect in the same area, is BUG-350.

## Evidence

**Trial length:**
- The server's private constant: `FREE_TRIAL_DAYS = 7` (`src/application/use-cases/create-checkout-session.ts:25,132`).
- "7" typed separately in:
  - `lib/pricing-data.ts:37,49,82`
  - `app/pricing/plan-consent-dialog.tsx:99`
  - `app/pricing/pricing-view.tsx:262`
  - `app/(marketing)/checkout/success/page.tsx:61`
  - `app/(marketing)/terms/terms-content.ts:45`
  - the frozen consent registry, `lib/checkout-disclosures.ts:26-60`
- The runtime fence (`create-checkout-session.ts:144-155`) compares trial eligibility and the disclosure version, not the text/hash or granted days directly. `create-checkout-session.test.ts:340-383` pins the actual seven days. `lib/pricing-data.test.ts:77-107` checks cancellation text against Terms and pins amount/version/hash; `lib/checkout-disclosures.test.ts:47-81` checks historical hashes and active copy against its registry entry.

**Amounts and saving:**
- `lib/pricing-data.ts` holds each amount twice: `price: '$29'` beside `amountCents: 2900` (`:30-32`), and the same for the annual plan (`:41-43`).
- The saving is typed: `savings: 'Save $149 per year'` (`:47`). The terms text states the amounts again.

**Support address:**
- The owner is `lib/support.ts:4`.
- The address is also typed in:
  - `lib/pricing-data.ts`, three times
  - `app/pricing/page.tsx`
  - `app/pricing/pricing-view.tsx`
  - `src/application/shared/renewal-notice-email-format.ts`, three times
  - the terms, seven times
  - the privacy policy
- Each test pins its own literal.

**Terms version and date:**
- `TERMS_VERSION = '2026-08-09'` (`lib/pricing-data.ts:13`) and `effectiveDate: 'August 9, 2026'` (`terms-content.ts:6`) are not linked.
- The content hash covers only the body.

**Blocking statuses:**
- The domain's list: `BlockingCheckoutSubscriptionStatuses` (`src/domain/value-objects/subscription-status.ts:40-41`).
- Checkout's Stripe-side list: `BLOCKING_SUBSCRIPTION_STATUSES` (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:58-65`).
- Reconcile's list: `BLOCKING_STATUSES` (`src/adapters/jobs/reconcile-stripe-subscriptions.ts:22-29`).
- The fall-through: `determineNonEntitledReason` separately handles an expired period and pending payment before its current-period status fallback (`src/domain/services/entitlement.ts:23-32`). The pricing page reads that reason; list extraction must preserve those distinctions.
- The two Stripe-side lists name Stripe's statuses; the domain's names ours, and the status mapping joins them.

**Email copy:**
- The notice and acknowledgment emails each carry their own footer and `formatAmount`: `src/application/use-cases/send-due-renewal-notices.ts` and `send-renewal-acknowledgment.ts`.
- The footers already differ in punctuation and in how the refund line is introduced.

**History:**
- DEBT-181: pricing data duplicated.
- DEBT-410 and DEBT-412: trial copy.
- BUG-247: a failure route showing checkout copy.
- BUG-308: the trial banner's copy.
- BUG-338 and DEBT-480: a published contact that led nowhere.
- BUG-052, BUG-075 and DEBT-383: the pricing call to action and the checkout guard disagreeing.

## Impact

A change made to one copy can leave another stating old terms. Existing tests catch several isolated changes; an author could update separate expectations without proving that the granted offer and every active surface agree. No present commercial-term mismatch was demonstrated. Legal texts are evidence and must stay literal, which is why the tie belongs in tests. P3 today; it matters most when an offer changes.

## Options

1. **One offer module.** *Recommended:* it ends the hand copies without touching the evidence.
   - Use versioned offer values for amounts/trial policy and an applicable legal version/date, with a separate support-contact value. Keep presentation formatting and billing lifecycle logic out of the offer contract.
   - Keep pure business values inward or inject an application-owned offer configuration through the composition root, extending the existing `getRenewalTerms` seam. Use cases must not import outer `lib/pricing-data.ts`, `lib/support.ts` or `app` modules. Build current presentation outward from that contract.
   - Pin historical disclosure versions and stored acknowledgment terms unchanged. Tie only the active registered disclosure and current legal copy to their applicable offer version. An authorized offer change appends a disclosure version. ADR-027 Decision 4 retains owner approval for adopted wording/version changes; this record does not authorize them.
   - Share email footer formatting, while the acknowledgment continues to render the accepted, stored terms rather than today's price. Existing-subscriber changes remain with DEBT-501 and the price-change freeze.
   - The blocking statuses become one domain list that checkout, reconcile and the pricing page's reason read. It is a billing rule, so it follows DEBT-501's shared billing contract (adopted 2026-10-17): the contract is defined first, then the list is extracted.
2. **Tests only:** keep every literal, and add tests that compare each copy with `FREE_TRIAL_DAYS`, `amountCents` and `SUPPORT_EMAIL`. This is cheaper, and it leaves the constants scattered.

## Resolution (proposed)

Option 1, with the next offer or copy change, red first: a test that fails when any live copy states a trial length, amount or address other than the module's. The blocking-status list moves with DEBT-501's contract, in the first implementation of its item 2 or BUG-343 option 4.

## Verification

- [ ] Trial days, amounts, saving and support address each have one source, and tests tie active copy to its applicable version while preserving historical evidence.
- [ ] The applicable terms version and effective date agree; historical versions remain immutable.
- [ ] One list decides which statuses block a new checkout; checkout, reconcile and the pricing page read it, and tests cover all eight statuses across current and expired periods, including pending-payment presentation.

## Related

- DEBT-501: item 2's step 5 owns the Stripe price check; its shared billing contract governs the blocking-status list.
- DEBT-524 (closed): found the three blocking-status lists.
- BUG-350: the billing page's cancellation date.
- DEBT-414: renewal consent.
