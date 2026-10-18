# BUG-350: The Billing Page States a Scheduled Cancellation as a UTC Date, a Day Late for a US Evening

**Status:** Open — use DEBT-414 F06's cutoff formatter on the billing page, red first with a period ending at 03:00 UTC
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

A scheduled cancellation is an instant: the end of the current period. It is formatted in two ways:
- **The billing page** shows a bare UTC calendar date: "Your subscription will cancel on Nov 1, 2026. You'll keep access until then."
- **The renewal emails** state the same instant in UTC, then in US Eastern and Pacific time, as DEBT-414 F06 requires.

At `2026-11-01T01:00Z`, the page formats `Nov 1, 2026`; the cutoff is October 31 at 9 PM EDT and 6 PM PDT. A date without its time and zone can suggest access continues into the next local day. The entitlement instant itself is unchanged.

Any cutoff before 04:00 to 08:00 UTC, by mainland US zone and daylight time, shows the next day's date. Trials use `trial_period_days` (`stripe-checkout-sessions.ts:1347`), so later periods keep the signup's UTC time of day unless a plan change resets the anchor.

## Evidence

- `app/(app)/app/billing/page.tsx:22-31`: `billingDateFormatter` uses `timeZone: 'UTC'`, with no time. It is used for the cancellation notice at `:148-157`.
- `src/application/shared/renewal-notice-email-format.ts:57-74`: `formatRenewalNoticeCutoff`, F06's formatter, names the local date and time whenever they differ from UTC.
- The billing formatter repeats `lib/format-date.ts`'s UTC date-only presentation for valid dates, but their input and invalid-date behavior differ.
- History: BUG-229 (the footer's year in local time), DEBT-414 F06.

## Impact

A US learner who cancels can read that they keep access for an evening longer than they do. The shared email formatter states an explicit cutoff. Stripe's portal shows its own date, which was not checked. P3, but it concerns how cancellation terms are presented, which DEBT-414 treats as consent-bearing.

## Options

1. **Use F06's formatter on the billing page.** *Recommended:* one formatter for this cancellation notice and the existing email cutoff. If it moves, keep it in a pure inward module both callers may import; do not make application email code depend on outer `app` or `lib` presentation code.
2. **Show the UTC time beside the date.** This is accurate, but harder to read than F06's form.

## Resolution (proposed)

Option 1, red first: a page test with `currentPeriodEnd` at 03:00 UTC expects the previous day's local date and time to appear.

## Verification

- [ ] The billing page states a scheduled cancellation with F06's formatter.
- [ ] The cancellation page and email formatter agree on explicit UTC, Eastern and Pacific cutoff times, including daylight saving boundaries.
- [ ] No other page formats a billing cutoff in UTC alone.

## Related

- DEBT-414 (F06): the cutoff wording.
- DEBT-530: the other hand-kept commercial terms.
