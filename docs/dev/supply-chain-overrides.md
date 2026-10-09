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
`minimumReleaseAgeExclude` entries are always dated, temporary overrides for
in-flight security patches — never standing policy. Add one only through the
workflow below, and remove it once the pinned version is older than the 7-day
window (see the worked example below).

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

### When a fix is urgent

Decided on 2026-10-07 (DEBT-509). The 7-day gate defends against a
malicious publish, such as a hijacked maintainer account. Those are usually
found and pulled within hours to days; the September 2025 `chalk` and
`debug` hijack was unpublished the same day. A disclosed critical flaw in
the framework the app runs on can be exploited faster than that:
React2Shell (CVE-2025-55182, December 2025) was attacked within hours. So
the gate yields only when the vulnerability is the larger risk.

- **Urgent:** a critical or high advisory whose affected configuration
  matches this app, or whose exposure the advisory text cannot rule out.
  Take the fix the same day, through the workflow above.
- **Not urgent:** everything else, including a critical advisory for a
  feature the app does not use. An advisory's statement that
  Vercel-hosted deployments are protected settles production, but not
  `next dev`. Wait for the gate.

The exception narrows the gate; every other check still applies:

- Name only the exact versions that the official advisory or release notes
  give as fixed, plus the same-version companions pnpm refuses. For `next`,
  those are `@next/env` and the `@next/swc-*` platform binaries, published
  with it.
- `trustPolicy: no-downgrade` still runs, so a version published with weaker
  provenance than its predecessors is still refused.
- The full gate, exact-head review and promotion still apply.

### Advisories Dependabot cannot see

Dependabot alerts come from GitHub's advisory database. A dependency
repository's own published advisory can miss it, and nothing then raises an
alert. A check on 2026-10-07 found 12 of the advisories published by this
app's dependency repositories absent from the database:

| Repository | Missing | Affected here |
|---|---|---|
| `vercel/next.js` | 7 of 69, all from 2026-09-30 | Development server only; see DEBT-509 |
| `getsentry/sentry-javascript` | 1 of 6 (2026-09-24, tunnel-route middleware bypass) | No: no `tunnelRoute`, Turbopack builds, and 11.0.0 is fixed |
| `vitejs/vite` | 3 of 22 (2026-10-06, development server) | Yes, development only; fixed in 8.3.3 |
| `vitejs/vite-plugin-react` | 1 of 8 (2026-07-22, `@vitejs/plugin-rsc`) | No: the app does not use that package |

The gap is not one project's formatting quirk: the Sentry advisory's ranges
are well formed, yet it was still missing after 13 days. So the watch covers
every direct dependency, not a hand-picked few.

An advisory that does arrive can arrive late. Six of the seven Next.js
advisories reached the database at 2026-10-07T20:30Z, seven days after
publication, and Dependabot alerted on them at 2026-10-08T05:50Z. The other
six of the 12 were still missing that day. A week is as long as the
release-age gate, so waiting for Dependabot would forfeit the same-day rule
above.

Indirect dependencies have the same gap, and a longer one. 55 of this
repository's 90 Dependabot alerts were in indirect packages. In the year to
2026-10-08, 26 of the 424 repositories reached only through indirect
dependencies published 109 advisories, 48 of them critical or high. 106
reached the database, a median of 5 days after publication, and 41 took more
than a week: `undici`'s eleven 2026-09-04 advisories, three of them high,
took 24 to 25 days. `shell-quote`'s critical GHSA-pqg4-j6r4-53mv, alerted
here on 2026-10-06, took 7. Direct dependencies'
advisories took a median of 1.8 days. `pnpm audit` and OSV read the same
database; on 2026-10-08 neither had GHSA-h694-7cp9-m8p3 or the three Vite
advisories.

- `.github/workflows/upstream-advisory-watch.yml` runs
  `scripts/upstream-advisory-watch.ts` every six hours. It reads the published
  advisories of every repository behind `pnpm-lock.yaml`, 465 on 2026-10-08,
  and opens one issue per advisory published since 2026-10-01.
- GitHub starts this repository's scheduled runs hours late: the daily
  Stripe Checkout smoke started 3.6 to 9.2 hours late over the 30 days to
  2026-10-08, 5.0 at the median. So a new advisory can wait about half a day, longer if GitHub
  drops a run. Two delayed runs can also start in the same hour, about 960
  requests; a read over the limit fails the run, which names what it could
  not read.
