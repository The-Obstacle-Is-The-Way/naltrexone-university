# BUG-350: The Billing Page States a Scheduled Cancellation as a UTC Date, a Day Late for a US Evening

**Status:** Open — use DEBT-414 F06's cutoff formatter on the billing page, red first with a period ending at 03:00 UTC
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

A scheduled cancellation is an instant: the end of the current period. It is formatted in two ways:
- **The billing page** shows a bare UTC calendar date: "Your subscription will cancel on Nov 1. You'll keep access until then."
- **The renewal emails** state the same instant in UTC, then in US Eastern and Pacific time, as DEBT-414 F06 requires.

For a period that ends on a US evening, the UTC date is the next day. Stripe keeps the time of day of the signup, so a US-evening signup ends on a US evening every period.

Example: access ends at 2026-11-01T01:00Z, which is 9 PM Eastern on 31 October. The page says access lasts "until" 1 November, a day later than it does for that reader. The window is periods ending before 04:00 to 08:00 UTC, depending on the reader's US zone and daylight time.

## Evidence

- `app/(app)/app/billing/page.tsx:22-31`: `billingDateFormatter` uses `timeZone: 'UTC'`, with no time. It is used for the cancellation notice at `:148-157`.
- `src/application/shared/renewal-notice-email-format.ts:57-74`: `formatRenewalNoticeCutoff`, F06's formatter, names the local date and time whenever they differ from UTC.
- The billing formatter also duplicates `lib/format-date.ts`.
- History: BUG-229 (the footer's year in local time), DEBT-414 F06.

## Impact

A US learner who cancels can read that they keep access for an evening longer than they do. The emails state the cutoff correctly, and Stripe's portal shows its own date. P3, but it concerns how cancellation terms are presented, which DEBT-414 treats as consent-bearing.

## Options

1. **Use F06's formatter on the billing page.** *Recommended:* one formatter for every statement of a cutoff.
2. **Show the UTC time beside the date.** This is accurate, but harder to read than F06's form.

## Resolution (proposed)

Option 1, red first: a page test with `currentPeriodEnd` at 03:00 UTC expects the previous day's local date and time to appear.

## Verification

- [ ] The billing page states a scheduled cancellation with F06's formatter.
- [ ] No other page formats a billing cutoff in UTC alone.

## Related

- DEBT-414 (F06): the cutoff wording.
- DEBT-530: the other hand-kept commercial terms.
