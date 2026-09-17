# DEBT-478 implementation verification — 2026-09-16

Authority: [documentation PR #899, D5/D6/D7 ruling](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/899). This implementation is stacked on [DEBT-477 PR #904](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/904). Both remain PREP-ONLY.

## Consent and boundary

The checkout disclosure version is `2026-09-16`. The exact approved [consent data](./consent-ruling-data.json) serialize to 450 characters (monthly trial), 448 (annual trial), 316 (monthly standard), and 313 (annual standard). The 480-character test budget includes labels, colons, spaces, punctuation, and line feeds. No snapshot is truncated. Add-card prose/version, Terms version/hash, prices, and existing subscriber terms are unchanged. The annual-notice cron now uses its own unchanged `2026-08-05` notice version, preserving its repository deduplication identity.

```text
PricingPage (server) → PricingView (dynamic server composition)
  ├─ anonymous → existing Button/Link signup destination
  └─ authenticated plans → PlanConsentDialog (client)
       plan + hasTrial + initiallyOpen + server action
       local form + IdempotencyKeyField + local pending-aware Button
       → subscribe action → controller → use case → Stripe
```

`SubscribeButtonComponent` and the old standalone client button were removed. No component function crosses the server/client boundary. Static tests inspect the client-owned semantic details directly; browser tests exercise the actual Portal with an async action injected at the client boundary.

The dialog posts the displayed version and trial identity. Both the form action and the exported `use server` billing controller require it; only internal application/helper types permit omission. A direct controller request with no offer identity is rejected before dependency or Checkout execution. The use case compares them with fresh server-derived eligibility and terms before customer/session creation. A mismatch returns to pricing for fresh review. Controller idempotency keys include plan, trial identity, and version; an identical replay reuses its result, while a different offer cannot replay an older offer's Checkout session. Closing unmounts the form, so reopening after a submission produces a fresh UUID.

Valid `?plan=` opens only the corresponding authenticated offer, without submitting. A returning subscriber gets standard terms; subscribed/recovery visitors retain their status cards. Invalid values open nothing. The trial footnote requires both authentication and eligibility inside the dynamic plans branch. The accepted JavaScript requirement is stated in an authenticated noscript explanation with the support address.

## TDD evidence

Registry S-4 and standards were updated first, including scroll containment and initial title focus. The 480-character test failed against the previous trial strings (485/483). The structured-data/version tests then failed in eight assertions. The first UI composition run failed in six expected assertions; the first browser run failed because the dialog did not exist, and the title-focus assertion subsequently failed in four cases before the focus behavior was added. The stale-offer/action/controller tests failed in 13 expected assertions before implementation. GitHub review then identified that the exported controller also needed a required identity: a direct-call regression reproduced the bypass (returned a Checkout URL instead of VALIDATION_ERROR), and now passes after removing the optional controller schema field. Existing controller and integration fixtures carry explicit displayed offers.

The final browser suite covers all four offers, exact rows/sentence, Escape focus return, pending submission, submitted offer/key fields, fresh key after reopening, both query plans, returning eligibility, anonymous signup, invalid/absent selection, and both status-card branches. The two hosted Checkout journeys read the actual displayed rows/sentence before submission, then compare the persisted local `renewal_consent_records` snapshot/version/Terms identity and three-year retention after Stripe success. Stripe's required Terms checkbox remains downstream.

## Validation and visual evidence

The visual pass measured 46 route/state/viewport combinations across 390, 768, 1024, and 1440 px, plus 390×844 and 390×667. Every pass had zero axe violations and no horizontal overflow. The initial title used a native outline; a four-case failing browser assertion preceded replacing it with the registered canonical ring. Final screenshots are recaptured after that correction. No email is sent; all database operations use the per-clone local Docker target and provider operations use the E2E-owned Stripe test customer. Production baseline assets are byte-identical copies from #899.

The first hosted ledger run failed for both journeys because no webhook was being delivered to localhost. This was a harness gap: eager success sync only grants entitlement. The helper now retrieves the real Stripe TEST completion event, verifies the E2E customer owner, and replays it through the signed local HTTP webhook using Stripe’s documented [test signing helper](https://github.com/stripe/stripe-node#testing-webhook-signing). It refuses external app hosts and configured email delivery. Both hosted journeys then passed. Their queued acknowledgments initially contaminated two subsequent integration assertions; the helper now cleans up only the exact E2E Checkout acknowledgment rows after verification, retaining consent evidence. The full gate includes a second integration pass after hosted Checkout to prove isolation. [Ledger evidence](./consent-ledger-after-478.json) records the exact annual standard/monthly trial snapshots and acknowledgment state at verification time, before E2E cleanup; no delivery is claimed.

| Measured surface | Result |
|---|---|
| Plans width at 390 / 768 / 1024 / 1440 | 358 / 720 / 768 / 768 px |
| Trial dialog at 390×900 and 390×844 | 358×690 px, all terms/buttons fit without scrolling |
| Trial dialog at 390×667 | 358×635 px, 688 px scroll content / 633 px client height; footer reachable by scrolling |
| Trial dialog at desktop | 512×510 px |
| Standard dialog at 390 / desktop | 358×541 / 512×405 px |
| Consent sentence | 14 px, rgb(131,131,131) on rgb(18,18,18), 4.9415:1 |
| Anonymous keyboard path | 13 stops, canonical 3 px rings; signup URLs unchanged |
| Eligibility/query states | Both trial and standard plans open correctly; anonymous/subscribed/recovery states open no dialog |

Receipts: [all link/button/layout measurements and axe results](./measurements-after-478.json), [anonymous focus](./anonymous-focus-after-478.json), [dialog focus](./dialog-focus-after-478.json). Full pages, main/dialog crops, short-mobile top/bottom views, and per-focus screenshots are stored beside the before assets. Baseline captures used local development; after captures use the local production build. All use dark Chromium at DPR 1.

Initial quality gate passed: typecheck, lint and test-double fidelity, 4,271 unit tests in 463 files, 411 browser tests in 65 files, 258 local integration tests in 40 files (six provider opt-ins skipped by normal configuration), production build, all 44 required E2E tests, and all four hosted-lane entries (setup, paid annual, no-card trial, cleanup). A second full integration run after the hosted lane also passed 258 tests, verifying delivery-fixture cleanup. The subsequent controller-boundary correction also passed the complete gate before push: typecheck, lint/test-double fidelity, 4,272 unit tests, 411 browser tests, 258 integration tests, production build, 44 required E2E tests, the four hosted-lane entries, and another 258 integration tests after hosted cleanup. It changes no rendered UI; the recorded visual evidence remains applicable.
