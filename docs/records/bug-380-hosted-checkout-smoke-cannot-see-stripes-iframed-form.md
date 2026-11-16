# BUG-380: The Hosted Checkout Smoke Cannot See Stripe's Iframed Form

**Status:** Open — scope the hosted Checkout helpers' locators to Stripe's iframe, and open an owner-assigned issue on a failed scheduled run; due 2026-11-22
**Priority:** P3
**Date:** 2026-11-15

---

## Summary

The scheduled `Stripe hosted Checkout compatibility` workflow has failed every run since 2026-11-12 23:39Z. Stripe's hosted Checkout page now renders its form (contact, payment method, card fields and the terms box) inside an `iframe`. The helpers in `tests/e2e/helpers/stripe-hosted-checkout.ts` look for those controls on the top-level page with `page.getByRole` and `page.getByLabel`, which do not search inside frames, so they find nothing. No repository change caused it: Stripe changed its markup, as it did on 2026-09-29 and 2026-10-12 (BUG-340).

## Evidence

- **Runs.** `gh run list --workflow stripe-hosted-checkout-smoke.yml`: success on 11-10, 11-11 and 11-12 17:39Z (`911adb61`), then failure on 11-12 23:39Z (`9a92612a`, manual), 11-13, 11-14 and 11-15 (scheduled). Between the two heads, the only code change is the `@sentry/nextjs` 11.11.0 update (4826c0a7), which does not touch Stripe's page.
- **Failures** (run 43735624645). Four of the five journeys fail:
  - trial start, trial add-card and portal trial cancellation fail in `acceptHostedCheckoutTerms` at `tests/e2e/helpers/stripe-hosted-checkout.ts:127`: `getByRole('checkbox', { name: /I agree to .*Terms of Service and Privacy Policy/i })`, element not found after 30 seconds;
  - paid annual checkout fails earlier, in `fillHostedCheckoutTestCard` at `:74`: within 30 seconds the poll sees no Card radio, no "Pay with card" button and no card-number field;
  - the paid portal cancellation passes; it never opens hosted Checkout.
- **Page snapshots** (the run's `stripe-hosted-checkout-test-results` artifact, `error-context.md` per test, and the same in the first red run 43330728923). Outside the frame, the page shows only the banner, the plan summary and the footer. The form sits under `iframe`. Inside it the payment method is now `button "Card"`, not the `radio "Card"` the helper expects.

## Impact

- The lane is blind. It exists to catch Stripe-owned Checkout changes that break the journeys the required E2E cannot reach: the trial's terms consent and setup-mode card save (DEBT-414 F03b) and portal cancellation (DEBT-414 F04). While it is red, a real regression in those journeys would go unseen.
- Real buyers are not affected: Stripe's page works; only the test's locators are stale.
- The failures ran three days without a record. The workflow opens no issue and raises no alert when a scheduled run fails.

## Options

1. **Scope the form locators to Stripe's iframe.** The helpers resolve a form root, the Checkout iframe's content (`page.locator('iframe').first().contentFrame()`, or a stable frame title if Stripe gives one), and fall back to the page when there is no iframe, since Stripe has rolled out markup gradually before. Inside the root, choose card by the `Card` button as well as the old radio and "Pay with card" layouts.
2. **Retire the hosted lane.** This removes the maintenance, but also the only check of the consent and cancellation journeys on Stripe's own pages. Rejected.
3. **Report a failed scheduled run as an issue assigned to the owner,** as the watcher workflows do since BUG-377. It would have surfaced this on 11-13. It adds a workflow step.

## Resolution (decided)

Options 1 and 3, in one code pull request (option 3 chosen by the owner on 2026-11-15). Red first against the saved snapshot shape, then the helper change. Both scheduled Stripe workflows, hosted Checkout and provider contracts, open or update one issue assigned to the owner when a scheduled run fails, through the same assigned-issue path the watchers use. Then dispatch a hosted run on the fix branch.

## Verification

- [ ] The helpers find Checkout's form, card fields and terms box inside its iframe, and fall back to the page without one.
- [ ] A dispatched `Stripe hosted Checkout compatibility` run on the fix branch passes all five journeys.
- [ ] A failed scheduled run opens an issue assigned to the owner, red first in the workflow's test.
- [ ] The first scheduled run on `main` after the fix's promotion passes.

## Related

- BUG-340: Stripe renamed Checkout's save-information box on 2026-10-12.
- DEBT-414: F03b and F04 are the journeys this lane observes.
- BUG-377: assigned issues for scheduled jobs.
- BUG-373: the add-card button twice failed locally (2026-11-01 and 11-02) to open its dialog, its traces lost. If the fixed lane fails at "Add a card to keep access", keep the trace and file a bug.
