# Supply-Chain Policy Overrides - On-Call Playbook

This is the documented escape hatch for the supply-chain hardening policy
introduced by DEBT-394.

Use this playbook when a dependency update needs one of these deliberate,
reviewable exceptions:

- a security fix is newer than the 7-day maturity window;
- a new dependency needs an install script;
- a dependency needs to be tested against the policy before a real PR;
- pnpm audit needs a documented advisory exception.

The DEBT-394 record is archived at
`docs/_archive/debt/debt-394-supply-chain-hardening.md`.

The policy is intentionally strict:

```yaml
minimumReleaseAge: 10080
minimumReleaseAgeStrict: true
minimumReleaseAgeIgnoreMissingTime: false
blockExoticSubdeps: true
trustPolicy: no-downgrade
strictDepBuilds: true
trustPolicyExclude:
  - semver@6.3.1
  - tinyexec@1.2.2
allowBuilds:
  '@clerk/shared': false
  '@sentry/cli': true
  bufferutil: false
  core-js: false
  esbuild: true
  sharp: true
  utf-8-validate: false
```

Do not weaken these settings casually. Every exception must be small,
named in the PR body, and removed when it is no longer needed.
There are no standing `minimumReleaseAgeExclude` entries in the active
policy; add one only as a dated temporary override through the workflow
below.

## Urgent CVE patches before the 7-day cooldown

`minimumReleaseAge: 10080` means pnpm refuses package versions published
less than 10,080 minutes ago, which is 7 days.

For ordinary updates, wait for the version to mature. For urgent security
fixes, use `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.

Package-wide exception:

```yaml
minimumReleaseAgeExclude:
  - '<pkg-name>' # urgent advisory GHSA-xxxx-yyyy-zzzz; remove after YYYY-MM-DD.
```

Exact-version exception:

```yaml
minimumReleaseAgeExclude:
  - '<pkg-name>@<version>' # urgent advisory GHSA-xxxx-yyyy-zzzz; remove after YYYY-MM-DD.
```

Prefer exact-version exceptions when the advisory fix is known. A
package-wide exception also allows later versions of that package during
the exception window, so it has a wider trust surface.

Workflow:

1. Confirm the advisory source and the fixed version.
2. Add the smallest `minimumReleaseAgeExclude` entry that unlocks the fix.
3. Add a rationale comment with the advisory ID and removal date.
4. Land the security update through the normal PR path.
5. Name the exception in the PR body.
6. Remove the exception after the version is older than 7 days.

Never leave a maturity exception in place as cleanup debt. It is a
temporary override, not a standing policy.

Temporary bootstrap exceptions are allowed only when enabling the policy
over package versions that already shipped to `dev` before the policy was
active. Scope them to exact versions, give each line a removal date, and
remove them as soon as the versions are older than the configured 7-day
window. Do not use package-wide bootstrap exceptions.

PR #382 removed the dated DEBT-394 bootstrap exceptions after they aged
out. There are no current package-wide bootstrap exceptions.

## Adding a new native-build package to allowBuilds

`strictDepBuilds: true` means dependencies with install or postinstall
scripts must be explicitly allowed or denied. `allowBuilds: true` means
we trust that package to execute code at install time.

When pnpm reports a new package that wants a build script:

```sh
rm -rf node_modules
pnpm install --frozen-lockfile
```

Read the pnpm error and inspect the package's script before deciding:

```sh
node -e "const p=require('./node_modules/<pkg>/package.json'); console.log(p.scripts)"
```

If the script is required for the package to function, add an allow entry:

```yaml
allowBuilds:
  esbuild: true # validates/prepares platform esbuild binaries used by Vite, tsx, and Drizzle tooling.
```

If the script is telemetry, a funding banner, an optional accelerator, or
otherwise unnecessary, deny it:

```yaml
allowBuilds:
  core-js: false # postinstall prints support/funding banner with temp-file dedupe; no build artifact.
```

After editing, verify from a clean install:

```sh
rm -rf node_modules
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

If the local authenticated billing E2E environment is present, also run:

```sh
lsof -ti:3000 | xargs kill -9 2>/dev/null
pnpm test:e2e
```

The committed `allowBuilds` entry must include a one-line rationale
comment. A bare `true` is not acceptable because reviewers cannot tell
what install-time code they are trusting.

## Why Dependabot cooldown and pnpm minimumReleaseAge MUST match

Dependabot and pnpm enforce two different parts of the same policy.

- `.github/dependabot.yml:14-15` sets `cooldown.default-days: 7` for npm
  version updates.
