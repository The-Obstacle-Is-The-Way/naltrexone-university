# DEBT-471: E2E and CI Fail on Third-Party and Runner Changes Unrelated to the Diff

**Status:** Active
**Priority:** P2
**Date:** 2026-08-20
**Source:** PR #811 — a **documentation-only** PR (1 file, markdown prose) was blocked for hours by two consecutive red CI runs, neither caused by its diff. Confirmed against `dev` at `4e05cca4` and PR #811 head `35dcca24`.

## Description

CI has no insulation between "this change is wrong" and "something outside this repository moved". Two different external systems reddened a markdown-only PR on 2026-08-19, and the signal was indistinguishable from a real regression.

The controlled comparison is unusually clean — same branch, same base, same test file, and the only delta between the two commits is prose:

| Run | Commit | Time | `E2E smoke` |
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
- `getByRole('checkbox', { name: /I agree to .*Terms of Service and Privacy Policy/i })`
- `getByRole('button', { name: 'Subscribe', exact: true })`

The 2026-08-19 failure was `locator.check: Test timeout of 120000ms exceeded` on the `Card` radio — Stripe served the card section already expanded, with no radio to check. The spec reached Stripe successfully every time; only the DOM shape differed.

**The repository already demonstrates the correct pattern.** `tests/e2e/helpers/clerk-auth.ts` authenticates through the official `@clerk/testing/playwright` `clerk.signIn()` API and never scrapes Clerk's DOM. Clerk's hosted UI has changed repeatedly over this period without reddening CI. The Stripe path is the outlier, not the norm.

The spec arrived on `dev` via PR #808 (merged 2026-08-19T04:00Z), so every PR opened after that inherits the exposure.

### F2 — A hung apt consumes the entire job budget

`.github/workflows/ci.yml` runs `pnpm exec playwright install --with-deps` with **no step-level timeout**; the only backstop is the job's `timeout-minutes: 60`. On attempt 2 every Ubuntu index line came back `Ign:` from `azure.archive.ubuntu.com` at 21:12Z and the job sat until it was cancelled at 22:06Z — 54 minutes spent to reach zero tests.

The step already carries a mitigation for this *class* of failure, but it targets the wrong host: it strips `packages.microsoft.com` sources (the comment cites intermittent 403s) while the observed hang was the Ubuntu archive mirror.

### F3 — No Playwright browser cache

There is no `actions/cache` entry and no `PLAYWRIGHT_BROWSERS_PATH` anywhere in the workflow. Every run re-downloads browsers and re-runs `apt-get`, so every run pays full exposure to F2 rather than paying it once.

### F4 — Retries cannot absorb a third-party change

`playwright.config.ts` sets `retries: process.env.CI ? 2 : 1` — three CI attempts. A Stripe DOM change is deterministic within a run, so all three attempts failed identically. Retries mitigate timing jitter; they do nothing for F1.

### F5 — E2E is fully serialized on one shared identity

