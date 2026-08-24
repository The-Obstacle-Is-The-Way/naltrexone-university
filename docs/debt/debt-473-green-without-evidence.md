# DEBT-473: Test Lanes and CI Report Green Without the Requested Evidence

**Status:** Open
**Priority:** P1
**Date:** 2026-08-24
**Source:** Owner question after the DEBT-472 dependency bundle (#829/#830): running a Stripe provider suite with its opt-in flag set returned a green skip instead of a failure. Filed from a fifteen-surface read-only census at `dev` `5a095f12` (identical tree to `main` `33cf36a4`), then an independent adversarial excavation of the same tree that was asked to refute the census's four hypotheses. Every claim below was re-executed or re-read at `5a095f12` before filing; the corrections the two passes made to each other are recorded under *Provenance*.

**Provenance.** The census counted 44 database-backed integration files; the excavation counted 42 files (40 database-backed plus the two Stripe provider suites), and 42 is correct. The excavation cited `tests/integration/setup.ts:11` and `stripe-trial-clock-smoke.yml:41`; the load is at `setup.ts:12` and the wrapper invocation is at `stripe-trial-clock-smoke.yml:46`. The excavation described DEBT-472 as cataloguing "a checker satisfiable without the property holding"; that phrase is this campaign's working name for the defect class, not text in DEBT-472, so F9 below lists the prior instances by commit rather than by citation. Both passes independently reached the same four verdicts (F1, F2, F3, F5), and the excavation added F6 and the breadth of F5.

## Description

A green test signal in this repository currently means one of four different things, and nothing distinguishes them:

1. The behavior executed and passed.
2. The behavior was intentionally out of scope for this run.
3. The behavior was **requested and could not run**.
4. The mechanism that was supposed to detect an omission did not detect it.

States 1 and 2 are legitimate. States 3 and 4 are defects, and the tree contains reachable instances of both. Jim Shore's definition is the standard this debt is measured against: "Some people recommend making your software robust by working around problems automatically. This results in the software 'failing slowly.' The program continues working right after an error but fails in strange ways later on. A system that fails fast does exactly the opposite: when a problem occurs, it fails immediately and visibly." ([Shore, *Fail Fast*, IEEE Software, 2004](https://www.martinfowler.com/ieeeSoftware/failFast.pdf)). His worked example is a configuration property that is missing and silently defaulted; `process.env.STRIPE_SECRET_KEY ?? ''` followed by `describe.skip` is that example verbatim.

The repository already contains two correct implementations of the standard, which is why this is filed as inconsistency rather than as a new design:

- Every one of the 40 database-backed integration files throws at import when `DATABASE_URL` is absent: 35 through `tests/integration/helpers.ts:7-11` (32 directly, three via `tests/integration/bug-regression-test-helpers.ts:9`), one through `tests/shared/resolve-integration-database-url.ts:20-22`, and four through local module guards (`actions.stripe`, `controllers`, `db`, `tag-taxonomy-census`). Representative executions exit 1.
- Every Playwright project depends on the `setup` project (`playwright.config.ts:34,41`), whose single test calls `runE2ECredentialHealthCheck()` (`tests/e2e/global.setup.ts:7-12`) and throws on a missing or dummy credential before any spec's per-file `test.skip` can be evaluated.

The Stripe provider suites, the CI skip-policy step, and the required-check shape do not follow that standard. The findings below give the receipts.

### F1 — Both Stripe provider suites report green when the operator asked them to run and they could not

`tests/integration/stripe-checkout-client-contract.integration.test.ts:11-35` and `tests/integration/stripe-trial-clock-smoke.integration.test.ts:8-32` compute a `skipReason` from three inputs — the opt-in flag, `STRIPE_SECRET_KEY`, and a price ID — and then select `describe.skip` whenever any reason exists:

```ts
const skipReason = !RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT
  ? 'set RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT=true to run the external Stripe contract'
  : !isUsableStripeTestKey(stripeSecretKey)
    ? 'provide a real Stripe test secret key'
    : /* price check */ ;
const describeStripeContract = skipReason ? describe.skip : describe;
```

The first branch is correct: the flag is off, the hermetic lane must not touch Stripe, and skipping is the honest result. The second and third branches are not: the operator has stated intent (`RUN_…=true`) and the suite cannot honor it, which is a configuration error, not an absence of scope. Reproduced at `5a095f12` through the canonical entry point:

| Command | Result |
| --- | --- |
| `env -u STRIPE_SECRET_KEY RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT=true pnpm test:integration tests/integration/stripe-checkout-client-contract.integration.test.ts` | exit 0, `Test Files 1 skipped`, `Tests 4 skipped` |
| `env -u STRIPE_SECRET_KEY RUN_STRIPE_TRIAL_CLOCK_SMOKE=true pnpm test:integration tests/integration/stripe-trial-clock-smoke.integration.test.ts` | exit 0, `Test Files 1 skipped`, `Tests 2 skipped` |

Vitest offers no fail-on-skip switch (`vitest run --help` lists only `--hideSkippedTests`, `--passWithNoTests`, and `--allowOnly`), so the only place this can be made correct is the suite's own module scope. The trial-clock file already contains the right shape one function later — `getStripe()` at `:36-39` throws `Stripe trial clock smoke skipped: …` — but it is unreachable because `describe.skip` never invokes it.

### F2 — The only fail-closed guard is a wrapper around one invocation, and the safe path is the hard one

`scripts/run-trial-clock-smoke.ts` is correct and thorough: `assertPreflight` (`:71-90`) rejects a non-`true` flag, a non-`sk_test_`/`dummy` key, and a non-`price_`/`dummy` price; `createTrialClockSmokeInvocation` (`:93-122`) runs exactly the two provider files with both flags injected; `readReporterAssertions` (`:124` onward) rejects a report that is not `success: true`, and `:184-191` rejects any `skipped`/`pending`/`todo`/`disabled` case as `PROOF_SKIPPED`. Verified: `env -u STRIPE_SECRET_KEY RUN_STRIPE_TRIAL_CLOCK_SMOKE=true pnpm exec tsx scripts/run-trial-clock-smoke.ts` exits 1 with `PREFLIGHT_KEY_INVALID`.

But correctness depends on which entry point an operator picks, and the unsafe one is the default:

- `package.json` exposes eight `test*` scripts (`test`, `test:browser`, `test:browser:coverage`, `test:coverage`, `test:integration`, `test:integration:coverage`, `test:e2e`, `test:e2e:stripe-hosted`); none invokes the wrapper. Its only production caller is `.github/workflows/stripe-trial-clock-smoke.yml:46`.
- The wrapper does not load `.env.local`, the documented home of local secrets; the dotenv loaders in the tree are `playwright.config.ts:6`, `drizzle.config.ts:6`, `tests/integration/setup.ts:12`, and `scripts/export-question-feedback.ts:8`. A developer must export the key by hand before the safe path works.
- No document in `docs/`, `AGENTS.md`, `CLAUDE.md`, or `.claude/` contains a runnable `RUN_STRIPE_TRIAL_CLOCK_SMOKE=true …` or `RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT=true …` command. `docs/dev/testing-infrastructure.md:212-216` describes the runner's six-case contract accurately but names no command; `docs/dev/integration-tests.md` does not mention either provider suite.
- The file is still named for the two-case trial-clock smoke it started as; since `8e42c324` it also owns the four `FakeStripeCheckoutClient` contract cases.
- The three preflight predicates (`isUsableStripeTestKey`, `isUsableStripePriceId`, and the flag check) are written three times — once in each suite and once in the wrapper — with no shared seam, so the suites and the wrapper can drift apart silently.

DEBT-468 item 1 records how this shape arose: the fail-open suite was observed ("Executing the file through `vitest.integration.config.mts` without the flag returns success with both cases skipped"), and the resolution built a fail-closed wrapper *around* it rather than fixing the suite. The wrapper should stay as the aggregate proof (exact files, exact six case titles, reporter validation, process-tree bound); it should not be the only place the property holds.

### F3 — The committed `.env.test` dummy key defeats real credentials in the integration lane

`tests/integration/setup.ts:12` calls `loadDotenvFileOrThrow(resolve(__dirname, '../../.env.test'))` before any suite module evaluates. `.env.test` is committed and its line 23 sets `STRIPE_SECRET_KEY` to an `sk_test_dummy…` placeholder (14 keys total: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SKIP_CLERK`, Clerk, Stripe, Sentry, and `CRON_SECRET` placeholders). `tests/shared/load-dotenv-file.ts:7-11` passes `override` only when explicitly requested, so dotenv's documented default applies: an already-exported variable wins, and an unexported one takes the file's value ([dotenv README, "override"](https://github.com/motdotla/dotenv/blob/master/README.md)).

The consequence is the F1 reproduction. `.env.local` holds a real `sk_test_` key (presence verified; value never printed), but the integration lane never reads `.env.local` — only Playwright and drizzle-kit do — so the suites see the dummy, `isUsableStripeTestKey` rejects it, and the flag-on run skips green. This is the corrected root cause; the first diagnosis in this campaign ("no Vitest config loads dotenv") was wrong, and a config that loads a committed dummy is worse than one that loads nothing.

In CI the same mechanism is masked rather than fixed: `.github/workflows/ci.yml:53` exports `STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY || 'sk_test_dummy' }}` at job scope, which wins over `.env.test` by the same no-override rule.

### F4 — The E2E skip-policy check is satisfiable without the policy holding

`.github/workflows/ci.yml:91-103` is the only executable skip policy in the repository:

```sh
violations="$(grep -nH "test\.skip(" tests/e2e/*.spec.ts \
  | grep -v "test\.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');" \
  || true)"
```

It misses `describe.skip`, `test.skipIf`, `test.fixme`, `it.skip`, the `cond ? describe.skip : describe` ternary that both Stripe suites use, any spec below `tests/e2e/` in a subdirectory, and any lane other than E2E; a reformatted allowlisted line (different quote style, a line break) becomes a false violation, and a grep that cannot read its inputs becomes zero violations through `|| true`. `tests/ci-workflow.test.ts` pins the Dependabot conditions (`:47-56`), the annual-price validation (`:58`), and the Chromium installer bound (`:72`), but nothing pins the skip-policy step, so deleting it would not fail a test. There is no equivalent budget for the integration or unit lanes, which is why the two `describe.skip` ternaries in F1 were never a policy question.

### F5 — Required CI reports one undifferentiated `test` green for three different evidence sets

`ci.yml` has one job, `test`, and it is the only required status check (F6). What that job actually executes depends on who opened the PR:

| Trigger | Typecheck / lint / unit / integration / build | Browser lane (`:119-126`) | E2E lane (`:143-201`) |
| --- | --- | --- | --- |
| Push to `main`; human same-repo PR | runs | runs | runs, fail-closed via `Validate E2E credential inputs` |
| Dependabot PR (`github.actor == 'dependabot[bot]'`) | runs | runs | **skipped** (`:146`, `:200`) |
| Fork PR | runs, with `NEXT_PUBLIC_SKIP_CLERK=true` and dummy keys (`:44-57`) | **skipped** (`:120`, `:125`) | **skipped** |

All three rows produce the same green `test` check. GitHub's documented semantics make this a merge-bar fact, not a display quirk: "A job that is skipped will report its status as 'Success'. It will not prevent a pull request from merging, even if it is a required check." ([GitHub Docs, *Control jobs with conditions*](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)). Steps are skipped rather than jobs here, which is strictly worse for visibility: the job stays green with no skipped marker at all.

Four written claims about this table are false or fail-open, and one test pins the false premise:

- `docs/dev/testing-infrastructure.md:393` says CI runs the browser and E2E layers only on pushes and same-repo PRs "because those jobs require secrets and Playwright browser installation." The browser lane does not require secrets. Measured at `5a095f12` with `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, both price IDs, `DATABASE_URL`, and both E2E Clerk credentials unset: `pnpm test:browser` → `Test Files 64 passed (64)`, `Tests 398 passed (398)`, exit 0. The only real cost is the Chromium install, which `scripts/ci/install-playwright-chromium.sh` already bounds at 12 minutes (`:121`).
- `docs/dev/dependency-update-protocol.md:100` says the Dependabot path "is not a weaker merge bar. It is an honest one." It is a weaker bar: the E2E lane — checkout redirects, entitlement loss, subscription and practice journeys, session continuation — does not run, and the aggregate check does not say so. The same document's `:97-98` cite `ci.yml:137-140` and `:189-193`; the steps are at `:143-146` and `:197-201`.
- `docs/dev/dependency-update-protocol.md:17` makes the human compensating control conditional on the same missing precondition: "If the authenticated E2E environment is present in `.env.local`, also run `pnpm test:e2e`." A protocol that says "if you can" is fail-open at the process layer for the same reason the suites are at the code layer.
- `tests/ci-workflow.test.ts:47-56` asserts that the two E2E steps carry the Dependabot guard "because secrets are unavailable." That premise is incomplete. GitHub documents the mechanism for exactly this case: "When a Dependabot event triggers a workflow, the only secrets available to the workflow are Dependabot secrets. GitHub Actions secrets are not available. You must therefore store any secrets that are used by a workflow triggered by Dependabot events as Dependabot secrets." ([GitHub Docs, *Troubleshooting Dependabot on GitHub Actions*](https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions)). Dependabot secrets are referenced through the same `secrets` context, so the workflow would not change. Whether to mirror the E2E test-mode credentials into that store is an owner decision with a real tradeoff (those secrets become available to workflow runs on Dependabot branches; pnpm 11 blocks dependency lifecycle scripts by default and no `onlyBuiltDependencies` allowlist is configured, which limits the postinstall exfiltration vector, but that should be verified rather than assumed). The decision has never been surfaced because the documentation presents the gap as unavoidable.

The Dependabot row matters more than the fork row for this repository: `.github/dependabot.yml` opens weekly version PRs against `dev`, and `docs/dev/dependency-update-protocol.md:110` records that the security-update entries deliberately omit `target-branch`, so security PRs open directly against `main`. A security PR therefore reaches the only protected branch with a required check that never exercised the E2E lane and never said so.

### F6 — The written merge bar is stronger than the enforced one

Read from the GitHub API at filing (`gh api repos/…/rulesets`, `…/rulesets/17666822`; both classic branch-protection endpoints return 404):

- One active ruleset, `main-protection`, targeting `~DEFAULT_BRANCH` only. `dev` — the integration branch every implementation PR merges into — has no ruleset and no classic protection.
- Rules: `deletion`, `non_fast_forward`, `pull_request` with `required_approving_review_count: 0`, `required_review_thread_resolution: false`, `dismiss_stale_reviews_on_push: false`, and `required_status_checks` listing exactly one context, `test`, with `strict_required_status_checks_policy: false`.
- CodeRabbit review, Codecov, thread resolution, and the local full gate — all mandatory in `AGENTS.md`, `CLAUDE.md`, and `.claude/rules/git-workflow.md` — are process controls with no technical enforcement. CodeRabbit's `pass` context is reported but not required.

This is not evidence that the process is bypassed; every promotion in the DEBT-465 through DEBT-472 arc carries a CodeRabbit approval on its exact head. It is evidence that the process is the *only* control, and that a document claiming "CodeRabbit review required before every merge" is describing a discipline, not a gate. Whether to convert any of it into a required check is an owner decision with its own hazards (`docs/dev/testing-infrastructure.md:393` already records why required-check naming was deferred); the decision needs to be recorded either way.

### F7 — The six-case scheduled runner has never executed on GitHub

`docs/dev/testing-infrastructure.md:216` and the DEBT-472 Part B register entry state that the scheduled runner requires six named cases. That is true of the code and false of the evidence:

- `8e42c324` (2026-08-23 22:53 -04:00) added the four checkout-contract cases to the wrapper; it reached `main` in `bda15c81` at 2026-08-24 02:09Z.
- The most recent scheduled run, `32626471929` (2026-08-23 07:46Z), executed at `8bdf0f78` — before the change — and its log reads `[trial-clock-smoke] PASS executed=2 passed=2 skipped=0`. No `workflow_dispatch` has run since (`gh run list --workflow=stripe-trial-clock-smoke.yml`).
- The next scheduled execution is Sunday 2026-08-30 07:17Z. Until then the only six-case receipts are local (4/4 in 11.38 s and 2/2 in 18.47 s against stripe 22.5.0 during #829).

The gap is a convention defect, not a code defect: new scheduled-only cases should earn a dispatch receipt when they land, not wait up to a full schedule interval with documentation already claiming them.

### F8 — The fourteen per-spec E2E credential skips are fail-closed only by project dependency

`tests/e2e/{bookmarks:13, checkout-redirect:17, core-app-pages:20, cross-page-navigation:20, entitlement-loss:35, history:19, practice:105, review-mode-audit:61, session-continuation:13, session-review-navigation:31, subscribe:10, subscribe-and-practice:17, stripe-hosted-paid-checkout:20, stripe-hosted-trial-start:20}.spec.ts` each carry `test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials')`, with `hasClerkCredentials` computed at `tests/e2e/helpers/clerk-auth.ts:6`. On every supported entry point (`pnpm test:e2e`, both CI workflows) the `setup` dependency runs first and throws, so these lines are unreachable defense in depth. They become live skip-green branches only under `playwright test --no-deps`, which the repository never invokes. This is recorded as accepted, with two conditions: the skip-policy scan in step 2 pins the count at exactly fourteen and the form at exactly this expression, and no new entry point may bypass `setup`.

### F9 — Process finding: this is the sixth guard in eleven days that a wrong state could satisfy

Each of the following shipped a check that accepted its input without the property holding, and each was found by an adversarial pass after the fact rather than by a red test before it:

| Date | Commit | Guard | What satisfied it |
| --- | --- | --- | --- |
| 2026-08-22 | DEBT-472 F7 (DEBT-368 history) | line-oriented grep for `vi.mock` without `{ spy: true }` | any reformatted line |
| 2026-08-23 | `874406a9` | DEBT-472 Part A source scan | `as unknown as never` (unscoped literal-cast exemption) and `export *` from the fake barrel (silently skipped) |
| 2026-08-23 | `6a2acec9`, `77b96b0a`, `8e6f8773` | same scan | referenced module factories and enclosing-scope factory assignment |
| 2026-08-24 | `f6933cd7` | DEBT-472 Part B register test | a waiver with no date |
| 2026-08-24 | `390dcce6` | same test | `2026-99-99` and `2026-02-31` |
| filing | this debt | Stripe provider suites; E2E skip-policy step | flag on with a dummy key; any skip form other than `test.skip(` |

The common cause is that each guard was written to recognize the *expected* input rather than to reject every *other* input, and none had a red test for the state it was supposed to forbid. DEBT-472 step 6 already proposes a convention that a deleting resolution must land with the scan that keeps it deleted; this finding extends it: **a guard must land with a red test for the forbidden state, not only a green test for the allowed one.**

### What the census did not find

- `process.env.X ?? ''` and similar empty defaults outside the two Stripe suites all feed fail-closed consumers or non-test code.
- 32 early `return`s in test code are asserted type narrowing, successful polling exits with a final throw, validated already-achieved states, test-double behavior, or AST pruning. None converts a missing precondition into a pass.
- No `continue-on-error` anywhere in `.github/workflows/`. `ci.yml:133` `fail_ci_if_error: false` on the Codecov upload is a deliberate observability tradeoff (Codecov is not a required check), and `:212` `if-no-files-found: ignore` on the Playwright artifact upload is correct diagnostic behavior. Both stay.
- `scripts/run-trial-clock-smoke-process.test.ts:219` and `scripts/run-trial-clock-smoke.test.ts:543` use `it.skipIf(process.platform === 'win32')`; the Ubuntu CI runner executes them. Defensible; pinned by the step-2 scan.
- `.github/workflows/stripe-hosted-checkout-smoke.yml` references its secrets without dummy fallbacks (`:43-51`) and relies on `global.setup.ts`; a missing secret fails the run. Fail-closed.

## Impact

Ranked by consequence, not by count:

1. **Merge evidence is not what the green says it is (F5, F6).** A Dependabot security PR can reach `main` with the only required check green and the E2E lane absent, under a ruleset requiring zero approvals and no thread resolution, with two documents stating the bar is not weaker. Fork PRs additionally lose 398 browser tests that need no secret.
2. **Six live Stripe contract cases can be falsely reported green at every entry point except one (F1, F2, F3).** Those cases are the only executed proof of cardless-trial cancellation and card-present activation at trial end, frozen Checkout replay versus live retrieval, `starting_after` pagination with `has_more`, terminal-Session visibility, and same-key/different-parameter `idempotency_error` — the semantics DEBT-466/467/470 rely on for subscription access and the Checkout recovery chain. The scheduled wrapper protects production cadence; nothing protects a developer who ran the obvious command and believed the result.
3. **The skip policy cannot see the skips that matter (F4).** The step exists to stop coverage from quietly leaving the E2E lane; it cannot see the two integration-lane skips that this debt is about, and nothing would notice its removal.
4. **A documented six-case scheduled proof has zero hosted executions (F7).** The register and the testing docs are ahead of the evidence by one schedule interval.
5. **The safe path costs more than the unsafe one (F2).** Every incentive points at `pnpm test:integration <file>`, which is the fail-open path.

## Resolution

Ordered so that each step's guard lands with a red test for the forbidden state (F9). Steps 1–2 are code; 3–4 change CI and documentation together; 5–7 are owner decisions recorded in this document.

1. **[ ] Make the Stripe provider suites fail closed at module scope.** Extract one client-owned seam, `tests/shared/stripe-provider-gate.ts`, exporting `resolveStripeProviderGate(env, { flag, priceKeys })` that returns `{ mode: 'skip', reason }` when the flag is not `'true'` and **throws** `StripeProviderGateError` (code `PROVIDER_KEY_INVALID` / `PROVIDER_PRICE_INVALID`, values never logged) when the flag is on and a prerequisite is unusable. Red-first unit cases: flag off → skip; flag on + dummy key → throw; flag on + missing price → throw; flag on + usable inputs → run. Both suites and the wrapper's `assertPreflight` consume the seam, removing the three duplicated predicate sets. The F1 reproduction commands must exit nonzero after this step; the flag-off run must still skip.
2. **[ ] Replace the grep with an executable, parser-backed skip policy.** Add `tests/skip-policy-source-scan.ts` plus its test, walking `tests/**`, `scripts/**`, `src/**`, `app/**`, `components/**`, and `lib/**` with the TypeScript compiler API (same shape as `tests/test-double-fidelity-source-scan.ts`) to find every `skip`, `skipIf`, `runIf`, `todo`, `fixme`, and `only` modifier and every `cond ? describe.skip : describe` ternary. Fail closed on an unreadable file or an empty walk. Allowlist with exact floors: fourteen E2E `test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials')` sites, two POSIX `it.skipIf(process.platform === 'win32')` sites, and the step-1 gate form in the two provider suites; any growth, any new form, and any deletion of the step-1 gate fails. Red-first: the scan must first fail on a synthetic `describe.skip` in a scratch fixture and on the current tree's `|| true` semantics. Delete `ci.yml:91-103` once the scan runs in the unit lane, and pin the deletion in `tests/ci-workflow.test.ts`.
3. **[ ] Make required CI evidence honest.** (a) Remove the same-repo condition from the browser install and browser test steps (`ci.yml:120`, `:125`) so fork PRs run the 398 credential-free tests. (b) Add a final `Evidence summary` step that writes which lanes executed and which were skipped, with the reason, to `$GITHUB_STEP_SUMMARY` and emits a `::warning::` for every skipped lane, so absence is visible on the check even while the job stays green. (c) Rewrite `docs/dev/testing-infrastructure.md:393` and `docs/dev/dependency-update-protocol.md:17,97-100` to state the true lane matrix and the true line numbers; replace "not a weaker merge bar" with the measured gap. (d) Red-first: `tests/ci-workflow.test.ts` gains cases for the unconditional browser steps and the summary step, and its Dependabot cases drop the "because secrets are unavailable" rationale.
4. **[ ] Make the safe provider path the default one.** Rename `scripts/run-trial-clock-smoke.ts` to `scripts/run-stripe-provider-contracts.ts` (with its two DEBT-469-split test files and the workflow reference); load `.env.local` with `override: false` before preflight, matching `playwright.config.ts:6`; add `"test:stripe-provider": "tsx scripts/run-stripe-provider-contracts.ts"` to `package.json`; document that single command and its expected `PASS executed=6 passed=6 skipped=0` receipt in `docs/dev/integration-tests.md`, and state that `pnpm test:integration <provider-file>` with the flag exported now fails rather than skips.
5. **[ ] Owner decision — Dependabot E2E.** Either mirror the E2E test-mode credentials (`E2E_CLERK_USER_*`, Clerk and Stripe test keys, price IDs) into the repository's Dependabot secrets so the two E2E steps can drop `github.actor != 'dependabot[bot]'`, or record in `docs/dev/dependency-update-protocol.md` that Dependabot PRs are merged without E2E evidence and that the local `pnpm test:e2e` in `:17` is therefore mandatory, not conditional. Either way, the sentence at `:17` loses its "if".
6. **[ ] Owner decision — enforced merge bar.** Record in `docs/dev/` the current ruleset facts from F6, and decide whether `CodeRabbit` becomes a required context and whether `required_review_thread_resolution` is turned on for `main`. Recording "process-only, by choice" is an acceptable outcome; leaving it undocumented is not.
7. **[ ] Activation receipt and convention.** Dispatch `stripe-trial-clock-smoke.yml` (or its renamed successor) on the current `main` and record the first hosted `executed=6` receipt here and in DEBT-472's register entry. Add to `docs/debt/index.md`'s conventions, beside DEBT-472 step 6: a scheduled-only proof is not claimed in documentation until a hosted run has executed it, and a guard lands with a red test for the state it forbids.

## Verification

- `env -u STRIPE_SECRET_KEY RUN_STRIPE_CHECKOUT_CLIENT_CONTRACT=true pnpm test:integration tests/integration/stripe-checkout-client-contract.integration.test.ts` and the trial-clock equivalent exit **nonzero** with a `PROVIDER_KEY_INVALID` message that contains no key material; the same commands without the flag exit 0 with the cases reported as skipped.
- `pnpm test:stripe-provider` with a real test-mode key in `.env.local` and nothing exported prints `PASS executed=6 passed=6 skipped=0`; with the key removed it exits 1 at preflight.
- `pnpm test --run tests/skip-policy-source-scan.test.ts` passes on the tree and fails on a scratch file containing `describe.skip`, `test.skipIf(…)`, or a `? describe.skip : describe` ternary outside the allowlist; `ci.yml` no longer contains the grep step and `tests/ci-workflow.test.ts` asserts its absence.
- A fork-shaped CI run (or a same-repo run with the browser condition removed) shows the browser lane executing; the `Evidence summary` step lists every lane with `executed` or `skipped: <reason>`.
- `docs/dev/testing-infrastructure.md` and `docs/dev/dependency-update-protocol.md` contain no claim that the browser lane needs secrets and no claim that the Dependabot path is not weaker; steps 5 and 6 each have a dated decision recorded.
- `gh run list --workflow=<provider workflow>` shows at least one hosted run at or after the step-1 head with `executed=6`.

## Related

- Origin of the wrapper-around-the-suite shape: [DEBT-468](./debt-468-test-estate-coverage-and-fixture-debt.md) Part 1 item 1 (completed 2026-08-17) — the fail-open suite was observed there and wrapped rather than fixed.
- Scheduled-only Stripe lanes and the required-CI boundary: [DEBT-471](./debt-471-e2e-ci-external-fragility.md) F1; the six-case runner: [DEBT-472](./debt-472-test-double-fidelity-and-contract-discipline.md) Part B and F7 (the only prior enforcement inventory), step 6 (the convention this debt extends).
- Live code: `tests/integration/stripe-checkout-client-contract.integration.test.ts`, `tests/integration/stripe-trial-clock-smoke.integration.test.ts`, `tests/integration/setup.ts`, `.env.test`, `scripts/run-trial-clock-smoke.ts`, `.github/workflows/ci.yml`, `.github/workflows/stripe-trial-clock-smoke.yml`, `tests/ci-workflow.test.ts`, `tests/e2e/global.setup.ts`, `playwright.config.ts`.
- Correct in-repo patterns to copy: `tests/integration/helpers.ts:7-11` (module-scope throw), `tests/e2e/helpers/credential-health-check.ts` (validated, coded, value-free failures), `tests/test-double-fidelity-source-scan.ts` (parser-backed policy with exact floors).
- Canon: [Shore, *Fail Fast*, IEEE Software 21(5), 2004](https://www.martinfowler.com/ieeeSoftware/failFast.pdf); [Fowler, *Eradicating Non-Determinism in Tests*](https://martinfowler.com/articles/nonDeterminism.html) (remote-resource tests leave the deployment pipeline but keep a scheduled home — the design this repository already chose for Stripe); [*Software Engineering at Google*, ch. 11 "Testing Overview"](https://abseil.io/resources/swe-book/html/ch11.html) (a test suite is valuable only while its signal is trusted) and [ch. 14 "Larger Testing"](https://abseil.io/resources/swe-book/html/ch14.html) (larger tests need owned, standardized, understandable infrastructure); [GitHub Docs, *Control jobs with conditions*](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions) (skipped required job reports Success); [GitHub Docs, *Troubleshooting Dependabot on GitHub Actions*](https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions) (Dependabot secrets); [dotenv README](https://github.com/motdotla/dotenv/blob/master/README.md) (`override` default).
