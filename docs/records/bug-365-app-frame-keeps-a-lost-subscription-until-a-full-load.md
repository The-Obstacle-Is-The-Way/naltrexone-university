# BUG-365: The App Frame Keeps a Lost Subscription Until a Full Load

**Status:** Verifying — the owner's no-card live trial check, recorded in BUG-364's combined check; due 2026-11-22
**Priority:** P3
**Date:** 2026-10-22

---

## Summary

The subscription gate and the trial banner ran only in the shared app layout, which App Router does not re-render on client-side navigation. A learner who lost entitlement with a tab open kept the trial banner and app navigation, and pages showed a bare "Subscription required" with no route to Pricing, until the next full load.

## Evidence

Found on the dev preview on 2026-10-22: after an immediate cancel in the Stripe sandbox, a client navigation to Dashboard showed "Unable to load stats. Subscription required" inside the stale frame, and Billing showed "Canceled" under the trial banner. The only entitlement redirect was `enforceEntitledAppUser` (`app/(app)/app/layout.tsx:54`); the controllers' check (`src/adapters/controllers/require-entitled-user-id.ts`) returned `UNSUBSCRIBED`, which no client code handled.

## Impact

Display and navigation only: the controllers refuse the data. A learner who lost access saw a trial countdown and a bare error with no path to Pricing.

## Options

1. Redirect on loss of access, close to the data. Chosen.
2. Refresh the router when entitlement changes. Rejected: it needs a client signal for a change made at the provider.

## Resolution (decided)

Option 1, chosen by the owner on 2026-10-22, released in promotion #1613 (2026-11-01):
- Server-rendered pages redirect to `/pricing?reason=subscription_required` when a data check returns `UNSUBSCRIBED` (`app/(app)/app/shared/redirect-if-unsubscribed.ts`).
- Browser-loaded pages call server actions through `app/(app)/app/shared/client-actions.ts`, which navigates to Pricing on `UNSUBSCRIBED`; `tests/app-client-action-imports.test.ts` fails if a page imports an action directly.
- Billing is unchanged: it shows the true status, and its other links lead to Pricing. Rule R2 names the proving tests.

## Verification

- [x] Red first, for the server pages and the browser pages, including the import scan.
- [x] Dev preview on `5c8c9f2b` (2026-10-28 and 10-29), the tree released in #1613: after an immediate sandbox cancel with the app open, navigating to the dashboard landed on `/pricing?reason=subscription_required`, and **Try again** in an open practice question replaced the page with Pricing.
- [ ] Production, carried by BUG-364's combined check: the owner's one no-card live trial checks both records. This record's half: with the app open, an immediate live Dashboard cancel, then navigating to the app's dashboard lands on Pricing. When BUG-364 records it, this record closes as Resolved.

Corrected 2026-11-15: the production check, this record's only open item, is run once with BUG-364's and recorded there; this record stays Verifying until then and closes as Resolved, not Superseded (reviewing session). Re-dated from 2026-11-08, when the check had not been run. Finished build history is in git at 34d9aea0.

## Related

BUG-364 (records the combined production check), DEBT-414.
