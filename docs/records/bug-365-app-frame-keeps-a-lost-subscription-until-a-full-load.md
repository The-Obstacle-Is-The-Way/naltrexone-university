# BUG-365: The App Frame Keeps a Lost Subscription Until a Full Load

**Status:** Open — choose and implement the controller-side redirect; reproduce the Billing observation with request capture
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

Not decided. Option 1 is recommended, and the owner or the implementer confirms it before code.

## Verification

- [ ] Reproduce observation 2 in Chrome with the Network panel set to preserve the log, after checking the row's status in the database first:
  1. From an app page loaded before the cancellation, click "Manage billing". Expected: a request with the `RSC` header, no document request, the stale banner, and "Canceled".
  2. Press Cmd+R. Expected: a document request for `/app/billing` and a redirect to `/pricing`, possibly as a streamed 200 whose body redirects.
  3. Repeat with back and forward: Cache Components preserves routes there with `<Activity>`.

  If step 2 renders both the banner and "Canceled", the explanation above fails: capture the Vercel runtime logs and the row's `updated_at`.
- [ ] Red test first for the chosen option: a page whose controller returns `UNSUBSCRIBED` redirects to `/pricing`.
- [ ] Dev preview: lose entitlement with a tab open, navigate in the app, and land on Pricing.

## Related

BUG-364, DEBT-414.
