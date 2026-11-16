# BUG-380: The Hosted Checkout Smoke Cannot See Stripe's Iframed Form

**Status:** Open — find the hosted Checkout controls in any frame with `page.frameLocator()`, and open an owner-assigned issue on a failed scheduled run; due 2026-11-22
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
- **Page snapshots** (the run's `stripe-hosted-checkout-test-results` artifact, `error-context.md` per test, and the same in the first red run 43330728923). Outside the frame, the page shows only the banner, the plan summary and the footer. The form sits under an `iframe` with no accessible name. Inside it are the Email field, the payment method (now `button "Card"`, not the `radio "Card"` the helper expects), the terms box and the Subscribe button. The snapshot was taken before Card expanded, so it does not show where the card fields sit; they may be in a nested frame.

## Impact

- The lane is blind. It exists to catch Stripe-owned Checkout changes that break the journeys the required E2E cannot reach: the trial's terms consent and setup-mode card save (DEBT-414 F03b) and portal cancellation (DEBT-414 F04). While it is red, a real regression in those journeys would go unseen.
- Nothing suggests buyers are affected: Stripe's page renders its own form; live checkouts were not checked.
- The failures ran three days without a record. The workflow opens no issue when a scheduled run fails. GitHub emails a scheduled run's failure to whoever last changed its cron line, which `git blame` shows is the owner's account in both Stripe workflows; whether that arrives depends on their email settings.

## Options

1. **Find the form's controls in whichever frame holds them.** Playwright 1.65.0's `page.frameLocator()` with no selector "starts the search in any frame on the page - the main frame or any of the iframes" (`playwright-core/types/types.d.ts:3004-3007`). Its source walks the whole frame subtree, nested frames included (`_anyFrameCandidates` in `lib/coreBundle.js`), and a match in two frames throws "frameLocator() matched elements in multiple frames." So it covers Stripe's iframe, a nested card frame and the old frameless page alike, with no dependence on frame order. Inside it, choose card by the `Card` button as well as the old radio and "Pay with card" layouts.
2. **Retire the hosted lane.** This removes the maintenance, but also the only check of the consent and cancellation journeys on Stripe's own pages. Rejected.
3. **Report a failed scheduled run as an issue assigned to the owner,** through the assigned-issue path the watchers use since BUG-377. No workflow reports its own failed run today. It would have surfaced this on 11-13. It adds one job and a small script.

## Resolution (decided)

Options 1 and 3, in one code pull request (option 3 chosen by the owner on 2026-11-15).

- **Option 1.** Every locator in `tests/e2e/helpers/stripe-hosted-checkout.ts` starts from `page.frameLocator()`, with no selector. It replaces both an `iframe` `.first()` and a page fallback, and fails loudly if a control ever matches in more than one frame. Red first against the saved snapshot shape, then the helper change.
- **Option 3.** A small new script under `scripts/watchers/`, run with `GH_TOKEN`, calls `syncAlertIssue` with `createGithubAlertIssues(repositoryOwner())` (`scripts/watchers/github-alert-issues.ts`, `scripts/lib/github-issues.mts`), one title per workflow. Both scheduled Stripe workflows, hosted Checkout and provider contracts, gain a separate job that `needs:` the test job, holds `issues: write`, and runs on every scheduled run that was not cancelled (`if: ${{ !cancelled() && github.event_name == 'schedule' }}`; a bare `failure()` gate could not close the issue). When the test job failed, it opens or updates the issue with the run's link; when it passed, `syncAlertIssue(…, null)` closes the issue. The test job's token stays at `contents: read`, the only permission either workflow grants today. Red first in `tests/ci-workflow.test.ts` and in the script's own test, with `MemoryIssues`.

Then dispatch a hosted run on the fix branch.

## Verification

- [ ] The helpers find every control they touch inside Checkout's iframe, and on a page without one: the card choice (`Card` button, radio or "Pay with card"); the card number, expiry, CVC, name and postal code fields, even in a nested frame; the save-information and terms boxes; the Email field; `getByText(email)`; and the Subscribe (or start-trial) and Save buttons.
- [ ] A dispatched `Stripe hosted Checkout compatibility` run on the fix branch passes all five journeys.
- [ ] A failed scheduled run opens an issue assigned to the owner, and the next green scheduled run closes it, red first in the tests above.
- [ ] The first scheduled run on `main` after the fix's promotion passes.

## Related

- BUG-340: Stripe renamed Checkout's save-information box on 2026-10-12.
- DEBT-414: F03b and F04 are the journeys this lane observes.
- BUG-377: assigned issues for scheduled jobs.
- BUG-373: the add-card button twice failed locally (2026-11-01 and 11-02) to open its dialog, its traces lost. If the fixed lane fails at "Add a card to keep access", keep the trace and file a bug.
