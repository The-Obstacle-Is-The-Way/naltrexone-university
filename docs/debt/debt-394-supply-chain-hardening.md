# DEBT-394: Supply-Chain Hardening (pnpm 11 + minimumReleaseAge + strictDepBuilds + blockExoticSubdeps + trustPolicy)

**Priority:** P2 (active supply-chain attack campaigns are publishing credential-stealing packages to npm with median detection time of ~5 minutes per Socket; this repo handles Stripe live keys, Clerk admin keys, and a Neon production database URL, all of which are present in `process.env` whenever `pnpm install` runs locally, on CI, or during a Vercel build; the protection we want most — `minimumReleaseAge` — exists only in pnpm 11.)
**Created:** 2026-05-25
**Source:** Follow-up to [DEBT-392](../_archive/debt/debt-392-dependency-hygiene-audit.md) (Dependabot is now live but does not vouch for package contents) and [DEBT-393](./debt-393-dependabot-triage-and-config-hardening.md) (config-level Dependabot tightening, but not malicious-publish defense). The proximate trigger is Socket's TrapDoor disclosure (2026-05-23) reporting 34 malicious packages / 384 versions across npm, PyPI, and crates.io with median detection time 5m27s and fastest detection 58s. Verified externally: [The Hacker News on TrapDoor](https://thehackernews.com/2026/05/trapdoor-supply-chain-attack-spreads.html), [Socket on pnpm 11 supply-chain defaults](https://socket.dev/blog/pnpm-11-adds-new-supply-chain-protection-defaults).
**Related:** [DEBT-393](./debt-393-dependabot-triage-and-config-hardening.md) (Dependabot triage and config; this doc retunes `cooldown` to match `minimumReleaseAge`), [DEBT-392 (archived)](../_archive/debt/debt-392-dependency-hygiene-audit.md), [DEBT-332](./debt-332-security-posture-audit.md) (security posture; supply-chain is the missing chapter)

**Status:** Active

---

## Problem

The repo currently runs `pnpm@10.33.4` (pinned via `package.json` `packageManager`, set in DEBT-392 Tier 5 alignment). pnpm 10 provides `--frozen-lockfile`, store integrity verification, and the `onlyBuiltDependencies` allowlist for install scripts — useful, but missing the highest-leverage 2026 defenses, all of which were introduced in pnpm 11 (released 2026-04-28, current `11.0.x` series).

The threat is concrete, not hypothetical. Recent / ongoing campaigns:

- **TrapDoor (2026-05-23 disclosure)** — 34 malicious packages, 384 versions across npm/PyPI/crates.io, targeting wallets, SSH keys, cloud credentials, GitHub tokens, browser data, env vars, API keys. Median Socket detection 5m27s; fastest 58s.
- **Polyfill.io (2024)** — generic web infrastructure compromise, ~100k+ sites affected.
- **Lottiefiles npm compromise (2024)** — browser animation library, payload exfiltrated wallets and API keys.
- **node-ipc wiper (2022)** — general-purpose dev tooling, geopolitically scoped destructive payload.
- **XZ utils backdoor (2024)** — long-tail patient infiltration of general infrastructure, caught by chance.

Common shape: the attack vector is `pnpm install` (or `npm install`, or `cargo install`, depending on ecosystem). A malicious `postinstall` script executes the moment the tainted dep is fetched, with whatever privileges the install process has. What lives on this repo's install hosts and is therefore exposable today:

