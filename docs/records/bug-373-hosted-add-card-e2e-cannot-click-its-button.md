# BUG-373: The Hosted Trial Add-Card E2E Cannot Click Its Add-Card Button

**Status:** Verifying — traces gone, never seen in CI; closes as Accepted in this pull request; BUG-380 carries its history; due 2026-11-22
**Priority:** P3
**Date:** 2026-11-02

---

## Summary

`tests/e2e/stripe-hosted-trial-add-card.spec.ts` ("a trialing learner opts in,
saves a card…") timed out in two of about seven local runs of the observational
hosted Checkout lane, on 2026-11-01 and 2026-11-02. Both stopped at the same
step: after the no-card trial checkout returns to the app, the test clicks "Add
a card to keep access" in the trial banner (:79-83), and the add-card dialog
never opens.

1. **In the 295a1179 run,** each of 324 click attempts found the button
   visible, enabled and stable, then "element is outside of the viewport"
   after scrolling, so the click never ran.
2. **In the 7437b02d run,** the click ran and no request or dialog followed.
   The test clicks as soon as the URL changes, so a click before the page
   hydrated is the likely cause; not confirmed.

Neither cause can now be found: both runs' traces were overwritten, and only
the required lane's gate logs remain. The hosted lane has never shown it in CI.

## Evidence

- **CI.** The scheduled `Stripe hosted Checkout compatibility` workflow passed
  31 consecutive days, 2026-10-13 to 2026-11-12, add-card included. It has
  failed since 2026-11-12 23:39Z for an unrelated reason: Stripe moved its
  Checkout form into an iframe (BUG-380).
- **The markup.** `TrialCountdownBanner` (`app/(app)/app/layout.tsx:176`)
  renders the button in an ordinary block at the top of the app frame, not a
  fixed or sticky one.
- **Elsewhere.** The same button opens its dialog in
  `trial-payment-consent-dialog.browser.spec.tsx` and in the required
  `tests/e2e/trial-add-card.spec.ts`, which clicks it after a full `page.goto`
  and passes in every CI run.

## Impact

No user-facing failure is known. The cost is a local flake in an observational
lane.

## Options

1. Find the cause from a trace. Not possible: none remains.
2. Make the hosted test wait for the page to be interactive before clicking.
   It addresses the second failure only, and only on an unconfirmed cause.
3. Close, and act on the next occurrence, which keeps its trace.

## Resolution (decided)

Option 3, decided 2026-11-15 by the reviewing session, at the owner's
delegation. No Waiting row: any hosted-lane failure is investigated anyway, and
BUG-380 records this history for its add-card step. If a hosted run, local or
CI, fails at "Add a card to keep access", keep that run's trace locally (it
carries session URLs), name the cause, and file a new bug.

## Verification

- [x] The cause of each failure is named, or recorded as unknown with what was
      checked: unknown; the traces are gone (checked 2026-11-15), and CI never
      showed it.

## Related

- BUG-380: the hosted lane's current failure.
- BUG-364: the trial banner's other states.

Corrected 2026-11-15: the two runs' traces no longer exist, so the next step was impossible; CI passed the journey for 31 days before BUG-380; the lapsed 2026-11-05 step is resolved by moving the record to a Waiting row. Finished investigation detail is in git at 34d9aea0.
