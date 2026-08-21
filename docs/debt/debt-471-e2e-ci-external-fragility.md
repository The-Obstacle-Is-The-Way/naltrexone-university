# DEBT-471: E2E and CI Fail on Third-Party and Runner Changes Unrelated to the Diff

**Status:** Active
**Priority:** P2
**Date:** 2026-08-20
**Source:** PR #811 — a **documentation-only** PR (1 file, markdown prose) was blocked for hours by two consecutive red CI runs, neither caused by its diff. Confirmed against `dev` at `4e05cca4` and PR #811 head `35dcca24`.

**Implementation progress (2026-08-20):** All eight findings now have an implemented or explicit no-action disposition on `feat/debt-471-external-fragility`; this debt remains Active until that branch merges. F1 uses mutually exclusive Playwright projects and adds a required provider-backed annual/trial success-sync contract. F2 has a measured 12-minute step bound plus a simulated-hang-tested Ubuntu archive failover. F3 installs Chromium only. F5 deliberately retains one worker. F6 assigns and bounds every Stripe-networked E2E surface. F7 deliberately defers path filtering. F8 pins `open: 'never'`.

## Description

CI has no insulation between "this change is wrong" and "something outside this repository moved". Two different external systems reddened a markdown-only PR on 2026-08-19, and the signal was indistinguishable from a real regression.

The controlled comparison is unusually clean — same branch, same base, same test file, and the only delta between the two commits is prose:

| Run | Commit | Workflow start | `E2E smoke` |
| --- | --- | --- | --- |
| `32281590063` | `7e2b1d00` | 17:26Z | **success** |
| `32298458967` attempt 1 | `35dcca24` | 20:25Z | **failure** |
| `32298458967` attempt 3 | `35dcca24` | 2026-08-20 16:49Z | **success** |

Attempt 3 passed the *same commit* that attempt 1 failed, with zero code changes. That is the whole thesis of this debt: the suite reports on the state of the outside world, not only on the diff.

### F1 — E2E asserts against Stripe's hosted Checkout DOM (root cause of the red)

`tests/e2e/paid-checkout.spec.ts` drives Stripe's **hosted** Checkout page and asserts on markup, roles, and English copy that Stripe owns and can change without notice:

- `getByRole('radio', { name: 'Card', exact: true })` — then `.check({ force: true })`, whose own comment already concedes "Stripe's accordion cover intentionally intercepts the styled radio's pointer area"
- `getByRole('checkbox', { name: 'Save my information for faster checkout' })`
- `getByLabel(/card number/i)`, `getByLabel(/expiration/i)`, `getByRole('textbox', { name: 'CVC', exact: true })`
- optional `getByLabel(/cardholder name|name on card/i)` and `getByLabel(/zip|postal code/i)` fields
- `getByRole('checkbox', { name: /I agree to .*Terms of Service and Privacy Policy/i })`
- `getByRole('button', { name: 'Subscribe', exact: true })`

The 2026-08-19 failure was `locator.check: Test timeout of 120000ms exceeded` on the `Card` radio. The downloaded attempt-1 Playwright artifact contains three `error-context.md` snapshots—one per attempt—and all three show Stripe's card-number, expiration, and CVC fields already expanded with no radio role present. The spec reached Stripe successfully every time; only the DOM shape differed.

The paid spec is the incident trigger, but it is not the only blocking hosted-DOM seam. `trial-start.spec.ts` calls `completeNoCardTrialCheckout()` in `tests/e2e/helpers/subscription.ts`, which selects Stripe's hosted Terms checkbox by English copy and a hosted button by `/start (free )?trial|subscribe|continue/i`. That path did not fail in this incident, but it has the same unsupported third-party-selector dependency and must be included in an honest F1 resolution.

Stripe's own [automated-testing guidance](https://docs.stripe.com/automated-testing) says that front-end interfaces such as Checkout and the Payment Element have security measures that prevent automated testing, and recommends simulated interface/API outputs for application behavior. `tests/e2e/helpers/clerk-auth.ts` demonstrates the general boundary: it uses the official `@clerk/testing/playwright` `clerk.signIn()` API rather than scraping Clerk's hosted DOM. That is evidence for removing third-party UI from required PR automation, not evidence that Clerk and Stripe expose equivalent test APIs.

