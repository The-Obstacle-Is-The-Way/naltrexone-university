# BUG-365: The App Frame Keeps a Lost Subscription Until a Full Load

**Status:** Verifying — promotion to main and the dev-preview check; due 2026-10-29
**Priority:** P3
**Date:** 2026-10-22

---

## Summary

The subscription gate and the trial banner run only in the shared app layout, and App Router does not re-render a layout on client-side navigation. When a learner loses entitlement while a tab is open, the app frame stays until the next full load:
- It keeps the trial banner and the app navigation, with no redirect to `/pricing`.
- The page inside it shows a bare refusal, "Subscription required", with no route to Pricing.

Losing entitlement this way most often means a no-card trial reaching its end, which needs no webhook, or a cancellation.

## Evidence

Found on the dev preview during the billing-and-entitlement QA run for promotion #1594, 2026-10-22. The test account's trial had a saved card. Its subscription was canceled immediately in the Stripe sandbox Dashboard. Then:
1. **Navigating in the app to Dashboard** showed "Unable to load stats. Subscription required" inside the app frame. The frame still had the trial banner, and there was no redirect.
2. **Billing** showed "Pro Monthly · Canceled", with the trial banner still above it. The learner reported pressing Cmd+R.
3. **`/app/dashboard` typed into the address bar** about a minute later redirected to `/pricing`: "Your subscription is inactive. Choose a plan to restart access."

The code, read against Next 16.4.1:
- **Observation 1 is explained.**
  - The only entitlement redirect is `enforceEntitledAppUser` in `app/(app)/app/layout.tsx`.
  - `proxy.ts` only requires sign-in.
  - Next's own documentation says layouts "don't re-render on navigation, meaning the user session won't be checked on every route change" (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`).
  - The dashboard's refusal comes from the controllers' check (`src/adapters/controllers/require-entitled-user-id.ts`), which returns `UNSUBSCRIBED`.
  - No client code handles `UNSUBSCRIBED`, and the dashboard's only action is "Go to Practice", another gated page.
- **Observation 2 is most likely a soft navigation too,** for example the banner's own "Manage billing" link: it renders exactly this screen without a reload.
  - Within one full load, the layout and the page share one memoized entitlement read (`lib/auth-request-cache.ts`), so a single document load cannot show both a trial banner and "Canceled".
  - A layout cached across requests is ruled out: `next.config.ts` enables Cache Components, but the layout and the pages call `connection()`, and the only `'use cache'` is in the pricing skeleton.
  - A webhook race is ruled out: observation 1 already showed the row was not entitled, and R12 forbids moving a subscription back to an older state.
- **A trial past its end shows "1 day left in trial",** because the banner clamps the countdown to 1 day (`layout.tsx`, `getTrialDaysLeft`). That makes the stale frame more misleading after a trial expires.

## Impact

- **Display and navigation only.** Data access is refused by the controllers' entitlement check.
- **A misleading frame.** A learner who lost access sees a trial countdown, and possibly a renewal claim (BUG-364), with a bare error and no path to Pricing until a full load.

## Options

1. **Redirect on loss of access, close to the data (recommended).**
   - When a controller returns `UNSUBSCRIBED`, server pages call `redirect()` to `/pricing?reason=…`; a soft navigation honors it.
   - Client-action pages route through one shared handler that does the same.
   - This follows Next's guidance to check authorization close to the data, rather than relying on the layout.
2. **Refresh the router when entitlement changes.** This needs a client-side signal for a change that happens at the provider. More moving parts.

## Resolution (decided)

Option 1, chosen by the owner on 2026-10-22: a page whose data check finds no subscription sends the learner to Pricing. Pricing states the reason from the learner's own entitlement, not from the URL: a trial that never started, an ended trial, or an inactive subscription.
- **Server-rendered pages.** The dashboard, bookmarks and history render on the server on every client navigation. When a data check returns `UNSUBSCRIBED`, they redirect to `/pricing?reason=subscription_required` (`app/(app)/app/shared/redirect-if-unsubscribed.ts`).
- **Pages that load in the browser.** The practice, practice-session and question pages call server actions through one module (`app/(app)/app/shared/client-actions.ts`). When an action returns `UNSUBSCRIBED`, a full navigation replaces the page with Pricing, as the server pages' `redirect()` does, and leaves the app layout. The action still returns its result.
  - The server actions cannot redirect themselves without importing Next.js into `src/adapters`.
  - `tests/app-client-action-imports.test.ts` fails if an app page or a shared component imports an action directly, through the alias, a relative path or a dynamic import. It also fails if a client action skips the redirect or calls a different action, or if a controller action has no client action.
- **Rule R2** names the proving tests.
- **Rejected:** running the layout's gate in every page. It would have needed own-code module mocks in most page tests, against the test-double rules, and the data checks already carry the answer.
- **Not changed: Billing.** It reads the subscription directly, so after a lost subscription it shows the true status, for example "Canceled", with **Manage in Stripe**. Its other links now lead to Pricing, so it is not a dead end; the stale frame above it clears on the next navigation or full load.

## Verification

- [x] Red first, for the server pages: the helper and the dashboard, bookmarks and history pages redirect a learner whose data check returns `UNSUBSCRIBED` to Pricing. Removing the call fails each test.
- [x] Red first, for the browser pages: `redirectOnUnsubscribed` navigates to Pricing on `UNSUBSCRIBED` and returns the result. The import scan failed while 14 hooks imported actions directly. With one client action unwrapped, the scan fails; the page tests alone did not, as the adversarial review showed.
- [ ] Dev preview: lose entitlement with the app open, for example by canceling immediately in the Stripe sandbox. Navigating in the app, and acting inside a practice session, each land on Pricing. Record whether the Billing observation was a client navigation (Network panel, Preserve log).
- [ ] Production after promotion.

## Related

BUG-364, DEBT-414.
