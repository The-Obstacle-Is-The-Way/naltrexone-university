# BUG-327: Dependabot Branches Are Built on Vercel With Preview Secrets

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — no deployment observed for #1404; a Dependabot merge through the tooling remains; due 2026-10-20
**Priority:** P3
**Date:** 2026-10-05 (found); filed 2026-10-06
**Resolved:** —
**Verification receipts:** —

---

## Summary

The owner decided on 2026-09-19 that Dependabot's pull requests get no shared credentials before review. GitHub Actions honors that: the Dependabot secret store is empty, and E2E withholds its credentials from Dependabot (`docs/dev/dependency-update-protocol.md`, "Dependabot PRs and Secrets").

Vercel does not. Its Git integration builds every branch as a Preview deployment, Dependabot's included. The build runs with Preview environment variables:
1. it installs the new dependency versions, running their allowed install scripts;
2. it runs the migration script against the shared Preview database;
3. it runs `next build`.

So newly bumped dependency code can execute, before any human review, with:
- the Preview database URL, which carries migration rights;
- the Clerk development-instance secret, the same instance CI's E2E uses;
- the Stripe TEST secret and webhook secret;
- the Preview `CRON_SECRET`, `CONSENT_STATE_SECRET` and server-action key;
- Vercel's OIDC token.

Required CI also runs its database service from a mutable image tag, a smaller gap of the same kind.

## Evidence

- **Both open Dependabot PRs were deployed.** GitHub's deployments API lists a `vercel[bot]` Preview deployment for #1375 (head `69e79155`) and for #1370 (head `cca3b10d`), read 2026-10-05.
- **The build command.** It runs `verify-migration-ledger pre`, `run-managed-db-migrate`, `verify-migration-ledger post`, then `pnpm build` (`vercel.json:3`).
- **Nothing excludes these branches.** There is no `git.deploymentEnabled` and no `ignoreCommand`.
- **Mitigations that exist.**
  - pnpm's 7-day minimum release age and Dependabot's 7-day cooldown.
  - `trustPolicy: no-downgrade`, the install-script allowlist (`strictDepBuilds`), `blockExoticSubdeps` and a frozen lockfile.
  - Preview is not production, and the Resend key is production-only.
  These reduce the chance of a malicious release; none stops one from reading what the build can see. The protocol makes that point itself: "none makes shared pre-review credential exposure acceptable".
- **The mutable image.** `.github/workflows/ci.yml:22` runs `image: postgres:16`, while the hosted-checkout workflow pins a digest (`stripe-hosted-checkout-smoke.yml:25`). `tests/ci-workflow.test.ts` enforces the pin only for the hosted workflow. DEBT-474's (archived) pin inventory missed this line.
- **The merge rule.** Only `test` is a required status check (ruleset `17666822`), so skipping Vercel's preview for Dependabot does not block a merge under the ruleset.

## Options

1. **Skip Vercel previews for Dependabot branches,** with `git.deploymentEnabled` in `vercel.json` for `dependabot/**`, or an `ignoreCommand` that exits early for those branches. A Dependabot change is then first built by Vercel after review, on `dev`.
2. **Give Preview its own isolated, low-value credentials.** That is the larger isolation the protocol defers to its paying-customer trigger.
3. **Accept it and record it** in the protocol as a known exception.

For the image: pin `postgres:16` by digest, and extend the workflow test to every workflow.

## Resolution (decided)

Option 1, plus the digest pin.
- Option 1 restores the owner's 2026-09-19 boundary at no cost. Dependabot PRs still get typecheck, lint, unit, browser, integration and build in GitHub Actions, without shared secrets.
- Before shipping, confirm the exact `deploymentEnabled` branch-pattern syntax in Vercel's documentation. Confirm also that `scripts/merge-reviewed-pr.ts` accepts a PR with no Vercel status.
- The protocol's "Vercel/Codecov checks … remain separate merge requirements" line changes to match.

## Progress

**2026-10-06, the fix.** Tests were written red first.
- **`vercel.json`** sets `git.deploymentEnabled` to `{ "dependabot/**": false }`. Vercel's documentation confirms the form: a map of minimatch patterns, where unlisted branches stay enabled and any matching true rule wins. `tests/vercel-config.test.ts` pins the exclusion, and fails if any rule could re-enable a Dependabot branch.
- **Merging is unaffected.** `scripts/merge-reviewed-pr.ts` requires only the `test` check and Codecov's patch status, not a Vercel status, and the ruleset requires only `test`.
- **`ci.yml`'s Postgres service** is pinned to the digest the hosted-checkout workflow already uses. `tests/ci-workflow.test.ts` now requires a digest for every service and job container, in every workflow.
- **Docs.** `docs/dev/dependency-update-protocol.md` and `docs/dev/deployment-environments.md` describe the boundary.
- **Existing branches.** Vercel reads the setting from each branch's own commit. So the open Dependabot pull requests, created before this, keep deploying until Dependabot rebases them onto a base that carries it (`dev` for routine updates, `main` for security updates).

## Verification

- [x] A test, red first, pins the `vercel.json` exclusion for Dependabot branches.
- [x] Observation 2026-10-06: security PR [#1404](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1404), targeting `main`, carries the exclusion on head `9ccfabe5`. GitHub's deployments API returns zero records for that SHA; its checks contain no Vercel deployment.
- [ ] Owner/operator: a Dependabot PR with the exclusion merges through the checked-in tooling, due 2026-10-20. #1404 is still open and red; no merge proof is claimed.

  Its [CI run](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/37479614420) fails installation with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` for three versions: `@types/node@24.19.1`, `acorn@8.19.0` and `shell-quote@1.12.0`. The existing [security-patch playbook](../dev/supply-chain-overrides.md#urgent-cve-patches-before-the-7-day-cooldown) already covers waiting or a reviewed exact-version exception. No new debt is needed for a missing policy. Do not exempt unrelated lockfile churn merely to unblock the security bump.
- [x] `ci.yml`'s Postgres image is pinned by digest, and the workflow test covers every workflow.
- [x] `docs/dev/dependency-update-protocol.md` and `docs/dev/deployment-environments.md` describe the boundary.

## Related

- DEBT-474 (archived): CI secret scope and action immutability.