`fullyParallel: false` and `workers: 1`, because (per the config's own comment) "All authenticated E2E tests share a single test user". E2E alone runs ~10.7 minutes, and cross-test state coupling forces reset helpers (`runE2EUserStateReset`, `prepareE2EUserForPaidCheckout`, `restoreE2EUserAfterPaidCheckout`) around the checkout spec. The single shared user is also the root of the DEBT-466/470 replay-chain saturation family.

### F6 — E2E setup and teardown call the live Stripe API

`tests/e2e/helpers/seed-test-user.ts` and `helpers/paid-checkout.ts` issue real test-mode Stripe calls (`customers.list`, `customers.create`, `customers.retrieve`, `subscriptions.list`, `subscriptions.retrieve`). A Stripe incident, rate limit, or account-state drift reds CI independently of F1.

### F7 — Review churn multiplies exposure

`concurrency` sets `cancel-in-progress: true`, so every push cancels the running job and starts a fresh one. PR #811 consumed **four** full CI runs because each CodeRabbit round produced another commit. Each run is an independent draw against F1, F2, and F6. A documentation PR that had already gone green at 17:26Z was re-rolled three more times and eventually drew red.

### F8 — The HTML reporter blocks local runs after a failure

`reporter: 'html'` is set unconditionally, with no `open` option specified.

Observed on 2026-08-19: a local `pnpm test:e2e` whose tests finished with one retry-recovered flake did not exit. It served the HTML report and printed `Press Ctrl+C to quit`; interrupting produced exit `130`, which read as a failed gate even though the run had passed. Recovering a trustworthy exit code required a second full ~5.8-minute E2E run under `CI=1`.

The precise trigger (Playwright's default `open` behavior for the HTML reporter under a run containing a failed attempt) was not confirmed from the installed package during this filing and should be checked before the fix; the observable symptom above is what this finding rests on.

## Impact

- **Wasted human trust.** A red `test` check on a docs-only PR is indistinguishable from a real regression, so every occurrence costs a full investigation. On 2026-08-19 that investigation ran for hours and reached the wrong first conclusion twice.
- **The 24-hour reruns are not free.** F2 burned 54 minutes of runner time to run zero tests; the full job is ~11 minutes when healthy.
- **Pressure to waive.** The repository's merge rules are strict by design. When red is routinely external, the standing temptation is to merge through red — which is exactly how a genuine regression eventually ships.
- **F1 will recur.** Stripe changes hosted Checkout on their schedule. Nothing in this repository is notified, and no retry count helps.

## Resolution

Ordered by value per unit of risk. F1 and F2 are the two that actually reddened this PR.

1. **F1 — stop asserting on Stripe's hosted DOM.** Options, best first:
   a. Drive the paid path through Stripe's test-mode **API** for provisioning and assert the resulting application state, mirroring how `clerk-auth.ts` treats Clerk. Keep exactly one thin hosted-page smoke if hosted coverage is genuinely wanted, and mark it non-blocking.
   b. If a hosted interaction must stay blocking, replace exact copy and role assumptions with resilient fallbacks (the spec already does this for `cardholderName` and `postalCode` via `isVisible()` guards — extend that shape to the Card radio and the Subscribe button).
2. **F2 — bound the install step.** Add `timeout-minutes` to "Install Playwright browsers" so a dead mirror costs minutes, not the whole job, and extend the existing source-stripping to the Ubuntu archive mirror or set an explicit alternate mirror.
3. **F3 — cache browsers.** Key an `actions/cache` entry on the Playwright version so the common path skips both the download and `apt-get` entirely, which also shrinks F2's window.
4. **F8 — pin the reporter's `open` behavior explicitly.** Confirm the trigger first, then set it rather than relying on a default — e.g. `reporter: [['html', { open: 'never' }], ['list']]` — so a local run's exit code always reflects the tests, not a report server. Verify by reproducing a retry-recovered local run and checking it exits `0` unattended.
5. **F5/F6 — reduce shared-identity coupling.** Per-worker or per-spec test identities would unlock parallelism and dissolve the reset choreography. This is the largest change and overlaps DEBT-466/470; it is listed for direction, not scheduled here.
6. **F7 — batch review rounds.** Prefer collecting review findings into one push rather than one push per finding, and consider whether documentation-only diffs need the full E2E lane at all (a path filter would remove the exposure entirely for prose changes).

**Already mitigated — do not re-file.** The "Enforce E2E skip policy" CI step forbids any `test.skip(...)` in `tests/e2e/*.spec.ts` other than the exact Clerk-credential guard, so the suite cannot silently shrink to green. That control worked throughout this incident.

## Verification

- F1: after the change, `tests/e2e/paid-checkout.spec.ts` contains no assertion on Stripe-owned copy or roles; `grep -nE "getByRole|getByLabel" tests/e2e/paid-checkout.spec.ts` returns only application-owned selectors, and the paid path still proves entitlement through `expectE2EUserHasPaidAnnualSubscription`.
- F2: `grep -n "timeout-minutes" .github/workflows/ci.yml` shows a step-level bound on the Playwright install; a simulated mirror failure ends that step in minutes.
- F3: a second CI run on an unchanged Playwright version reports a cache hit and skips the download.
- F8: a local `pnpm test:e2e` with one retry-recovered flake exits `0` without holding a report server.
- Whole-debt regression check: re-run CI twice on an unchanged documentation commit and require green both times.

## Related

- PRs: [#808](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/808) (introduced `paid-checkout.spec.ts`), [#811](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/811) (the docs-only PR this was observed on)
- CI runs: `32281590063` (green, `7e2b1d00`), `32298458967` (attempt 1 red F1, attempt 2 red F2, attempt 3 green — all `35dcca24`)
- Shared-identity lineage: DEBT-466 and [DEBT-470](./debt-470-checkout-replay-tail-jump.md) — the single E2E user is the common root
- GitHub Actions instability during this window: critical incidents 2026-08-17 and 2026-08-20, major Actions incident 2026-08-18 (<https://www.githubstatus.com>)
