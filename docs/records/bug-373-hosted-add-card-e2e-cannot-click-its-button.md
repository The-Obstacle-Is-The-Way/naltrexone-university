# BUG-373: The Hosted Trial Add-Card E2E Cannot Click Its Add-Card Button

**Status:** Open — read the 295a1179 trace's DOM snapshot for the button's box and its ancestors; due 2026-11-05
**Priority:** P3
**Date:** 2026-11-02

---

## Summary

`tests/e2e/stripe-hosted-trial-add-card.spec.ts` ("a trialing learner opts in, saves a card…") timed out at its 180-second limit in two of about seven local runs of the hosted Checkout lane, from 2026-11-01 to 2026-11-02, on heads that did not touch billing. Both stopped at the same step: after the no-card trial checkout returns to the dashboard, the test clicks "Add a card to keep access" in the trial banner, and the add-card dialog never opens. The two failures differ:

1. **The button stays outside the viewport.** In the 295a1179 run, Playwright's click logged 324 retries. Each time, the button was visible, enabled and stable, then "element is outside of the viewport" after scrolling, so the click never ran.
2. **The click lands but nothing responds.** In the 7437b02d run, the click ran about 20 seconds in, and no request or dialog followed. The test clicks as soon as the URL changes, so a click before the dashboard hydrated is the likely cause; not confirmed.

The hosted lane is observational: CI runs it on a schedule on `main`, and `pnpm test:e2e` (required) does not include it. It still costs every gated push about three minutes and a misleading failure.

## Evidence

- **Traces.** The two runs' traces and logs were kept locally, not attached, because a portal or checkout trace carries session URLs. The 295a1179 trace's action log is the source for the counts above. In the 7437b02d trace, the network log shows no request after the click.
- **Not the cause: CSP.** The 295a1179 run's browser log shows "Loading the script … violates the following Content Security Policy directive". Chrome adds that the policy is report-only, and production also sends only `content-security-policy-report-only`, as DEBT-420 decided. Nothing was blocked.
- **The markup.** `TrialCountdownBanner` (`app/(app)/app/layout.tsx`) renders the button in an ordinary block at the top of the app frame, not a fixed or sticky one. So "outside of the viewport" after scrolling is not expected from the layout alone.

## Impact

No user-facing failure is known. The same button opens its dialog in `trial-payment-consent-dialog.browser.spec.tsx`, and the lane's other cases passed in both runs. The cost is a flaky observational lane, which hides a real add-card regression behind a known flake.

## Options

1. Find why the button's box is outside the viewport, from the trace's DOM snapshot: a clipping ancestor, a zero-size box, or a transform during a transition. Fix the cause, in the layout or the test.
2. Make the test wait for the dashboard to be interactive before clicking, and retry opening the dialog until it shows. That addresses the second failure only.
3. Both.

## Verification

- [ ] The cause of each failure is named from its trace, or recorded as unknown with what was checked.
- [ ] The hosted lane passes the add-card case in ten consecutive local runs after the fix.

## Related

- BUG-364 and BUG-365: the trial banner's other states.
- DEBT-420: why the CSP is report-only.
