# Playwright retry boundary — 2026-09-20

Owner ruling: accept promotion #930's inspected bootstrap recovery; eliminate
automatic retries from product and cleanup projects in a separate small PR.
This is a test-execution policy, not a new numeric quality metric gate.

## Incident adjudication

[CI 35505691274](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35505691274)
on `32bcdd937c561f072017aad6325fc870108303ef` reported 43 passed / 1 flaky:
42 product cases and cleanup passed without retries. Global setup failed in
856 ms, then passed on retry #1 in 5.4 seconds. The failure was in credential
preflight, before subscription seeding, state reset, or product tests.

The generic `CLERK_API_UNAVAILABLE` message came from a fetch exception; it does
not prove HTTP 5xx, timeout, or a Clerk-wide outage. DEBT-471 retains required
networked provider contracts; its hosted-DOM quarantine is not a general
provider-availability exemption. The owner accepted this specific recovery
after inspection. No CI rerun, credential change, or waived review was used.
Source PR #929's CI 35504721507 separately passed all 44 cases cleanly.

## Red before green

Five added cases in `tests/playwright-lane-policy.test.ts` failed against the
old config: global default, required product, hosted product, cleanup, and
explicit setup-only allowance. Result: **5 failed / 23 passed**. These were
configuration failures, not failures induced in the live provider accounts.

Moving the existing two-CI/one-local retry allowance into `setup` and setting
the global default to zero made **28/28 pass locally and 28/28 with `CI=1`**.
No product/cleanup override exists in the current specs or invocation wrappers.
No skip, assertion, test-double floor, timeout, or provider request changed.

The bounded exception retries the entire bootstrap (preflight, subscription
seed, database reset, Clerk setup, authentication). It does not classify causes.
Recovered setup failures remain visible and require inspection; deterministic
seed/reset/application defects are not automatically excused. Exhausting setup
attempts still fails. A product first-attempt failure now fails its run, so no
global `failOnFlakyTests` setting is added. Native Playwright project inheritance
implements the policy; no scanner or custom retry framework is introduced.

Local red receipt: `/private/tmp/e2e-retry-policy-red.log`.
Green receipts: `/private/tmp/codex-e2e-retry-policy.2MTOW4/green-local.log` and
`green-ci.log`.

The first full gate stopped in unit tests: the older `playwright.config.test.ts`
still required a global local retry. E2E did not start and nothing was pushed.
Its assertion was changed to require the same local allowance on setup only.
Restoring the old retry configuration made the combined suites fail **6/32**;
the new configuration passed **32/32 locally and with `CI=1`**. No test was
deleted. Receipts: `all-policy-red.log`, `all-policy-green.log` in the same
directory. The complete gate must restart before the first push; final gate,
review, and promotion receipts belong to the PR's verification record.
