# BUG-350: The Billing Page States a Scheduled Cancellation as a UTC Date, a Day Late for a US Evening

**Status:** Verifying — billing and email share the explicit cutoff formatter; promotion to main remains, due 2026-10-19
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

A scheduled cancellation is an instant: the end of the current period. Before this fix, it was formatted in two ways:
- **The billing page** showed a bare UTC calendar date: "Your subscription will cancel on Nov 1, 2026. You'll keep access until then."
- **The renewal emails** state the same instant in UTC, then in US Eastern and Pacific time, as DEBT-414 F06 requires.

At `2026-11-01T01:00Z`, the old page formatted `Nov 1, 2026`; the cutoff is October 31 at 9 PM EDT and 6 PM PDT. A date without its time and zone can suggest access continues into the next local day. The entitlement instant itself is unchanged.

Any cutoff before 04:00 to 08:00 UTC, by mainland US zone and daylight time, shows the next day's date. Trials use `trial_period_days` (`stripe-checkout-sessions.ts:1347`), so later periods keep the signup's UTC time of day unless a plan change resets the anchor.

## Evidence

- At `92e56929`, `app/(app)/app/billing/page.tsx:22-31` defined `billingDateFormatter` with `timeZone: 'UTC'` and no time; `:148-157` used it for cancellation. The page now calls `formatRenewalNoticeCutoff` at `:144`.
- `src/application/shared/renewal-notice-email-format.ts:57-74`: `formatRenewalNoticeCutoff`, F06's formatter, names the local date and time whenever they differ from UTC.
- The removed billing formatter repeated `lib/format-date.ts`'s UTC date-only presentation for valid dates, but their input and invalid-date behavior differed.
- History: BUG-229 (the footer's year in local time), DEBT-414 F06.

## Impact

Until promotion, a US learner who cancels can read that they keep access for an evening longer than they do. The shared email formatter states an explicit cutoff. Stripe's portal shows its own date, which was not checked. P3, but it concerns how cancellation terms are presented, which DEBT-414 treats as consent-bearing.

## Options

1. **Use F06's formatter on the billing page.** *Recommended:* one formatter for this cancellation notice and the existing email cutoff. If it moves, keep it in a pure inward module both callers may import; do not make application email code depend on outer `app` or `lib` presentation code.
2. **Show the UTC time beside the date.** This is accurate, but harder to read than F06's form.

## Resolution (built)

Option 1: the billing page calls F06's existing formatter directly. Six page cases failed first on the date-only output and now pass: 03:00 UTC on the prior US evening, both fall-back hours, both sides of spring-forward, and the prior US year. The email formatter's existing tests still pass. No entitlement or cancellation instant changes.

## Verification

- [x] The billing page states a scheduled cancellation with F06's formatter.
- [x] The billing page and email formatter agree on explicit UTC, Eastern and Pacific cutoff times, including daylight saving boundaries.
- [x] No other page formats a billing cutoff in UTC alone. The other page-level trial display is a relative days-left banner; Checkout success uses the period end to decide access, not as a displayed date.
- [ ] Promote to `main`; due 2026-10-19.

## Related

- DEBT-414 (F06): the cutoff wording.
- DEBT-530: the other hand-kept commercial terms.
