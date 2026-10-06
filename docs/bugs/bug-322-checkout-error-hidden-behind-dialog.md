# BUG-322: A Checkout Error Is Hidden Behind the Consent Dialog That Reopens

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — the fix reaches production; due 2026-10-13
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

When Checkout cannot start, the pricing page shows "Checkout failed. Please try again." in a banner. Causes include a Stripe error, a timeout, a changed offer, or any refusal other than sign-in, "already subscribed" or the rate limit.

The banner is covered by the plan's consent dialog, which reopens. The overlay blurs and dims the page, and the open dialog hides the rest of the page from screen readers, so the banner's alert is not announced either. The person sees the dialog come back with no explanation, and a lasting failure becomes a silent retry loop.

## Evidence

- **The error redirect keeps the plan.** It goes to `toPricingRoute({ checkout: 'error', plan })` (`app/pricing/subscribe-action.ts:60-62`; also `subscribe-actions.ts:68` for a malformed form).
- **The plan in the URL reopens the dialog.** It makes `isMonthlySelected` (or the annual equivalent) true, which becomes `initiallyOpen`. `PlanConsentDialog` passes that to `<Dialog defaultOpen={initiallyOpen}>` (`app/pricing/plan-consent-dialog.tsx:48`, `app/pricing/pricing-view.tsx:172-179`). The dialog's `key` is unchanged, so one already open stays open.
- **The banner sits under the overlay.** The banner (`app/pricing/pricing-view.tsx:65-100`) renders under the dialog overlay (`bg-background/80 backdrop-blur-sm`, `components/ui/dialog.tsx`).
- **Tests cover the text only.** The page tests check the banner's text, not that it can be seen while the dialog is open.

## Impact

A willing buyer whose Checkout fails sees nothing explain why, and may assume the button is broken. During a Stripe outage, every attempt looks like this.

## Options

1. **Drop `plan` from the error redirect.** The dialog stays closed and the banner shows, but the person must reopen the dialog and consent again.
2. **Show the error inside the reopened dialog,** as an alert above its consent controls. The person sees why, in the place they act, and screen readers announce it.

## Resolution (decided)

Option 2. The dialog is where the person retries, so the explanation belongs there. The page banner stays for a closed dialog.

## Progress

**2026-10-06, the fix.**
- **`PlanConsentDialog` takes an `errorMessage`.** It shows above the consent controls as an `ErrorCard`, the registry's persistent inline error (F-3), which carries `role="alert"`.
- **`PricingView` passes an error banner's message only to the dialog that reopens for the selected plan.** A dialog the person opens for the other plan shows none. The page banner stays for a closed dialog.
- **Tests,** written red first in `plan-consent-dialog.browser.spec.tsx`. The reopened dialog contains the error as a visible alert; the other plan's dialog contains none. A server-rendered test cannot see a Radix dialog's portal, so the check is a browser test.
- **Viewed.** A screenshot from Chromium with the app's stylesheet shows the error card inside the open dialog, above the terms, with the page banner blurred under the overlay. It is not committed.

## Verification

- [x] With `?checkout=error&plan=monthly`, the open dialog contains the error as an alert. Red first.
- [x] A browser test confirms the alert is visible while the dialog is open, as an element with `role="alert"`, which screen readers announce.
- [x] A screenshot of the dialog showing the error is viewed.
- [ ] The fix reaches production.

## Related

- [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md), [BUG-321](./bug-321-already-subscribed-answer-discarded.md): the same hunt.
