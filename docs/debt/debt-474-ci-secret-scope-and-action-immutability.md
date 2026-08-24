# DEBT-474: CI Secrets Are Job-Scoped and Required Workflows Reference Mutable Action Tags

**Status:** Open
**Priority:** P2
**Date:** 2026-08-24
**Source:** Split out of [DEBT-473](./debt-473-green-without-evidence.md) by the adversarial review of PR #831. That filing's first draft proposed mirroring the repository's E2E credentials into the Dependabot secrets store so Dependabot PRs could run the E2E lane; the review showed the proposal would widen an exposure that already exists: every provider credential CI holds is available to every step of the required job, and three of that job's actions are referenced by tags that can be moved. All receipts read at `dev` `5a095f12` (identical tree to `main` `33cf36a4`) and from the GitHub API on 2026-08-24.

## Description

Two facts about `.github/workflows/ci.yml` combine into one exposure.

### F1 — Every credential is job-scoped, so every step can read it

`ci.yml:35-62` declares the job's `env:` block. It exports `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, both price IDs, `E2E_CLERK_USER_USERNAME`, and `E2E_CLERK_USER_PASSWORD` from `secrets.*` (with dummy fallbacks for forks) at **job** scope. Those values are therefore present in the environment of every step that follows: typecheck, lint, the skip-policy grep, migrate, seed, unit tests (4,144 cases), integration tests, browser tests, Codecov upload, build, and E2E. Only the E2E steps (`:143-201`) need the real values; the build step needs the Clerk publishable key for prerender (`:42-44`) and nothing else on that list.

The repository already knows the correct pattern: `CRON_SECRET` is scoped to the single step that validates it (`ci.yml:138-141`), and the trial-clock workflow scopes `STRIPE_SECRET_KEY` and the price ID to its one smoke step (`stripe-trial-clock-smoke.yml:41-46`). The required job does not follow it.