- `.github/dependabot.yml:65-66` sets `cooldown.default-days: 7` for
  GitHub Actions version updates.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080`, which is the same
  7-day window expressed in minutes.

Keep these values coupled. If Dependabot cooldown is shorter than pnpm's
minimum release age, Dependabot opens PRs that `pnpm install` refuses. If
pnpm's minimum release age is shorter than Dependabot cooldown, pnpm
accepts fresh versions that the Dependabot policy is trying to delay.

Change one only when the same PR changes the other and explains the new
window.

## Testing a candidate dep against the policy

Use a scratch branch for policy experiments. Do not test fresh packages on
a branch that already contains unrelated work.

```sh
git switch -c scratch/test-supply-chain-policy
pnpm add --save-dev <candidate-package>
```

Expected outcomes:

- fresh package accepted only if it is older than the 7-day threshold or
  explicitly excluded;
- fresh package rejected with a minimum-release-age error when no mature
  version satisfies the requested range;
- package with a build script rejected until `allowBuilds` names it.

Roll back the experiment before returning to real work:

```sh
git restore package.json pnpm-lock.yaml
rm -rf node_modules
pnpm install --frozen-lockfile
git switch -
git branch -D scratch/test-supply-chain-policy
```

Only delete the scratch branch after confirming it has no useful changes.
Never use this rollback flow on a branch with uncommitted work from
another session.

## Trust review for new install scripts

Install scripts are a supply-chain execution boundary. A malicious install
script can read workspace files, environment variables, SSH agent sockets,
GitHub tokens on CI, and build-time secrets on hosting providers.

Default to `false` unless you can explain why the script must run.

Current denied examples:

- `@clerk/shared: false` - postinstall prints a telemetry notice and writes
  `telemetryNoticeVersion` to local Clerk config; no build artifact is
  required.
- `bufferutil: false` - optional `ws` native performance addon built by
  `node-gyp-build`; `ws` can fall back without it.
- `core-js: false` - postinstall prints support/funding text with temp-file
  dedupe; no build artifact is required.
- `utf-8-validate: false` - optional `ws` legacy UTF-8 native addon built
  by `node-gyp-build`; Node 24 and `ws` can fall back without it.

Current allowed examples:

- `@sentry/cli: true` - installs or verifies the platform `sentry-cli`
  binary used by Sentry tooling.
- `esbuild: true` - validates or prepares platform binaries used by Vite,
  tsx, and Drizzle tooling.
- `sharp: true` - verifies or builds the native image-processing addon used
  by Next's image pipeline.

Use these comments as templates. The rationale should name the artifact or
runtime behavior that would break without the script.

## Trust-policy downgrade exceptions

`trustPolicy: no-downgrade` fails when a package version has weaker trust
evidence than an earlier-published version of the same package. That can
be a real supply-chain warning, so do not bypass it automatically.

The only current exception is exact-version scoped:

```yaml
trustPolicyExclude:
  - semver@6.3.1 # legacy Babel dependency published in 2023; exact exception for no-downgrade provenance gap.
  - tinyexec@1.2.2 # already-shipped Vite/Vitest utility; exact exception for no-downgrade provenance gap.
```

Why this is allowed:

- Babel requires `semver@^6.3.1` through `@babel/core`.
- `semver@6.3.1` is a 2023 package and not a fresh-publish event.
- `tinyexec@1.2.2` is already present in the shipped lockfile through the
  Vite/Vitest toolchain.
- The exceptions are exact-version scoped, not package-wide.
- The policy still protects every other package and every future `semver`
  or `tinyexec` release.

Workflow for any future trust-policy exception:

1. Confirm the dependency chain that requires the flagged package.
2. Confirm the package version, publish date, and registry integrity.
3. Prefer changing the dependency graph to a trusted version when that is
   compatible.
4. If no compatible trusted version exists, add an exact-version
   `trustPolicyExclude` entry with a rationale comment.
5. Name the exception in the PR body and remove it when the upstream chain
   no longer needs it.

## Audit hygiene under pnpm 11

pnpm 11 reports and filters audit advisories by GHSA identifier. If this
repo ever needs to ignore a specific advisory, use
`auditConfig.ignoreGhsas`, not the deprecated CVE-based ignore key.

Example:

```yaml
auditConfig:
  ignoreGhsas:
    - GHSA-xxxx-yyyy-zzzz # accepted until 2026-06-02; reason and owner in PR body.
```

Do not add audit ignores proactively. An ignore is allowed only after a
review concludes that the advisory is not reachable, is mitigated by other
controls, or cannot be fixed without a larger migration.

## Vercel deploy notes

At the pnpm 11 migration, Vercel's package-manager documentation listed
pnpm 6-10 as supported package-manager versions. This repo still pins
`packageManager: "pnpm@11.3.0"` in `package.json`, and Node 24 includes
Corepack, which is the mechanism expected to activate the pinned pnpm
version.

For every pnpm major migration, the Vercel preview is load-bearing
evidence. Before merging, confirm the Vercel build log shows:

- Corepack or pnpm activation for the pinned pnpm 11.x version;
- `pnpm install` running under pnpm 11.x;
- install completion without falling back to pnpm 10.x or npm.

If Vercel falls back to pnpm 10.x or fails before installing, stop and
root-cause before merge. Possible fixes include an explicit install command
or Corepack activation in Vercel configuration, but do not add those until
the preview log proves they are necessary.
