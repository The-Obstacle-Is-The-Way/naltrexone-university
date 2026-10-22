# BUG-365: The App Frame Keeps a Canceled Trial Until a Full Load

**Status:** Open — reproduce with request capture to establish which request rendered the stale frame
**Priority:** P4
**Date:** 2026-10-22

---

## Summary

After a trial was canceled immediately, the app frame kept showing the trial banner ("7 days left in trial … renews at $29 …") and did not redirect to `/pricing`, while the page inside it already treated the learner as not subscribed. A later typed full load of `/app/dashboard` redirected correctly. This was observed once; the cause is not established.

## Evidence

Found during the billing-and-entitlement QA run on the dev preview for promotion #1594, 2026-10-22, on dev `28f4407d`. Test account `qa-trial-1022+clerk_test@example.com` had a trial with a saved card. Its subscription was canceled immediately in the Stripe sandbox dashboard. Then:
1. **In-app navigation to Dashboard.** The page said "Unable to load stats. Subscription required", but the frame kept the trial banner and the app navigation, and there was no redirect.
2. **Billing, refreshed with Cmd+R.** It showed "Pro Monthly · Canceled", with the trial banner still above it.
3. **`/app/dashboard` typed into the address bar about a minute later.** It redirected to `/pricing`, which showed "Your subscription is inactive. Choose a plan to restart access."

What the code says:
- **The gate and the banner live only in the shared layout.** `enforceEntitledAppUser` in `app/(app)/app/layout.tsx` redirects a learner without entitlement to `/pricing` and supplies the banner's data.
- **Entitlement is fresh on every request.** `getRequestAuthState` (`lib/auth-request-cache.ts`) memoizes only within one request (React `cache`), and `CheckEntitlementUseCase` reads the persisted subscription.
- **Billing reads the same row.** `/app/billing` reads that row through `SubscriptionRepository.findByUserId`.

Hypotheses:
- **App Router keeps layouts across client navigation.** A layout is not re-rendered when navigating between pages that share it. So the gate and the banner only refresh on a full load or a layout change. That explains observation 1 by design. It does not explain observation 2 if Cmd+R was a full document load.
- **Cmd+R was not a full document load in this browser.** For example, a soft refresh that re-fetched only the page.
- **The webhook landed between the layout's read and the page's read** within one request.

## Impact

- **Display only.** Data access is refused by the page's own entitlement check, as observation 1 shows.
- **A misleading banner.** A canceled learner can see a trial countdown and a renewal claim until the next full load. The renewal wording itself is BUG-364.

## Options

To be decided after reproduction:
1. **The gate depends on layout re-rendering.** Add a page-level or route-segment check, or refresh the router when entitlement changes, so client navigation cannot keep a stale frame.
2. **It was a soft refresh or a race.** Record it as not a defect and close.

## Verification

- [ ] Reproduce on the dev preview with the network panel recording. Schedule an immediate cancellation, navigate in-app, then hard-reload. Record which requests were document loads and which were RSC fetches.
- [ ] Decide the option. If it is a defect, add a red test or E2E for the stale frame first.

## Related

BUG-364, observed in the same QA run. DEBT-414.