- Direct dependencies use the `DEPENDENCY_REPOSITORIES` map, which gives every
  dependency and devDependency in `package.json` the repository named in its
  npm `repository` field, or `null` when it names none (today only
  `server-only`, a marker package). A test requires its keys to equal
  `package.json`'s, so adding or removing a dependency fails CI until the map
  is updated.
- Every other package in `pnpm-lock.yaml` is resolved when the job runs, from
  the npm `repository` field of its locked version, so a lockfile change
  needs no edit. From a repository reached only this way, critical and high
  advisories are raised, as is any of unknown severity. Medium and low ones
  are left to Dependabot: 106 of the 109 arrived, and none of the other three
  affected this app.
- A package that names no GitHub repository, or whose repository was deleted,
  is listed as not watched in the run's log without failing it. On 2026-10-08
  those were `client-only` and `eyes`, and `commondir`'s
  `substack/node-commondir`. A manifest or repository that cannot be read
  fails the run, as does an indirect dependency's.
- One unreadable repository, or one issue that cannot be opened, does not
  stop the others: the run raises what it can, then fails and names what it
  could not. Only a failure to list existing issues fails the run outright,
  because without that list nothing can be deduplicated.
- A run takes about four minutes and makes about 480 API requests, half of
  the workflow token's 1,000 an hour. Nothing else in this repository calls
  the API.
- Only issues opened by the job or by the repository owner count. This is a
  public repository, and a stranger's issue titled with a GHSA ID would
  otherwise settle that advisory, so its alert would never open.
- Critical and high advisories are assigned to the repository owner. GitHub
  notifies an assignee whatever their watch setting, and the same-day rule
  needs someone to see them. Medium and low advisories open unassigned. In the
  12 months to 2026-10-07 the direct dependencies' repositories published 81
  advisories: 12 critical, 33 high, 32 medium and 4 low. Most concern features
  or versions this app does not use, so the issue body gives `package.json`'s
  pins and every version `pnpm-lock.yaml` resolves.
- An issue opens on the upstream advisory's own ranges, which are free text
  and can be wrong, so the job does not evaluate them. Checked against the 95
  advisories published from 2026-06-14 to 2026-10-08, reading them as
  GitHub's syntax would have wrongly ruled out two that did affect this app.
  `brace-expansion`'s high GHSA-rgw5-rvv9-x895 used commas to mean "or", and
  `next`'s GHSA-3w37-wq28-93x7 gave a bare `16.3.0` for a range that covered
  16.3.5.
- GitHub's review settles the versions later. Once GitHub has reviewed an
  advisory and its ranges include no version `pnpm-lock.yaml` resolves, the
  job closes the issue with that evidence; Dependabot reads the same review.
  An issue a person reopens is not closed again. An advisory already reviewed
  and ruled out when the job first sees it opens no issue, and each run
  checks it again in case the lockfile changes. Anything uncertain stays
  open: no review yet, another ecosystem, an unreadable range or version, or
  a package the lockfile lacks, which another package may compile in.
- Over those 16 weeks the indirect dependencies would have raised 33
  critical or high issues, about two a week; 13 never affected this app. The
  review would have closed 10 of the 13, and not one of the advisories
  Dependabot alerted on.

Triage each issue with the rule above, record the outcome in it, and close it.
Neither the job nor Dependabot sees code that a package compiles in rather
than depends on, as Next.js does with dozens of packages; that maintainer's
own advisory is the signal.

### Worked example: js-yaml CVE-2026-53550 (2026-06-29)

> Historical snapshot: alert #46 later retargeted the patched v3 floor to
> `3.15.1`, and alert #63 (CVE-2026-84375, DEBT-476) to `3.15.2`; the live
> override now uses `3.15.2`, not the `3.15.0` shown below.

Dependabot alert #13 flagged `js-yaml` (medium): CVE-2026-53550 /
GHSA-h67p-54hq-rp68, a quadratic-complexity denial-of-service in merge-key
handling via repeated aliases, affecting `< 3.15.0`.

**Reachability (why it was low-risk).** `js-yaml@3.14.2` was transitive-only.
`pnpm why js-yaml` showed two production paths and no direct imports:

- `gray-matter@4.0.3` → `js-yaml` — used only by seed/build scripts
  (`scripts/seed/question-parser.ts`, `scripts/draft-question-import.ts`) to
  parse YAML frontmatter in our own first-party question markdown. Not a
  runtime request path and not attacker-controlled.
- `@istanbuljs/load-nyc-config` → `babel-plugin-istanbul` → jest →
  `react-native` → `@clerk/ui` — test/build tooling the deployed Next.js app
  never executes.

No code path parses attacker-supplied YAML, so the DoS was not exploitable in
production. We patched anyway, as defense-in-depth and to clear the alert.

**Fix — two edits in `pnpm-workspace.yaml`.**

1. Pin the patched version with an exact override. `3.15.0` is the
   `v3-legacy` security backport; it satisfies both consumers' `^3.13.1` and
   is an upgrade from `3.14.2`, so `no-downgrade` stays satisfied:

   ```yaml
   overrides:
     js-yaml: 3.15.0 # GHSA-h67p-54hq-rp68 / CVE-2026-53550 DoS patch
   ```

2. `3.15.0` was published 2026-06-26 (~3 days old at fix time), so
   `minimumReleaseAgeStrict` would refuse it. Add the smallest dated
   exception:

   ```yaml
   minimumReleaseAgeExclude:
     - js-yaml@3.15.0 # remove after ~2026-07-03 (7 days post-publish)
   ```

Then regenerate and verify:

```sh
pnpm install                       # rewrites the lockfile (Packages: +1 -1)
pnpm why js-yaml                    # must show js-yaml@3.15.0, no 3.14.2
pnpm typecheck && pnpm lint && pnpm test --run && pnpm build
```

**Removal.** Drop the `minimumReleaseAgeExclude: js-yaml@3.15.0` line once the
version is older than 7 days (~2026-07-03); a clean `pnpm install` will still
resolve `3.15.0` because the override remains. The override pin itself can stay
until a newer mature `js-yaml` (or a `4.x` consumer) makes it unnecessary.

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

## Required peers a web build never imports

pnpm installs every missing non-optional peer dependency by itself
(`autoInstallPeers`), and an optional peer is never installed that way. A
package that declares a peer it imports only from an entry point this app
never resolves, such as a React Native `index.native.js`, therefore pulls
that peer's whole tree into the install graph for nothing.

The fix is to mark that peer optional for the declaring package through
`packageExtensions`, which pnpm supports for `peerDependenciesMeta`. It
removes or stubs no package and changes no code the app loads. A host that
does use the peer still supplies it.

```yaml
packageExtensions:
  '<declaring-package>':
    peerDependenciesMeta:
      <peer>:
        optional: true
```

Before adding one:

1. Find every file in the declaring package that imports the peer, and show
   that each is reached only through an export condition or file extension
   that Next.js and Vitest never select.
2. Build the base commit and the branch, and compare what each deployment
   traces (`.next/**/*.nft.json`) and bundles. Neither may contain the peer.
3. Add the peer to `NEVER_INSTALLED` in
   `tests/dependency-graph-policy.test.ts`, so a later update that declares
   it again fails before the tree returns.

The current entries are the three Solana mobile-wallet packages under
`@clerk/ui` that declare `react-native`
([DEBT-506](../debt/debt-506-dependabot-alert-triage-2026-10.md)). Remove an
entry when upstream marks the peer optional itself.

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

When an advisory has no patched version compatible with the current
dependency graph, the record of that conclusion lives in a debt entry.
The Dependabot alert is dismissed against that record only after the
owner explicitly approves the dismissal; the record alone does not
authorize it, and until that approval the alert stays open with the
record linked rather than left to drift. The worked precedent is
`stream-json` in
[DEBT-476](../_archive/debt/debt-476-dependabot-alert-triage-2026-09.md) § F: the
patched line is ESM-only with renamed entry points that the sole consumer
cannot load, the vulnerable functions sit on no import path the
application can take, and forcing that two-major upgrade is not supported.
As reverified on 2026-09-22, jayson 5.0.0 has removed its stream-json
dependency, but even Solana 1.99.0 still requires jayson `^4.3.0` and Clerk
retains its adapter pins. The archived record and Deferred register row
retain the adoption/reachability triggers. Zero open alerts does not mean
the installed package was removed. CI does not run `pnpm audit`, so such a
case gets no `ignoreGhsas` entry.

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
