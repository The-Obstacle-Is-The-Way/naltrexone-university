# DEBT-394: Supply-Chain Hardening (pnpm maturity gates + strict build policy)

**Priority:** P2 (active supply-chain campaigns are publishing credential-stealing packages to npm-class registries; this repo has local `.env.local` secrets on disk, CI secrets in `.github/workflows/ci.yml:46-62`, and Vercel build-time secrets. Dependabot improves freshness, but it does not prove package contents are benign. We need pnpm maturity gates and install-script policy.)
**Created:** 2026-05-25
**Source:** Follow-up to [DEBT-392](./debt-392-dependency-hygiene-audit.md) (Dependabot is now live but does not vouch for package contents) and [DEBT-393](./debt-393-dependabot-triage-and-config-hardening.md) (config-level Dependabot tightening, but not malicious-publish defense). The proximate trigger is TrapDoor reporting on 2026-05-23: [The Hacker News](https://thehackernews.com/2026/05/trapdoor-supply-chain-attack-spreads.html) reports more than 34 malicious packages across over 384 versions spanning npm, PyPI, and crates.io. pnpm setting names, units, defaults, and locations are from the official [pnpm settings reference](https://pnpm.io/settings) and [pnpm changelog](https://github.com/pnpm/pnpm/blob/main/pnpm/CHANGELOG.md).
**Related:** [DEBT-393](./debt-393-dependabot-triage-and-config-hardening.md) (Dependabot triage and config; its `cooldown.default-days: 7` must stay matched to pnpm `minimumReleaseAge: 10080`), [DEBT-392 (archived)](./debt-392-dependency-hygiene-audit.md), [DEBT-332](../../debt/debt-332-security-posture-audit.md) (security posture; supply-chain is the missing chapter)

**Status:** Resolved 2026-05-26 — shipped three PRs: PR 1 (#348) added `pnpm-workspace.yaml` with `minimumReleaseAge: 10080`, `blockExoticSubdeps: true`, and `trustPolicy: no-downgrade`, and bundled the shared `.husky/check-node-version.sh` Node-version guard with the pre-commit/pre-push hook wiring. PR 2 (#349) added `strictDepBuilds: true` and a curated `allowBuilds` map (`esbuild`, `sharp`, `@sentry/cli` approved; `@clerk/shared`, `bufferutil`, `core-js`, `utf-8-validate` denied) with per-entry rationale comments. PR 3 (#350) migrated `packageManager` from `pnpm@10.33.4` to `pnpm@11.3.0`, bumped `engines.pnpm` to `>=11.0.0`, bumped CI `pnpm/action-setup` version input to match, added the v11-only `minimumReleaseAgeStrict: true` and `minimumReleaseAgeIgnoreMissingTime: false`, and shipped `docs/dev/supply-chain-overrides.md` as the on-call playbook for legitimate-bypass cases (`minimumReleaseAgeExclude` for urgent CVE patches, `allowBuilds` addition flow, Dependabot `cooldown` / pnpm `minimumReleaseAge` coupling, scratch-branch policy testing, and Vercel pnpm 11 notes). PR 3 also added ~70 time-bounded `minimumReleaseAgeExclude` bootstrap exceptions with explicit removal dates of 2026-05-30 and 2026-06-02; a follow-up cleanup PR is required after those dates to remove the exceptions and confirm `pnpm install --frozen-lockfile` still passes. `pnpm audit` unchanged at 3 moderate / 0 high / 0 critical.

---

## Problem

The repo currently runs `pnpm@10.33.4` (pinned by `package.json:3`) with Node 24 (`package.json:5`, `.nvmrc`). That is materially better than the original draft assumed: the current pnpm settings reference says several desired controls already exist before pnpm 11:

| Setting | pnpm 10.33.4? | pnpm 11+? | Evidence / correction |
|---|---:|---:|---|
| `minimumReleaseAge` | yes | yes | Added in v10.16.0; type is number of **minutes**; default is 0 before v11 and 1440 since v11. |
| `minimumReleaseAgeStrict` | no | yes | Added in v11.0.0; defaults to true when `minimumReleaseAge` is explicitly configured. |
| `minimumReleaseAgeIgnoreMissingTime` | no | yes | Added in v11.0.0; default true, set false to fail if registry metadata lacks a `time` field. |
| `minimumReleaseAgeExclude` | yes | yes | Added in v10.16.0; this is the documented urgent-patch bypass, by package name or exact version. |
| `blockExoticSubdeps` | yes | yes | Added in v10.26.0; default true in current docs and in pnpm 11's supply-chain defaults. |
| `trustPolicy: no-downgrade` | yes | yes | Added in v10.21.0; blocks decreased package trust evidence, not semver downgrades. |
| `strictDepBuilds` | yes | yes | Added in v10.3.0; install fails when dependencies have unreviewed build scripts. |
| `allowBuilds` | yes | yes | Added in v10.26.0; v11 removes legacy `onlyBuiltDependencies`/`neverBuiltDependencies`/`ignoreDepScripts` in favor of this map. |

So the debt is not "pnpm 10 cannot do supply-chain hardening." The actual debt is:

1. We have no `pnpm-workspace.yaml`, so none of the project-level supply-chain settings are configured.
2. We have no curated `allowBuilds` policy, so install-script review is not explicit.
3. We still need pnpm 11 eventually because it makes the safer defaults native, adds strict missing-time behavior, re-validates lockfile entries against `minimumReleaseAge`/`trustPolicy`, and removes the legacy build-script setting surface.

The threat is concrete, not hypothetical. TrapDoor is enough evidence for this doc: it used dependency publishes across multiple ecosystems to steal wallets, SSH keys, cloud credentials, GitHub tokens, browser data, environment variables, and API keys. The mechanism is generic: malicious package code executes at install time or is bundled into runtime code.

What lives on this repo's install hosts and is therefore exposable today:

| Install host | Exposed material |
|---|---|
| Local dev machine | `.env.local` on disk contains Stripe, Clerk, Neon, webhook, and E2E credentials when the developer has the full local gate configured. Those values are not automatically in `process.env` during a plain `pnpm install`, but a malicious install script can read workspace files unless sandboxed by policy. |
| GitHub Actions runner | The CI job exports Clerk, Stripe, and E2E values at `.github/workflows/ci.yml:46-62`; the runner also has a job-scoped `GITHUB_TOKEN`. |
| Vercel build environment | Build-time environment variables are available during install/build, and a malicious package can also alter bundled application output that reaches users. |

The single highest-impact setting is `minimumReleaseAge`. Setting `minimumReleaseAge: 10080` means pnpm refuses versions published less than seven days ago. That closes the "fresh malicious publish" window. It must be paired with Dependabot `cooldown.default-days: 7` from DEBT-393 so Dependabot does not open PRs that pnpm intentionally refuses to install.

---

## Findings

### A. pnpm 11 is useful, but the policy can start on pnpm 10.33.4

Verified facts:

- `npm view pnpm time --json | jq '."11.0.0"'` returns `2026-04-28T09:34:08.502Z`.
- `npm view pnpm@11 engines --json` reports `node >=22.13` across the 11.x line.
- `npm view pnpm dist-tags --json` currently reports `latest-10: 10.33.4` and `latest-11`/`latest: 11.3.0`, so the 11.x line is no longer in the `11.0.x` patch series.
- The v11 changelog says pnpm is pure ESM, drops Node 18/19/20/21, changes `.npmrc` to auth/registry only, changes `pnpm audit` behavior, and removes legacy build dependency settings in favor of `allowBuilds`.

Recommendation: do not block the immediate maturity-gate work on the package-manager major. Land the pnpm-10-compatible policy first, then migrate to pnpm 11 as its own revertable PR.

### B. Native-build allowlist requires measured enumeration

`strictDepBuilds: true` plus `allowBuilds` is the right direction, but the candidate list must come from this tree, not memory. Current evidence:

- Present in the lockfile/tree and likely relevant to build policy:
  - `esbuild` — lifecycle script `postinstall: node install.js`.
  - `sharp` — lifecycle script `install: node install/check.js || npm run build`.
  - `@sentry/cli` — lifecycle script `postinstall: node ./scripts/install.js`.
  - `@biomejs/biome`, `next`, and `playwright` / `@playwright/test` are present and use optional platform packages or external browser install flows, but their package manifests do not expose root install/postinstall scripts in the installed tree.
- Not present in the current lockfile/tree: `@swc/core`, `unrs-resolver`, `oxc-parser`, `lefthook`.

This list is documentation, not the contract. The contract is the output of a clean install under the target pnpm/build policy plus `pnpm approve-builds`, which exists in pnpm 11.3.0 and writes `allowBuilds` entries.

### C. Dependabot `cooldown` must match `minimumReleaseAge`

DEBT-393 Tier 2 sets `cooldown.default-days: 7` on the Dependabot side. This doc sets `minimumReleaseAge: 10080` (minutes = 7 days) on the pnpm side. The values must match or Dependabot opens PRs that fail install for the difference window.

### D. The 7-day delay slows urgent security patches

A real cost: when a critical CVE drops in a dep we use, the default policy blocks a brand-new fix until it matures. There is no `--ignore-recent` flag in `pnpm@11.3.0 install --help` or `pnpm@11.3.0 add --help`. The documented bypass is `minimumReleaseAgeExclude`, which can exempt a package name or exact version.

Policy: urgent CVE work may add a temporary exact-version `minimumReleaseAgeExclude` entry, land the security update, and remove the exception after the version matures. The exception must be named in the PR body.

### E. Dependabot does not vouch for package contents

Dependabot scans registries for new versions and opens PRs. It does not verify that the new version is benign. Our malicious-publish defenses are `minimumReleaseAge`, `blockExoticSubdeps`, `trustPolicy`, and `strictDepBuilds`/`allowBuilds`, all of which live in pnpm config. Dependabot is for freshness; pnpm policy is for install safety. Both are needed.

---

## Remediation

Three single-concern PRs, each independently revertable, each gated by the full local quality gate (`pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`, plus `pnpm test:e2e` when the authenticated billing E2E env is available) and CodeRabbit.

### PR 1 — Add pnpm 10-compatible maturity and trust policy

Create `pnpm-workspace.yaml` while staying on `pnpm@10.33.4`.

```yaml
minimumReleaseAge: 10080
blockExoticSubdeps: true
trustPolicy: no-downgrade
```

Also confirm `.github/dependabot.yml` has `cooldown.default-days: 7` on both ecosystems. If absent, add it here or in the DEBT-393 config PR; the value must match.

Verification:

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
pnpm audit --json | jq '.metadata.vulnerabilities'
```

### PR 2 — Enumerate `allowBuilds` and enable strict build review

This is the archaeology PR.

1. Extend `pnpm-workspace.yaml` with:

   ```yaml
   strictDepBuilds: true
   allowBuilds: {}
   ```

2. Run a clean install under the target policy.
3. Triage each flagged package:
   - legitimate native/binary installer (`esbuild`, `sharp`, `@sentry/cli`, etc.) -> set to `true` with a one-line rationale comment;
   - unexpected telemetry/linking script -> set to `false` or investigate before allowing.
4. Iterate until `pnpm install --frozen-lockfile` succeeds.
5. Run the full local gate.

Acceptance: `pnpm install --frozen-lockfile` succeeds on a clean clone, full gate green, and every `allowBuilds` entry has a rationale comment.

### PR 3 — Migrate `pnpm@10.33.4` -> current pnpm 11.x and enable v11-only strictness

Bump only after PRs 1 and 2 establish the policy baseline.

Edits:

- `package.json`: `packageManager: "pnpm@10.33.4"` -> current `pnpm@11.x` (resolve at PR time via `npm view pnpm dist-tags.latest-11` or `npm view pnpm dist-tags.latest` if still on 11).
- `package.json`: `engines.pnpm: ">=10.0.0"` -> `">=11.0.0"`.
- `.github/workflows/ci.yml`: keep `pnpm/action-setup@v6.0.8`; bump the `version:` input to match the new `packageManager` pin exactly.
- `pnpm-lock.yaml`: regenerate and commit the diff.
- `pnpm-workspace.yaml`: add v11-only strictness:

  ```yaml
  minimumReleaseAgeStrict: true
  minimumReleaseAgeIgnoreMissingTime: false
  ```

Add `docs/dev/supply-chain-overrides.md` documenting:

- how to use temporary exact-version `minimumReleaseAgeExclude` for urgent CVE patches;
- how to add a new native-build package to `allowBuilds`;
- why Dependabot `cooldown.default-days` and pnpm `minimumReleaseAge` must match;
- how to test an intentionally fresh package in a scratch branch and roll back the experiment.

Verification:

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
pnpm audit --json | jq '.metadata.vulnerabilities'
```

Acceptance: full gate green, `minimumReleaseAgeIgnoreMissingTime: false` active under pnpm 11, Dependabot cooldown still matched at 7 days, and the overrides doc is committed.

---

## Verification commands

```sh
# Confirm pnpm version surfaces
jq -r '.packageManager, .engines.pnpm' package.json
pnpm --version

# Confirm policy settings
ruby -e 'require "yaml"; p YAML.load_file("pnpm-workspace.yaml").slice("minimumReleaseAge", "minimumReleaseAgeStrict", "minimumReleaseAgeIgnoreMissingTime", "blockExoticSubdeps", "trustPolicy", "strictDepBuilds", "allowBuilds")'

# Confirm Dependabot cooldown matches
ruby -e 'require "yaml"; p YAML.load_file(".github/dependabot.yml")["updates"].map { |u| u["cooldown"] }'

# Sanity: a freshly published package should be refused unless excluded
pnpm add --save-dev <pkg-published-today>   # expect ERR_PNPM_MINIMUM_RELEASE_AGE_* or ERR_PNPM_NO_MATURE_MATCHING_VERSION
```

---

## Acceptance criteria

- `pnpm-workspace.yaml` exists and contains `minimumReleaseAge: 10080`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`, `strictDepBuilds: true`, and curated `allowBuilds`.
- After the pnpm 11 PR, `pnpm-workspace.yaml` also contains `minimumReleaseAgeStrict: true` and `minimumReleaseAgeIgnoreMissingTime: false`.
- Every entry in `allowBuilds` has a one-line rationale comment.
- `.github/dependabot.yml` `cooldown.default-days: 7` is present on both npm and GitHub Actions ecosystem blocks.
- `docs/dev/supply-chain-overrides.md` exists and documents `minimumReleaseAgeExclude`, the `allowBuilds` addition flow, and the cooldown/`minimumReleaseAge` interaction.
- The full local quality gate is green on each PR.
- `pnpm audit` count is unchanged or improved from the current baseline (3 moderate / 0 high / 0 critical at the time of writing).
- An intentionally fresh package is rejected by `pnpm add` without a `minimumReleaseAgeExclude` entry and allowed only when an explicit temporary exception is documented.

---

## Risk and reversibility

- **PR 1 (maturity/trust policy on pnpm 10.33.4)** — low-to-moderate risk. The most likely failure is a too-fresh package already in the lockfile or pulled during install. Revert deletes the new policy file.
- **PR 2 (`allowBuilds` + `strictDepBuilds`)** — moderate risk. The failure mode is "install fails with packages to review," which is loud and tractable. Revert removes the strict build policy.
- **PR 3 (pnpm 11 migration)** — moderate risk because pnpm 11 changes package-manager runtime requirements, config locations, audit behavior, and build-script settings. Mitigation: standalone PR after policy baseline, full gate, easy revert.
- **The 7-day delay on urgent CVE patches** — real cost. Mitigation: temporary exact-version `minimumReleaseAgeExclude` with PR-body justification.
- **Dependabot interaction** — if `cooldown` and `minimumReleaseAge` get out of sync, Dependabot PRs fail install. Mitigation: keep both docs and both configs explicitly matched at 7 days.

---

## Done when

All three PRs are merged to `dev` and synced to `main`. The full local quality gate is green on the final state. A demonstrated fresh-package rejection and an explicit `minimumReleaseAgeExclude` override flow are captured in the PR 3 description. The next Dependabot weekly run respects the 7-day cooldown. This doc is moved to `docs/_archive/debt/` with a resolution paragraph mirroring the DEBT-390 / DEBT-392 archival pattern, citing the three PRs.
