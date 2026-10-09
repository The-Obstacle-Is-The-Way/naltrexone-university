# DEBT-506: Dependabot Alerts of 2026-10-06 — Six Fixed, Two Without Published Fixes

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — after promotion, alerts #80, #55, #78 and #79 read `fixed`; due 2026-10-15
**Priority:** P2
**Date:** 2026-10-06
**Resolved:** —
**Verification receipts:** [#1411](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1411), promoted in #1419: alerts #82 and #83 `fixed` 2026-10-07

---

## Summary

On 2026-10-06 the default branch had eight open Dependabot alerts. None is reachable by attacker input in this application. Six are fixed:

- **#82 (critical, shell-quote)** by no longer installing `react-native`, the only path to it ([#1411](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1411));
- **#83 (high, sharp)** by moving the existing override to 0.35.5 (#1411);
- **#80 (high, source-map-js)** by an exact 1.2.2 override (the follow-up PR);
- **#55, #78 and #79 (moderate, stream-json)** by Clerk UI 1.38.1, which drops the Solana adapter tree that installed it (the follow-up PR).

**#77** and **#81** have no published fixed release and stay open as watchers. The follow-up PR also takes Next.js 16.3.8 for alerts #84–#95, which [DEBT-509](./debt-509-pending-nextjs-security-fixes-have-no-watcher.md) tracks.

## Evidence

| Alert | Package (installed) | Advisory | Fixed release | Chain | Disposition |
|-------|---------------------|----------|---------------|-------|-------------|
| #82 critical | `shell-quote` 1.10.0 | GHSA-pqg4-j6r4-53mv: `quote()` command injection through a line terminator after a `{ comment }` token | 1.11.0 | `react-devtools-core` ← `react-native` 0.84.1, an auto-installed peer (below) | Removed from the graph (#1411) |
| #83 high | `sharp` 0.35.4 | GHSA-wq5f-xc86-pv6w: bundled librsvg memory flaw (CVE-2026-96889) in SVG decoding, possible RCE on glibc Linux | 0.35.5 | `next`; already pinned by an exact override | Override 0.35.4 → 0.35.5 (#1411) |
| #80 high | `source-map-js` 1.2.1 | GHSA-68fv-2mgg-jv7q: unvalidated indexed-map section offsets block the event loop | 1.2.2, published 2026-09-30T14:08:09Z | `postcss` and `@tailwindcss/node` (build); `css-tree` through jsdom and `magicast` through coverage (dev) | Exact override 1.2.2 (follow-up PR) |
| #81 moderate | `sprintf-js` 1.0.3 | GHSA-hp3w-g68c-fv3c: unbounded precision specifiers throw `RangeError` | None; 1.1.3, the latest, is affected | `argparse` 1.0.10 ← `js-yaml` 3.15.2 ← `gray-matter` (direct) | Accepted risk; alert stays open |
| #77 high | `braces` 3.0.3 | GHSA-vfj7-8cjw-p6xm | None | `micromatch` ← `fast-glob` (direct) | [DEBT-495](../_archive/debt/debt-495-braces-dos-advisory-without-fixed-release.md) unchanged; its React Native chain is gone |
| #55, #78, #79 moderate | `stream-json` 1.9.1 | GHSA-528h-pc64-c93x; GHSA-mjw6-4jj6-33hc (Assembler prototype pollution); GHSA-hqr4-qq8f-hg3x (JSONC comment re-scan) | 3.5.0 and 3.6.0 are incompatible pins; Clerk UI 1.38.0 instead removes the parent chain | `jayson` 4.3.0 ← `@solana/web3.js` ← Clerk UI's Solana adapters | Removed from the graph by Clerk UI 1.38.1 (follow-up PR) |

### The React Native peer (#82)

- **Declared, not used.** Before Clerk UI 1.38, three packages under its Solana wallet adapters declared `react-native` as a required peer: `@react-native-async-storage/async-storage`, `@solana-mobile/mobile-wallet-adapter-protocol` and `@solana-mobile/wallet-adapter-mobile`.
- **Only React Native entry points imported it.** For the Solana packages that was `lib/cjs/index.native.js`, selected only by the `react-native` export condition. For async-storage it was the files `AsyncStorage.native.js` imports: `RCTAsyncStorage.js` and its native-module helpers. The browser and node entries that Next.js resolves never import it, and async-storage's web `AsyncStorage.js` imports only `merge-options`.
- **pnpm installed it anyway.** pnpm installs a missing required peer by itself. That put `react-native` and its Metro, Jest and Babel tooling into the graph: 171 packages (177 lockfile entries), `shell-quote` among them. The earlier `image-size` alerts (#48, #49), `js-yaml`'s second chain and `braces`' second chain came from the same tree.
- **The deployed app never loaded the native adapters.** The application imports only `@clerk/ui/themes` (`components/providers.tsx`); Clerk loads its sign-in UI separately. Independent builds of the base commit and #1411 had identical package-name sets across all deployment traces and the server bundle source maps. Neither included React Native or Solana wallet-adapter modules. Text searches did find Solana identifiers in Clerk authentication wrappers and Sentry error filters, plus a React Native package name in Next's generated configuration; those strings are not imports of the removed peer. [#1411](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1411) records the comparison scope and results.
- **Gone with the adapters.** Clerk UI 1.38 dropped all three packages, so the follow-up PR removed their `packageExtensions`. `tests/dependency-graph-policy.test.ts` still fails if `react-native` is installed again.

### The rest

- **source-map-js (#80).** No attacker-supplied source map is parsed. PostCSS and Tailwind read repository CSS at build time; css-tree and magicast run only in tests. Every consumer declares `^1.x`, so the exact override stays in range. 1.2.2 had cleared the release-age gate, so no exception was needed.
- **sprintf-js (#81).** `js-yaml` loads `argparse` only in its command-line tool (`bin/js-yaml.js`); `gray-matter` calls the library. `argparse` can format caller-supplied help templates, but this application never invokes that CLI; its templates are fixed by `js-yaml`.
- **stream-json (#55, #78, #79).** #78's Assembler was reached only through `jayson/lib/utils.js`, which no import path loads (§F). #79's JSONC parser and verifier (`stream-json/jsonc/`) do not exist in 1.9.1; the advisory's `<=3.5.0` range is wider than the code it describes. The installed versions could not accept the fixed stream-json major, but [Clerk UI 1.38.0](https://github.com/clerk/javascript/releases/tag/%40clerk%2Fui%401.38.0) dropped the three Solana adapter dependencies in favor of Wallet Standard. Its [upstream change](https://github.com/clerk/javascript/pull/9994) retains wallets that support Solana sign-in and removes an Android Mobile Wallet Adapter choice that could not complete that flow. The follow-up PR takes 1.38.1 with the matching `@clerk/nextjs` 7.9.10 and `@clerk/testing` 2.2.42, so one `@clerk/shared` (4.38.0) serves them all. The lockfile loses 164 entries, `jayson`, `stream-json` and the whole `@solana/*` tree among them. The 19 it gains are other versions of packages it already had; `@wallet-standard/core` moves from 1.1.2 to the 1.1.1 that Clerk UI pins exactly.
- **Configuration the upgrade left unused.** With the Solana tree gone, nothing installs `uuid`, `bufferutil`, `utf-8-validate` or any `brace-expansion` 1.x, so the follow-up PR removes the `uuid` and `brace-expansion@1` overrides and the two `allowBuilds` entries. A regenerated lockfile with and without them installs the same packages.

*Corrected 2026-10-06: the build evidence distinguishes absent native/adapter modules from harmless identifier strings; the earlier zero-mentions claim was false. The sprintf-js rationale relies on the unreachable CLI, not a restriction on argparse's formatting API; a published but age-gated Clerk upgrade also supersedes the earlier no-supported-fix disposition for stream-json.*

## Impact

Low. No alert is reachable by attacker input here. The cost of leaving them is alert noise that hides a real one, and unused packages that keep producing alerts.

## Options

1. **Override `shell-quote: 1.11.0`.** Rejected. It keeps the unused React Native tree and adds another exact pin, which caps the package until the next alert.
2. **Mark the `react-native` peer optional through `packageExtensions`.** Chosen for #1411. Every Clerk and Solana package stayed installed and unchanged; pnpm only stopped installing a peer nothing here loads. A guard test fails if it returns.
3. **Set `autoInstallPeers: false`.** Rejected: it changes peer installation for every package to fix three.
4. **Stub or remove Clerk's Solana adapters, or override `jayson` to 5.** Rejected, as DEBT-476 ruled: a stub breaks Web3 sign-in if it is ever enabled, and a forced vendor major is unsupported. Clerk UI 1.38's supported removal replaced this.
5. **A `minimumReleaseAgeExclude` for `source-map-js@1.2.2`.** Rejected: the exception is for urgent, reachable fixes.

## Resolution (decided)

- **#1411.**
  - `packageExtensions` marked the `react-native` peer optional for the three packages;
  - `tests/dependency-graph-policy.test.ts` fails if `react-native` is installed again;
  - the `sharp` override moved to 0.35.5.
- **Owner ruling, 2026-10-06.** DEBT-476 deferred any trimming of the unused Solana tree until upstream supports it and the owner prioritizes it. After the build comparison, the owner approved the narrower #1411 step, which removed only the React Native peer and left the adapter tree in place.
- **The follow-up PR, after both release gates cleared.**
  - The exact override `source-map-js: 1.2.2`.
  - Clerk UI 1.38.1 with `@clerk/nextjs` 7.9.10 and `@clerk/testing` 2.2.42, the release set Clerk published together on 2026-10-01; `package.json` raises each floor to it. Their changelogs in that range have no major change, and the patch fixes include a cross-request credential leak in `clerkMiddleware` that only dynamic keys reach; this app's keys are static.
  - The three peer extensions and the configuration listed above are removed; the graph guard stays.
  - Next.js 16.3.8, for DEBT-509's alerts.
  - A cold `pnpm install --frozen-lockfile` and the full gate, including authenticated sign-in E2E.
- **No dismissals.** #77 and #81 stay open. A dismissed alert stops tracking its fix, and an open one makes Dependabot raise the fix PR (the DEBT-495 correction of 2026-10-04).

*Corrected 2026-10-08: the source-map-js override and the Clerk upgrade ship in one PR with Next.js 16.3.8, not in two separate PRs as first planned. All three are dependency changes behind the same gate, and the repository's one CodeRabbit review an hour, shared E2E accounts and promotions are the bottleneck; each change is its own commit, so any one can be reverted alone.*

## Verification

- [x] The guard test fails on the base lockfile and passes on the branch.
- [x] A cold `pnpm install --frozen-lockfile` passes the release-age and trust policies.
- [x] The base and branch builds have identical traced-package and server source-map package sets, with no React Native or Solana wallet-adapter modules; identifier-only text matches are accounted for above.
- [x] After promotion, alerts #82 and #83 read `fixed` (2026-10-07), and Dependabot closed #1404.
- [x] The follow-up PR, [#1438](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1438), passes a cold frozen install and the full gate, and removes the Solana/jayson/stream-json tree and the obsolete configuration.
- [ ] After its promotion, alerts #80, #55, #78 and #79 read `fixed`.

## Related

- [DEBT-476](../_archive/debt/debt-476-dependabot-alert-triage-2026-09.md): `stream-json` and the Solana tree.
- [DEBT-495](../_archive/debt/debt-495-braces-dos-advisory-without-fixed-release.md): `braces`.
- [DEBT-509](./debt-509-pending-nextjs-security-fixes-have-no-watcher.md): the Next.js advisories behind alerts #84–#95.
- [Supply-chain overrides playbook](../dev/supply-chain-overrides.md#required-peers-a-web-build-never-imports).