| Install host | Secrets in `process.env` / disk |
|---|---|
| Local dev machine | `STRIPE_SECRET_KEY`, `CLERK_SECRET_KEY`, Neon `DATABASE_URL` (full credentials), `STRIPE_WEBHOOK_SECRET`, E2E creds, all in `.env.local` (verified present per CLAUDE.md "Full Quality Gate" section). |
| GitHub Actions runner | All repo secrets referenced in `.github/workflows/ci.yml:50-69` (Clerk dev keys, Stripe test keys, E2E creds, Codecov token if present, plus the runner's `GITHUB_TOKEN`). |
| Vercel build environment | Production-equivalent secrets at deploy time; install runs as part of the build, so a `postinstall` payload can also plant code into the deployed bundle that gets served to real users. |

The TrapDoor reporting framed targets as crypto/DeFi/AI; that is THIS quarter's campaign. The mechanism is generic. Any package this tree depends on, including transitives, can deliver a payload to any of the three install hosts above. This repo is not a special target; it is a normal target, and "normal target" is precisely the population these campaigns hit.

What pnpm 11 adds that pnpm 10 does not have:

| Setting | Available pnpm 10? | Available pnpm 11+? | Defense it provides |
|---|---|---|---|
| `onlyBuiltDependencies` (install-script allowlist, legacy spelling) | ✓ | ✓ (renamed `allowBuilds` + `strictDepBuilds: true`) | Blocks postinstall execution for non-allowlisted packages. |
| `--frozen-lockfile` | ✓ (we use it on CI) | ✓ | Prevents drift between dev/CI installs. |
| Store integrity verification | ✓ | ✓ | Tampered store entries fail integrity check. |
| `minimumReleaseAge` | ✗ | ✓ | **Refuses to install packages newer than N minutes — defeats TrapDoor-class attacks since malicious versions are usually yanked within hours.** |
| `minimumReleaseAgeStrict` | ✗ | ✓ | No bypass via override flags. |
| `minimumReleaseAgeIgnoreMissingTime` | ✗ | ✓ (set `false`) | If a package has no publish timestamp, BLOCK it (closes the obvious bypass). |
| `blockExoticSubdeps` | ✗ | ✓ | Blocks git URLs, tarballs, and local-path specs in subdependency closures. Attackers pivot through transitive deps this way. |
| `strictDepBuilds: true` | ✗ | ✓ | Replaces `onlyBuiltDependencies` with a default-deny model. New native-build packages fail loudly until explicitly allowlisted, instead of silently running their install scripts. |
| `trustPolicy: no-downgrade` | ✗ | ✓ | Refuses to install a version lower than what is in the lockfile. Defends against version-downgrade attacks where the attacker publishes a "version 99" decoy that gets yanked and a tampered "version 1" remains. |

The single highest-impact setting is `minimumReleaseAge`. Socket's TrapDoor data shows median malicious-package time-to-detection of 5m27s and the fastest detection at 58s. Setting `minimumReleaseAge: 10080` minutes (7 days) means a malicious version is almost always yanked before this repo would attempt to install it. There is no equivalent on pnpm 10.

---

## Findings

### A. pnpm 11 prerequisite

pnpm 11 requires `node >=22.13`. We are on Node 24 LTS (DEBT-392 Tier 5, PR #333), so the runtime gate is satisfied. The migration risk is in pnpm 11.0.x maturity: pnpm 11.0.0 shipped 2026-04-28 and the line is still in the `11.0.x` patch series at the time of writing. This is young software. Two reasonable readings:

1. **Conservative**: wait for `11.1.x` or `11.2.x` before adopting. The standard "skip the .0" hedge.
2. **Pragmatic**: the protections this doc cares about are pnpm 11 exclusive. Waiting on maturity is also waiting on protection during an active campaign.

This doc adopts the pragmatic reading but isolates the migration as its own PR (Tier 1) so the revert button is one commit, and the policy settings are layered on top in subsequent PRs that can also each be reverted independently.

Reference resolution between pnpm 11 setting names and the original Anders Marksen recommendation:

- `minimumReleaseAge` — pnpm 11 setting name (verified).
- `minimumReleaseAgeStrict`, `minimumReleaseAgeIgnoreMissingTime` — pnpm 11 settings (verified per Socket blog).
- `blockExoticSubdeps` — pnpm 11 setting (verified per Socket blog).
- `strictDepBuilds: true` + `allowBuilds: { <pkg>: true, ... }` — pnpm 11 supersedes the older `onlyBuiltDependencies` array.
- `trustPolicy: no-downgrade` — pnpm 11 setting (verified per Socket blog).

These belong in either `pnpm-workspace.yaml` (preferred for project-level pnpm config even in non-monorepo projects on pnpm 11) or `.npmrc`. We currently have neither file. Tier 3 creates `pnpm-workspace.yaml` with the policy block.

### B. Native-build allowlist requires per-package enumeration

`strictDepBuilds: true` flips the default from "any package can run install scripts" to "only allowlisted packages can." Flipping it without enumerating the allowlist will BREAK install because several of our direct + transitive deps legitimately need to compile or download native binaries.

Probable native-build packages in our tree (from direct deps list and known transitives):

- `@biomejs/biome` — Rust binary, native-build per `optionalDependencies`.
- `@playwright/test` — downloads browser binaries via postinstall.
- `next` — bundles `next-swc-*` native binaries; install script wires the platform binary.
- `esbuild` — install script downloads the platform binary.
- `@swc/core` — transitively pulled by `next`; downloads platform binary.
- `sharp` — transitively pulled by `next`/`next/image` and `@img/sharp-*`; native libvips.
- `@sentry/cli` — downloads platform CLI binary on install.
- `unrs-resolver` — Rust binary.
- `oxc-parser` — Rust binary (Oxc toolchain).
- `lefthook` — only if present (we use husky); skip if not in tree.

This list is the starting point. The Tier 2 PR enumerates exactly by running a clean install under pnpm 11 with `strictDepBuilds: true`, observing which packages pnpm flags for build approval (`pnpm approve-builds` surfaces them), and committing the resulting `allowBuilds` map. The list above is documentation, not the contract.

### C. Dependabot `cooldown` must match `minimumReleaseAge`

DEBT-393 Tier 2 sets `cooldown.default-days: 7` on the Dependabot side. DEBT-394 Tier 3 sets `minimumReleaseAge: 10080` (minutes = 7 days) on the pnpm side. The values must match or Dependabot opens PRs that fail install for the difference window.

If DEBT-393 ships first (recommended), the `cooldown` value already exists; DEBT-394 Tier 3 only needs to confirm it matches. If DEBT-394 ships first, Tier 3 needs to also touch `.github/dependabot.yml`.

### D. The 7-day delay genuinely slows zero-day security patches

A real cost: when a critical CVE drops in a dep we use, we cannot pull the fix until day 8 unless we override. pnpm 11 supports `--ignore-recent` for one-off overrides, so urgent patches can bypass after an explicit human decision. The cost is acceptable in exchange for closing the supply-chain window — most CVEs are not so urgent that 7 days of waiting causes harm, and the override exists for the cases where it would.

### E. Dependabot does not vouch for package contents

Worth stating explicitly because it is the most common misconception: Dependabot scans the registry for new versions and opens PRs. It does NOT verify that the new version is benign. Our defense against malicious publishes is `minimumReleaseAge` + `strictDepBuilds` + `blockExoticSubdeps`, all of which live in pnpm config, not Dependabot config. Dependabot is for freshness; pnpm is for safety. Both are needed.

---

## Remediation

Three single-concern PRs, each independently revertable, each gated by the full local quality gate (`pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`, plus `pnpm test:e2e` when the authenticated billing E2E env is available) and CodeRabbit.

### PR 1 — Migrate `pnpm@10.33.4` → `pnpm@11.x`

Bump only. No policy changes in this PR. Rationale: pnpm 11 is young; isolating the migration to its own commit means the revert is one button.

Edits:

- `package.json`: `packageManager: "pnpm@10.33.4"` → `packageManager: "pnpm@11.<latest>"` (resolve `<latest>` at the time of the PR via `npm view pnpm dist-tags.latest`).
- `package.json`: `engines.pnpm: ">=10.0.0"` → `engines.pnpm: ">=11.0.0"`.
- `.github/workflows/ci.yml`: keep `pnpm/action-setup@v6.0.8`; bump the `version: 10.9.0` input to match the new `packageManager` pin exactly (Corepack derives from `packageManager`, but pinning the action input explicitly is the DEBT-392 pattern).
- `pnpm-lock.yaml`: regenerated; commit the diff. Verify shape with `pnpm install --frozen-lockfile` after.

Verification:

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
pnpm audit --json | jq '.metadata.vulnerabilities'   # confirm unchanged from baseline
```

If 11.0.x reveals a regression (lockfile shape issue, plugin compatibility, Corepack mismatch), revert is `git revert <sha>`; pnpm 10.33.4 returns and policy work in PRs 2 and 3 stays out of the picture.

### PR 2 — Enumerate native-build allowlist and enable `strictDepBuilds`

This is the archaeology PR. Steps:

1. Create `pnpm-workspace.yaml` with:

   ```yaml
   strictDepBuilds: true
   allowBuilds: {}
   ```

2. Run `pnpm install --frozen-lockfile`. pnpm will fail the install with a list of packages that requested build approval. Capture that list.
3. Triage each: legitimate native-build dependency (`esbuild`, `sharp`, `@biomejs/biome`, etc.) → set to `true` in `allowBuilds`. Anything that does NOT need to compile or fetch a native binary → leave `false` and verify the package still works without its install script (most JS-only "postinstall" hooks do telemetry or links and are safe to disable).
4. Iterate until `pnpm install --frozen-lockfile` succeeds with the curated allowlist.
5. Run the full local gate end to end.
6. Document the rationale for each allowlisted package inline in `pnpm-workspace.yaml` as a comment, e.g. `# esbuild: native binary download required for vite/next dev`.

Acceptance: `pnpm install --frozen-lockfile` succeeds on a clean clone, full gate green, and `pnpm-workspace.yaml` has an explicit `allowBuilds` entry per native-build package with a one-line comment per entry.

Reversibility: revert deletes `pnpm-workspace.yaml`; pnpm reverts to legacy "all install scripts run" behavior.

### PR 3 — Layer on policy settings + retune Dependabot `cooldown`

Final PR. Edits:

1. Extend `pnpm-workspace.yaml`:

   ```yaml
   minimumReleaseAge: 10080            # 7 days, in minutes
   minimumReleaseAgeStrict: true
   minimumReleaseAgeIgnoreMissingTime: false
   blockExoticSubdeps: true
   strictDepBuilds: true                # carried from PR 2
   trustPolicy: no-downgrade
   allowBuilds:                          # carried from PR 2
     # ... (per-package entries)
   ```

2. Confirm `.github/dependabot.yml` `cooldown.default-days: 7` (added in DEBT-393 Tier 2). If absent (DEBT-393 has not landed yet), add it in this PR; if present, verify it matches.

3. Add a short `docs/dev/supply-chain-overrides.md` documenting:
   - The `--ignore-recent` escape hatch for urgent CVE patches that legitimately need to land before the 7-day window.
   - How to add a new native-build package to `allowBuilds` (re-run install, see the prompt, add the entry with a one-line rationale comment, re-verify gate).
   - The interaction between Dependabot `cooldown` and pnpm `minimumReleaseAge` (must match).
   - How to test a candidate dep before adding it to a Dependabot PR queue (run `pnpm add --save-dev <pkg>` in a scratch branch, observe whether `minimumReleaseAge` rejects it; if so, the dep is too fresh and we can wait).

Verification:

```sh
pnpm install --frozen-lockfile   # should succeed with curated allowlist
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build

# Sanity-check the policy actually applies:
pnpm add --save-dev <some-package-that-just-published>   # expect rejection
pnpm install --ignore-recent                              # expect success (proves the override works)
git checkout pnpm-lock.yaml package.json                  # roll back the experiment
```

Acceptance: full gate green, the `--ignore-recent` override works on an intentionally fresh package, Dependabot `cooldown.default-days: 7` matches pnpm `minimumReleaseAge: 10080`, and the overrides doc is committed.

Reversibility: revert removes only the policy block from `pnpm-workspace.yaml`; PR 2's `allowBuilds` stays, PR 1's pnpm 11 stays. Each PR's revert is independent.

---

## Verification commands

```sh
# Confirm pnpm 11 is in effect
grep -E '"packageManager"|"pnpm"' package.json
pnpm --version

# Confirm policy settings
yq '.minimumReleaseAge, .minimumReleaseAgeStrict, .blockExoticSubdeps, .trustPolicy, .strictDepBuilds' pnpm-workspace.yaml
yq '.allowBuilds | keys' pnpm-workspace.yaml

# Confirm Dependabot cooldown matches
yq '.updates[].cooldown' .github/dependabot.yml

# Sanity: a freshly published package should be refused
pnpm add --save-dev <pkg-published-today>   # expect ERR_PNPM_MIN_RELEASE_AGE or similar

# Audit: no degradation
pnpm audit --json | jq '.metadata.vulnerabilities'
```

---

## Acceptance criteria

- `packageManager` pinned to `pnpm@11.x` (exact version derived at PR-1 time).
- `engines.pnpm` is `">=11.0.0"`.
- CI `pnpm/action-setup` version input matches the `packageManager` pin.
- `pnpm-workspace.yaml` exists and contains all five hardening settings (`minimumReleaseAge: 10080`, `minimumReleaseAgeStrict: true`, `minimumReleaseAgeIgnoreMissingTime: false`, `blockExoticSubdeps: true`, `strictDepBuilds: true`, `trustPolicy: no-downgrade`) plus the curated `allowBuilds` map.
- Every entry in `allowBuilds` has a one-line rationale comment.
- `.github/dependabot.yml` `cooldown.default-days: 7` is present on the npm ecosystem block (and ideally the GitHub Actions block).
- `docs/dev/supply-chain-overrides.md` exists and documents the `--ignore-recent` escape, the `allowBuilds` addition flow, and the cooldown/`minimumReleaseAge` interaction.
- The full local quality gate is green on each of PR 1, PR 2, and PR 3.
- `pnpm audit` count is unchanged or improved from the post-DEBT-392 baseline (3 moderate / 0 high / 0 critical at the time of writing).
- An intentionally fresh package is rejected by `pnpm add` without `--ignore-recent` and accepted with it, confirming the policy is live.

---

## Risk and reversibility

- **PR 1 (pnpm 11 migration)** — moderate risk because pnpm 11.0.x is young. Mitigation: standalone commit, full gate, easy revert.
- **PR 2 (`allowBuilds` + `strictDepBuilds`)** — low-to-moderate risk. The failure mode is "install fails with a list of packages to allowlist," which is loud and tractable, not a silent regression. Reversion deletes `pnpm-workspace.yaml`.
- **PR 3 (policy settings)** — low risk. The settings are config-level; reversion is a doc + yaml edit.
- **The 7-day delay on urgent CVE patches** — real cost, documented escape hatch via `--ignore-recent`. Acceptance of this trade-off is the policy decision the doc encodes.
- **Dependabot interaction** — if `cooldown` and `minimumReleaseAge` get out of sync, Dependabot PRs fail install. Detection: red CI on a Dependabot PR with a "package too recent" error from pnpm. Mitigation: keep the two values explicitly matched in both this doc and DEBT-393.

---

## Done when

All three PRs are merged to `dev` and synced to `main`. The full local quality gate is green on the final state. A demonstrated `pnpm add <pkg-published-today>` rejection (without override) and acceptance (with `--ignore-recent`) is captured in the PR 3 description. The next Dependabot weekly run respects the 7-day cooldown. This doc is moved to `docs/_archive/debt/` with a resolution paragraph mirroring the DEBT-390 / DEBT-392 archival pattern, citing the three PRs.