**Supported non-UI completion result (definitive P0 answer):** Stripe exposes no public API operation that completes an arbitrary existing Checkout Session; the public [Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions) exposes create/update/retrieve/list/line-items/expire operations, not complete or confirm. [Test Clock operations](https://docs.stripe.com/api/test_clocks) create/retrieve/list/delete/advance clocks; they advance Billing time rather than confirm Checkout. Stripe does, however, support [`stripe trigger checkout.session.completed`](https://docs.stripe.com/cli/trigger), whose documented contract creates the necessary real test-mode API objects and side-effect events. The required lane now pins the official CLI package and uses that supported command to create a genuine completed annual subscription and a genuine completed cardless-trial subscription. It does not call the trigger fixture's private payment-page endpoint directly.

The supported trigger creates its own Session; it cannot advance the exact Session created by our application. `checkout-success-provider.spec.ts` therefore proves two adjacent real-provider contracts for each plan shape: (1) the production use case/gateway creates a real open Session with the configured Price, user/customer ownership, return URLs, Terms requirement, billing-address policy, promotion policy, and trial payment-method policy, and the production success-sync path rejects that open Session without adding entitlement; (2) Stripe's supported trigger creates a separate completed Session and genuine subscription, then the production success-sync code retrieves it, persists it through real Drizzle repositories, and grants the correct entitlement. The annual case proves a paid USD 199 invoice and active annual state; the monthly case proves seven trial days, no default payment method, zero attached cards, trial persistence, and entitlement.

This is also a recurrence, not a first discovery. [DEBT-205](../_archive/debt/debt-205-e2e-selector-drift-from-ui-refactors.md) recorded on 2026-02-10 that Stripe had changed hosted Checkout and permanently broken the old `completeStripeCheckout()` helper; the suite moved ordinary subscription setup to API-based seeding. [DEBT-415](../_archive/debt/debt-415-e2e-suite-flag-on-alignment.md) later added the required hosted no-card trial, and PR #808 deliberately added the paid hosted path to close [DEBT-468](./debt-468-test-estate-coverage-and-fixture-debt.md) Part 1's previously unproved card → Checkout → success-return sync → subscription → entitlement chain. Direct API provisioning is therefore not a drop-in equivalent for either hosted journey: it removes the hosted portion while retaining only application/provider-state contracts. Any F1 fix must explicitly amend current coverage claims and preserve the repository-owned portions as separate contracts.

The spec arrived on `dev` via PR #808 (merged 2026-08-19T04:00Z), so every human same-repository PR opened after that inherits the exposure from the required E2E lane. Dependabot and fork PRs do not receive the credentials and skip that lane.

### F2 — A hung apt consumes the entire job budget

`.github/workflows/ci.yml` runs `pnpm exec playwright install --with-deps` with **no step-level timeout**; the only backstop is the job's `timeout-minutes: 60`. On attempt 2, four Azure Ubuntu suites returned `Ign:` before the fallback `archive.ubuntu.com` mirror began responding, but `apt` remained stuck on Azure package indexes. The install step ran from 21:10:27Z until cancellation at 22:06:32Z (56 minutes 5 seconds), with no output for its final 53 minutes 45 seconds; the 60-minute job ended after running zero browser tests.

The step already carries a separate mitigation for external apt-source failure: it strips `packages.microsoft.com` sources after intermittent 403s. That control does not cover the observed Ubuntu archive-mirror hang.

**Implemented bound and derivation:** eight healthy `Install Playwright browsers` steps were sampled: runs `32421516963` (47s), `32419496984` (41s), `32410385283` (43s), `32408903055` (51s), `32403889323` (45s), `32325240736` (47s), `32281590063` (43s), and `32298458967` attempt 3 (113s). Their median was 46s and maximum 113s. The 12-minute step bound is therefore 6.4× the slowest sampled healthy install and more than 15× the median, not an arbitrary round number. `scripts/ci/install-playwright-chromium.sh` budgets 3 minutes for the first Chromium dependency attempt, 5 minutes for the archive-failover attempt, and 3 minutes for the browser download, with 15-second TERM→KILL grace per phase (11m45s worst case inside the 12-minute workflow bound). A contract test makes the first apt phase hang, observes its termination, verifies only `azure.archive.ubuntu.com` is rewritten to `archive.ubuntu.com` while the Ubuntu source file survives, and then proves the retry and Chromium-only download execute.

### F3 — The install fetches browser families the repository does not run

Both `playwright.config.ts` and `vitest.browser.config.mts` run Chromium only, but the workflow invokes `playwright install --with-deps` without a browser argument. With installed Playwright 1.62.1, `playwright install --dry-run` lists Chrome for Testing, Chrome Headless Shell, Firefox, WebKit, and FFmpeg; the same command with `chromium` lists only the Chromium artifacts and FFmpeg.

There is no `actions/cache` entry or `PLAYWRIGHT_BROWSERS_PATH`, but caching is not the primary correction. Playwright's [CI guidance](https://playwright.dev/docs/ci#caching-browsers) explicitly does **not** recommend caching browser binaries because cache restore time is comparable to download time, and Linux OS dependencies are not cacheable. A browser cache would not skip `apt-get` and would not have prevented F2.

### F4 — Retries cannot absorb a third-party change

`playwright.config.ts` sets `retries: process.env.CI ? 2 : 1` — three CI attempts. A Stripe DOM change is deterministic within a run, so all three attempts failed identically. Retries mitigate timing jitter; they do nothing for F1.

### F5 — One shared identity forces serialization and reset choreography

`fullyParallel: false` and `workers: 1`, because (per the config's own comment) "All authenticated E2E tests share a single test user". Cross-test state coupling forces reset helpers (`runE2EUserStateReset`, `prepareE2EUserForPaidCheckout`, `restoreE2EUserAfterPaidCheckout`) around the checkout spec. The 10.7-minute receipt was the *failed* run with three 120-second Checkout attempts; attempt 3's healthy 40-test E2E step took 3 minutes 54 seconds, so 10.7 minutes is not the healthy serialization cost.

The identity link to DEBT-466/470 is narrower than originally filed. Those replay chains required repeated local runs that retained the same app-user UUID and Checkout tuple, deterministic Stripe keys, and retained Stripe responses. A shared identity is common state, but `workers: 1` did not cause that defect, and per-worker identities alone do not prove safe parallelism across the database, Clerk, and Stripe.

**Deliberate no-action:** `workers: 1` stays. There is no proof that per-worker identity isolation is complete across Postgres rows, Clerk sessions, Stripe customer/owner namespaces, application rate-limit keys, provider rate limits, and failure cleanup. Raising worker count before all six boundaries are isolated would trade visible serialization for cross-test corruption.

### F6 — E2E setup and teardown call Stripe's networked test-mode API

The network dependency is broader than the original two-file census. `credential-health-check.ts`, `seed-test-user.ts`, `subscription.ts`, and `paid-checkout.ts` call Stripe test mode across Accounts, Prices, Customers, PaymentMethods, Subscriptions, Invoices, Invoice Payments, and PaymentIntents. The application under test also creates and retrieves Checkout Sessions. A Stripe incident, test-mode rate limit, or account-state drift can red CI independently of F1. Moving F1 provisioning to Stripe's API would still retain—and can increase—this exposure, so F6 needs its own disposition.

**Disposition:** every direct E2E helper now constructs the shared test-mode Stripe client with a 15-second request timeout and one network retry. The required and scheduled lane assignment, including `stripe-hosted-checkout.ts`, the application's Session list/retrieve/create/expire calls, and the new 30-second CLI trigger subprocess, is recorded in [Testing Infrastructure](../dev/testing-infrastructure.md#stripe-network-ownership-and-failure-bounds). Setup retains Playwright's 30-second outer bound; authenticated/provider specs retain their documented 120-second outer bound. These calls are accepted external dependencies and are never described as hermetic.

### F7 — Every pushed review head reruns the full external lane

PR #811 produced five CI workflow records for five pushed heads (`c1e5088f`, `7e2b1d00`, `012c6b5f`, `80b401ec`, and `35dcca24`); the final workflow was then attempted three times. After the `7e2b1d00` workflow started at 17:26Z and completed green at 17:36Z, three later review heads reran the full lane before the PR merged.

`cancel-in-progress: true` did **not** cause those new runs. A pushed PR head triggers a new workflow regardless; per GitHub's [concurrency contract](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), this setting cancels the superseded in-progress run and therefore limits wasted work. The amplifier is one full external E2E lane per pushed review head, with no docs-only classification—not the cancellation control.

**Evaluated and deferred:** keep `cancel-in-progress: true`, batch verified review findings when practical, and do not path-filter the required workflow in this change. Path-filtered required checks are a known merge-blocking footgun when the named check never starts, while a classification mistake can let code evade the required lane. F1's hosted split and F2/F3's bounded Chromium install remove most of the motivation without weakening check semantics.

### F8 — The HTML reporter blocks a locally passing flaky run

`reporter: 'html'` is set unconditionally, with no `open` option specified.

Observed on 2026-08-19: a local `pnpm test:e2e` whose tests finished with one retry-recovered flake did not exit. It served the HTML report and printed `Press Ctrl+C to quit`; interrupting produced exit `130`, which read as a failed gate even though the run had passed. Recovering a trustworthy exit code required a second full ~5.8-minute E2E run under `CI=1`.

The trigger is now confirmed from installed Playwright 1.62.1. The HTML reporter resolves an omitted `open` option to `on-failure`; its report builder marks the report not OK when `unexpected + flaky > 0`, even though the test runner returns success for a retry-recovered flaky test unless `failOnFlakyTests` is enabled. In a local TTY where Playwright does not identify the caller as a supported coding agent, reporter shutdown therefore starts the report server and waits forever. `CI=1` bypasses that interactive shutdown path. The observed exit `130` came from interrupting the server, not from the tests.

## Impact

- **Wasted human trust.** A red `test` check on a docs-only PR is indistinguishable from a real regression, so every occurrence costs a full investigation. On 2026-08-19 that investigation ran for hours and reached the wrong first conclusion twice.
- **Reruns are not free.** F2 left the installer running for 56 minutes 5 seconds and ran zero browser tests; the full job is ~11 minutes when healthy.
- **Pressure to waive.** The repository's merge rules are strict by design. When red is routinely external, the standing temptation is to merge through red — which is exactly how a genuine regression eventually ships.
- **F1 can recur.** Stripe changes hosted Checkout on its schedule. Nothing in this repository controls that DOM, and no retry count absorbs a deterministic selector mismatch.

## Resolution

Ordered by value per unit of risk. F1 and F2 are the two that actually reddened this PR.

1. **F1 — remove hosted Checkout DOM automation from required PR CI.** Stripe documents that Checkout prevents automated testing, and DEBT-205 already proved this failure mode. Replace both monolithic hosted journeys with layered evidence:
   a. keep blocking repository-owned contracts for both pricing CTAs, paid-annual and no-card-trial Checkout Session creation/redirect, success-return synchronization, subscription persistence, cardless-trial state, and entitlement;
   b. keep a genuine Stripe test-mode subscription/webhook contract on an explicitly chosen external-provider cadence; Stripe's [Billing testing guidance](https://docs.stripe.com/billing/testing) says actual test subscriptions are the most reliable webhook test;
   c. if either full hosted journey remains valuable, run thin paid and/or no-card-trial smokes on a scheduled/manual, explicitly non-required lane and treat them as observational provider compatibility—not merge gates.
   Reconcile DEBT-468 Part 1, `docs/dev/testing-infrastructure.md`, and `docs/qa/qa-002-billing-entitlement.md` in the same implementation PR so none continues claiming a blocking hosted causal-chain proof. Add a supersession note to archived DEBT-415 if its current-coverage wording would otherwise mislead. Direct API provisioning may cover application state but must not be described as equivalent hosted Checkout coverage. Resilient label fallbacks are acceptable only as short-lived containment while the hosted smokes move; they do not resolve the third-party-DOM dependency.
2. **F2 — bound and harden OS dependency installation.** Add a step-local `timeout-minutes` to "Install Playwright browsers" so a dead mirror costs minutes, not the whole job. Use a bounded retry/failover to a responsive Ubuntu archive or a Playwright image with dependencies already installed; do not simply delete every Ubuntu archive source. Test the exact step block, because the job's existing 60-minute timeout is not a step bound.
3. **F3 — install only the browser actually used.** Prove both Vitest Browser and E2E on `playwright install --with-deps chromium` (and evaluate `--only-shell` for the headless CI configuration). Do not add a browser cache by default against Playwright's guidance. If measurements justify one anyway, cache browser binaries only and continue installing OS dependencies under F2's bound.
4. **F8 — pin the reporter's `open` behavior explicitly.** Set `open: 'never'` rather than relying on `on-failure`—for example, `reporter: [['html', { open: 'never' }], ['list']]`—so a retry-recovered local run exits with the test runner's status. Pin this in a config contract and reproduce one flaky-then-passing test in a TTY with exit `0`.
5. **F6 — give networked provider checks an independent policy.** Decide which genuine Stripe checks remain required on every PR versus scheduled/manual, bound each network phase, and preserve test-mode/idempotent cleanup. F1's API option does not resolve F6. Record any accepted external dependency explicitly rather than calling the lane hermetic.
6. **F5 — isolate identities before evaluating parallelism.** Per-spec or per-worker identities can remove shared mutable state, but parallel workers require separate proof for database, Clerk, Stripe ownership, rate limits, and cleanup. Keep `workers: 1` until that proof exists; Playwright itself recommends one CI worker for stability.
7. **F7 — reduce pushed-head churn without weakening cancellation.** Batch verified review findings when practical and keep `cancel-in-progress: true`. Evaluate a docs-only workflow path that still runs the repository's documentation/static checks while omitting credentialed external E2E; path classification and required-check behavior need their own contract so code-bearing changes cannot evade the full lane.

**Already mitigated — do not re-file.** The "Enforce E2E skip policy" CI step forbids any `test.skip(...)` in `tests/e2e/*.spec.ts` other than the exact Clerk-credential guard, so the suite cannot silently shrink to green. That control worked throughout this incident.

## Verification

- F1: required PR E2E performs no selector-based action or assertion against Stripe-owned DOM after navigation to a Stripe-owned origin. The Stripe-owned selectors are source-allowlisted only in hosted compatibility files. `expectE2EUserHasPaidAnnualSubscription` and `expectE2EUserHasTrialWithoutPaymentMethod` explicitly left the blocking lane and now execute only from `stripe-hosted-paid-checkout.spec.ts` and `stripe-hosted-trial-start.spec.ts`. Required `checkout-success-provider.spec.ts` replaces their application-owned outcome claims with real-provider annual and cardless-trial contracts, including open-Session rejection, but it does not claim the exact application-created Session was completed. The named coverage and testing docs record that delta and the hosted coupling's daily regression window, which extends past one day when a scheduled run is delayed or fails.
- F2: an extracted check of the "Install Playwright browsers" step—not a file-wide grep—finds its own `timeout-minutes`. A simulated hung installer is terminated within that bound, and the alternate dependency path is exercised.
- F3: `playwright install --dry-run` for the chosen CI command lists only the Chromium artifacts required by both browser lanes. OS dependency installation remains explicit and passes under F2's bound; no verification claims that a browser cache skips `apt-get`.
- F6: every networked Stripe call exercised by E2E—including helper calls and the application's Checkout Session creation and retrieval—is assigned to a documented required or scheduled lane with a bounded failure contract; no test-mode API call is misreported as hermetic.
- F5: `workers: 1` remains pinned and the missing multi-boundary isolation proof is recorded as the reason, not an unexamined default.
- F7: path filters are explicitly deferred, `cancel-in-progress: true` remains, and the required-check/misclassification risks are recorded.
- F8: a config contract pins `open: 'never'`, and a local TTY run with one retry-recovered flaky test exits `0` without holding a report server.
- Whole-debt regression check: contract tests enforce hosted-selector ownership, simulate a hung dependency installer, and pin the non-opening reporter configuration. Repeated unchanged-head greens are incident receipts, not proof that external dependencies are insulated.

## Related

- PRs: [#808](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/808) (introduced `paid-checkout.spec.ts`), [#811](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/811) (the docs-only PR this was observed on)
- CI runs: `32281590063` (green, `7e2b1d00`), `32298458967` (attempt 1 red F1, attempt 2 red F2, attempt 3 green — all `35dcca24`)
- Prior hosted-DOM failure: [DEBT-205](../_archive/debt/debt-205-e2e-selector-drift-from-ui-refactors.md); deliberate no-card-trial hosted coverage: [DEBT-415](../_archive/debt/debt-415-e2e-suite-flag-on-alignment.md); deliberate paid hosted-chain restoration: [DEBT-468](./debt-468-test-estate-coverage-and-fixture-debt.md) Part 1
- Shared-identity lineage: [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) and [DEBT-470](./debt-470-checkout-replay-tail-jump.md) — the stable local app-user UUID and Checkout tuple, deterministic keys, and retained provider responses produced those replay chains; serialization did not cause them
- Status-page correction: GitHub's 2026-08-17 incident genuinely affected Actions, but the 2026-08-18 Actions incident was explicitly posted in error and the 2026-08-20 critical incident affected Copilot Cloud Agent task visibility, not Actions. None explains the 2026-08-19 Ubuntu mirror hang. ([GitHub Status API](https://www.githubstatus.com/api/v2/incidents.json))
