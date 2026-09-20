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
attempts still fails. A failed product Playwright attempt now fails its run, so no
global `failOnFlakyTests` setting is added. **2026-09-20 qualification:** session
and bookmark helpers can still recover visible product errors within that one
attempt; [the independent review](../adversarial-2026-09-20/review.md#pr-932) records
this existing DEBT-475 follow-through. Native Playwright project inheritance
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

## Independent closeout readback — 2026-09-20

The [adversarial review](../adversarial-2026-09-20/review.md#promotion-evidence) read the actual final local gate and hosted CI logs, then observed exact-head approval and merge of #932 as `b58949e8`. Main CI/production alias verification was still pending at that readback. The earlier “gate must restart” instruction above is historical and was satisfied by the inspected source-change gate; it is not a claim that this docs-only review ran the full gate. The same review narrows the first-attempt guarantee because helpers can recover product errors inside one attempt.

## Production closeout — 2026-09-20 14:53Z

**CONFIRMED:** the earlier pending-production observation is now closed. `gh run view 35515003421 --json status,conclusion,headSha` returned `completed`, `success`, and `b58949e8870415d95a8c17df65cf569902a9e345`. Authenticated Vercel `GET /v4/aliases/addictionboards.com` named `dpl_Fg7R2mumKfTQsghmfEy5TgNSQVfZ`; `GET /v13/deployments/dpl_Fg7R2mumKfTQsghmfEy5TgNSQVfZ` returned `readyState: READY`, `target: production`, and that same Git SHA. GET probes to `/` and `/api/health` both returned 200. This checks the actual public alias, not only the incoming production target.

**CONFIRMED:** #934 subsequently landed on dev as `76c930b4` with local `retain-on-failure` tracing, CI tracing disabled, and product retries still zero. `playwright.config.ts:23` and `tests/playwright-lane-policy.test.ts` own that trace policy. It preserves diagnostics when an attempt fails; it does not expose a product error that a helper recovered inside a successful attempt. At `fc0049f7`, the session/bookmark loops and the error-then-success bookmark unit witness remain unchanged. This is a dev-source receipt for #934, not a claim that #934 was included in the earlier #932 production deployment.

## Subsequent branch/register conflict — 2026-09-20

**CONFIRMED:** the next dev/main synchronization has a debt-ID collision. A fresh `git fetch origin` after [PR #937](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/937) merged returned main `92f70c71` while dev remained `327f95ef`. `git show <sha>:docs/debt/index.md` and the linked record titles give these distinct assignments:

| ID | Dev `327f95ef` (PR A #933) | Main `92f70c71` (PR #937) |
| --- | --- | --- |
| DEBT-479 | Public-surface discoverability and field performance | Import Output Path Traversal |
| DEBT-480 | Canonical security.txt anonymously unreachable | Import/Seed Validation Disagreement |
| DEBT-481 | Master-spec implementation drift | Draft Splitter Silent Omission |

Main also assigns DEBT-482/483/484 to duplicate-QID output collision, content withdrawal/release rollback, and question rewrite/history identity, with `Next Debt ID: DEBT-485`; dev still says `DEBT-482`. Thus neither an automatic index conflict resolution nor allocating dev's next ID is safe. Preserve both sets of findings, honor the owner's reserved public-surface IDs, assign unused IDs to the conflicting importer records, and update their filenames, references, and the combined next-ID pointer in a dedicated docs reconciliation before the next branch synchronization. Recheck both branch heads before choosing those IDs. This note does not rename, delete, close, or duplicate either set of records and does not adjudicate the importer runtime fix. PR C remains the five requested register/runbook files on dev; main's unrelated runtime changes are not part of its validation.