What runs inside that environment is not only repository code. Every step from typecheck onward executes third-party dependency code — the TypeScript compiler, Biome, Vitest and its plugins, Next.js and its build pipeline, Playwright, and every transitive package they load. A dependency bump changes exactly that code. `pnpm-workspace.yaml:83-92` sets `strictDepBuilds: true` and an eight-entry `allowBuilds` map (`@sentry/cli`, `@stripe/cli`, `esbuild`, `sharp` allowed; `@clerk/shared`, `bufferutil`, `core-js`, `utf-8-validate` denied), which makes `pnpm install` exit nonzero on any unreviewed *install* script ([pnpm docs, build settings](https://pnpm.io/settings/build): "When `strictDepBuilds` is enabled, the installation will exit with a non-zero exit code if any dependencies have unreviewed build scripts"). That protects the install step and nothing after it.

### F2 — Three actions in the required job, and one in the trial-clock job, are referenced by mutable tags

| Workflow | Line | Reference | Immutable? |
| --- | --- | --- | --- |
| `ci.yml` | `:66` | `actions/checkout@3d3c42e5…` `# v7.0.1` | yes |
| `ci.yml` | `:71` | `pnpm/action-setup@0977fd99…` `# v6.0.10` | yes |
| `ci.yml` | `:77` | `actions/setup-node@v7` | **no** |
| `ci.yml` | `:129` | `codecov/codecov-action@v7.0.0` | **no** (a version tag is still a tag) |
| `ci.yml` | `:205` | `actions/upload-artifact@v7` | **no** |
| `stripe-trial-clock-smoke.yml` | `:33` | `actions/setup-node@v7` | **no** — runs before the step that receives `STRIPE_SECRET_KEY` |
| `stripe-hosted-checkout-smoke.yml` | `:25,:56,:61,:67,:95` | postgres by digest; checkout, pnpm, setup-node, upload-artifact by SHA | yes |

The hosted Checkout workflow is the repository's own standard: it pins by digest and SHA throughout, and `tests/ci-workflow.test.ts:135-143` enforces those pins *for that file only* ("pins dependencies that execute in the secret-bearing hosted workflow"). The required workflow — which bears the same secrets on every same-repo PR — and the trial-clock workflow have no equivalent test.

GitHub's guidance: "Pinning an action to a full-length commit SHA is currently the only way to use an action as an immutable release," because "a tag can be moved or deleted if a bad actor gains access to the repository storing the action" ([GitHub Docs, *Security hardening for GitHub Actions*](https://docs.github.com/en/actions/reference/security/secure-use)). The precedent is recent and exact: in [CVE-2025-30066](https://github.com/advisories/GHSA-mrrh-fwg8-r2c3) (advisory published 2025-03-15), `tj-actions/changed-files`' version tags were "retroactively modified … to reference a malicious commit," and the payload's purpose was to dump the runner's secrets into the job log. The three unpinned references here are GitHub- and Codecov-owned, which lowers the likelihood, not the mechanism.

### F3 — The Dependabot gap is presented as a constraint, and the obvious fix is the unsafe one

`docs/dev/dependency-update-protocol.md:92` states that GitHub does not provide repository secrets to Dependabot PR workflows, and `tests/ci-workflow.test.ts:47-56` pins the E2E steps' actor guard on that rationale. GitHub's actual rule is that Dependabot-triggered workflows receive **Dependabot secrets** through the same `secrets` context ([GitHub Docs](https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions)); `gh secret list --app dependabot` is empty. So the E2E lane *could* run on Dependabot PRs today by copying the existing secrets into that store — and given F1, that would place the shared Stripe test key, the Clerk dev-instance key, and the E2E user's password in the environment of a workflow whose entire purpose is to execute newly-bumped dependency code. That is the proposal DEBT-473's first draft made and the review rejected.

### F4 — What the credentials are, and what they reach

Names only; no value was read or printed.

- `STRIPE_SECRET_KEY` — TEST mode. Every lane (`local-dev`, `github-ci`, `github-stripe-hosted-smoke`, the `vercel-dev-preview` webhook) shares **one** Stripe test account, partitioned only by the `E2E_STRIPE_OWNER` metadata namespace ([DEBT-386](../_archive/debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) lineage; `tests/e2e/helpers/seed-test-user.ts`, `src/adapters/gateways/stripe/stripe-subscription-normalizer.ts:57-67`). The namespace prevents lanes from colliding; it does not limit what a holder of the key can create, read, or delete in that account.
- `CLERK_SECRET_KEY`, `E2E_CLERK_USER_USERNAME`, `E2E_CLERK_USER_PASSWORD` — the Clerk **dev instance** and its shared E2E user. `credential-health-check.ts` verifies the password against Clerk's API at every E2E start (`:490-495`).
- `STRIPE_WEBHOOK_SECRET` — the test-mode signing secret.
- `CRON_SECRET` — step-scoped (`ci.yml:138-141`), but its relationship to the production Vercel value is not recorded. [BUG-244](../_archive/bugs/bug-244-reconciliation-cron-never-scheduled.md) normalized `CRON_SECRET` across all Vercel scopes; whether the GitHub Actions copy equals Production is an owner fact. If it does, the CI copy authorizes production cron routes and should not exist in CI at all — the validation belongs where the value is consumed (`lib/env.ts:79` is `z.string().min(1).optional()` with no header-safety refine).
- `NEXT_PUBLIC_*` values are public by construction and are listed here only because they share the block.

Blast radius if exfiltrated: unbounded writes to the shared Stripe test account (customers, subscriptions, test clocks — the same resources the weekly smoke creates and deletes), Clerk dev-instance user takeover, forged test-mode webhooks, and — only if F4's `CRON_SECRET` question resolves the wrong way — unauthenticated production cron invocation.

## Impact

1. A compromised or tag-moved action, or a malicious transitive dependency executing under typecheck/test/build, can read every provider credential the repository holds, on every same-repo push and PR. TEST-mode scope bounds the damage to the shared test account and the dev Clerk instance, which is why this is P2 and not P1; the `CRON_SECRET` question is the one thing that could raise it.
2. The safe way to give Dependabot PRs E2E evidence (DEBT-473 step 6) cannot be chosen until F1 is fixed, because any credential placed in the Dependabot store inherits the job-scope exposure.
3. The repository's own pinning standard is enforced for the workflow that runs daily and not for the one that runs on every PR.

## Resolution

1. **[ ] Step-scope every secret.** Move the Clerk, Stripe, and E2E entries out of the job-level `env:` (`ci.yml:35-62`) into `env:` blocks on the steps that consume them: the Clerk publishable key (and `NEXT_PUBLIC_SKIP_CLERK`) on `Build`; the full set on `Validate E2E credential inputs` and `E2E smoke`. Unit, integration, browser, typecheck, lint, and Codecov run with no provider credential in their environment — which is also the honest statement of what they need (DEBT-473 F5 measured the browser lane at 64/398 with all of them unset; the integration provider suites skip without their flags). Red-first: `tests/ci-workflow.test.ts` asserts that the job-level `env:` contains no `secrets.` reference other than `DATABASE_URL`-class non-secrets, and enumerates which steps may carry each credential.
2. **[ ] Pin every `uses:` in all three workflows to a full commit SHA with a version comment**, and extend `tests/ci-workflow.test.ts:135-143` from the hosted workflow to `ci.yml` and `stripe-trial-clock-smoke.yml` (red-first: the test must fail on the current `@v7`/`@v7.0.0` references). `.github/dependabot.yml:75-83` already covers the `github-actions` ecosystem against `dev`; Dependabot updates SHA pins and their comments together, so pinning does not freeze the actions.
3. **[ ] Resolve `CRON_SECRET`.** Owner confirms whether the GitHub Actions value equals the production Vercel value. If it does: remove it from CI and rotate; move the header-safety check to a zod `.refine` on `lib/env.ts:79` (or the Vercel build), and delete the `Validate header-safe CI secrets` step (`ci.yml:138-141`) and its script's CI role (the function can stay). If it does not: record that fact in `docs/dev/deployment-environments.md` and keep the step or move it per the same reasoning.
4. **[ ] Decide Dependabot E2E, with least privilege.** After steps 1–2, DEBT-473 step 6 can choose between (a) **dedicated, disposable TEST-mode identities** — a second Stripe test-mode restricted key and a second Clerk dev user, scoped to the E2E steps only, stored as Dependabot secrets, rotated on a schedule — so a compromised dependency PR can reach only resources created for it; or (b) no credentials for Dependabot PRs, with the absence made explicit in the evidence summary (DEBT-473 step 3) and the local `pnpm test:e2e` mandatory before merging any dependency PR; or (c) a trusted, manually dispatched provider run on the exact PR head after human review, recorded in the PR. Option (a) is the only one that yields hosted E2E evidence; (b) and (c) are honest and cheaper. Never the existing shared credentials.
5. **[ ] Record the standard.** Add to `docs/dev/deployment-environments.md` (or a new `docs/dev/ci-secrets.md`): secrets are step-scoped; every `uses:` is SHA-pinned; the pin test covers every workflow; Dependabot secrets, if any, are dedicated identities. Reference it from `AGENTS.md`'s CI section.

## Verification

- `grep -nE "secrets\." .github/workflows/ci.yml` shows `secrets.*` only inside step-level `env:` blocks (plus the job-level `NEXT_PUBLIC_SKIP_CLERK` expression if retained), and `tests/ci-workflow.test.ts` fails when a `secrets.` reference is reintroduced at job scope.
- `grep -nE "uses: .*@v[0-9]" .github/workflows/*.yml` returns nothing; every `uses:` line matches `@[0-9a-f]{40} # v…`; the pin test covers all three workflow files and is red on the pre-fix tree.
- A same-repo CI run on the fixed head is green with the browser, integration, and unit steps showing no provider credential in `env` (inspect the step's environment via a diagnostic `env | grep -c STRIPE_SECRET_KEY` step during implementation only; remove before merge).
- The `CRON_SECRET` decision is dated and recorded; if rotated, the Vercel scopes and the cron route are verified with the new value per BUG-244's procedure.
- The Dependabot decision is dated and recorded; if (a), `gh secret list --app dependabot` lists only the dedicated identities and the E2E steps' `env:` reads them.

## Related

- Parent: [DEBT-473](./debt-473-green-without-evidence.md) F5 and step 6.
- Prior governance and secret handling: [BUG-248](../_archive/bugs/bug-248-main-branch-has-no-github-merge-gate.md), [BUG-244](../_archive/bugs/bug-244-reconciliation-cron-never-scheduled.md), [DEBT-394](../_archive/debt/debt-394-supply-chain-hardening.md) (supply-chain policy that added `strictDepBuilds`/overrides), [DEBT-386](../_archive/debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) (owner namespace).
- Live files: `.github/workflows/ci.yml`, `.github/workflows/stripe-trial-clock-smoke.yml`, `.github/workflows/stripe-hosted-checkout-smoke.yml`, `tests/ci-workflow.test.ts`, `pnpm-workspace.yaml`, `lib/env.ts`, `scripts/validate-header-safe-secret.ts`, `.github/dependabot.yml`.
- Canon: [GitHub Docs, *Security hardening for GitHub Actions*](https://docs.github.com/en/actions/reference/security/secure-use); [GHSA-mrrh-fwg8-r2c3 / CVE-2025-30066](https://github.com/advisories/GHSA-mrrh-fwg8-r2c3); [GitHub Docs, *Troubleshooting Dependabot on GitHub Actions*](https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions); [pnpm, build settings](https://pnpm.io/settings/build).
