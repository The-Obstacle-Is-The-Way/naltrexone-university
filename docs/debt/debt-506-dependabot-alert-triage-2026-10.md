# DEBT-506: Dependabot Alerts of 2026-10-06 — Two Fixed, Four Gated, Two Without Published Fixes

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — the peer and sharp fixes shipped (#1411); source-map-js 1.2.2 and the supported Clerk UI 1.38.0 are eligible since 2026-10-07
**Priority:** P2
**Date:** 2026-10-06
**Resolved:** —
**Verification receipts:** —

---

## Summary

On 2026-10-06 the default branch had eight open Dependabot alerts. None is reachable by attacker input in this application. Two are fixed by the PR this record ships with:

- **#82 (critical, shell-quote)** by no longer installing `react-native`, the only path to it;
- **#83 (high, sharp)** by moving the existing override to 0.35.5.

Four alerts have published fixes blocked by the release gate: **#80** through source-map-js 1.2.2, and **#55/#78/#79** through Clerk UI 1.38.0 removing the Solana adapter tree. **#77** and **#81** have no published fixed release. All six alerts stay open as watchers until their fixes are promoted.

## Evidence

| Alert | Package (installed) | Advisory | Fixed release | Chain | Disposition |
|-------|---------------------|----------|---------------|-------|-------------|
| #82 critical | `shell-quote` 1.10.0 | GHSA-pqg4-j6r4-53mv: `quote()` command injection through a line terminator after a `{ comment }` token | 1.11.0 | `react-devtools-core` ← `react-native` 0.84.1, an auto-installed peer (below) | Removed from the graph |
| #83 high | `sharp` 0.35.4 | GHSA-wq5f-xc86-pv6w: bundled librsvg memory flaw (CVE-2026-96889) in SVG decoding, possible RCE on glibc Linux | 0.35.5 | `next`; already pinned by an exact override | Override 0.35.4 → 0.35.5 |
| #80 high | `source-map-js` 1.2.1 | GHSA-68fv-2mgg-jv7q: unvalidated indexed-map section offsets block the event loop | 1.2.2, published 2026-09-30T14:08:09Z | `postcss` and `@tailwindcss/node` (build); `css-tree` through jsdom and `magicast` through coverage (dev) | Override once the gate clears |
| #81 moderate | `sprintf-js` 1.0.3 | GHSA-hp3w-g68c-fv3c: unbounded precision specifiers throw `RangeError` | None; 1.1.3, the latest, is affected | `argparse` 1.0.10 ← `js-yaml` 3.15.2 ← `gray-matter` (direct) | Accepted risk; alert stays open |
| #77 high | `braces` 3.0.3 | GHSA-vfj7-8cjw-p6xm | None | `micromatch` ← `fast-glob` (direct) | [DEBT-495](../_archive/debt/debt-495-braces-dos-advisory-without-fixed-release.md) unchanged; its React Native chain is gone |
| #55, #78, #79 moderate | `stream-json` 1.9.1 | GHSA-528h-pc64-c93x; GHSA-mjw6-4jj6-33hc (Assembler prototype pollution); GHSA-hqr4-qq8f-hg3x (JSONC comment re-scan) | 3.5.0 and 3.6.0 are incompatible pins; Clerk UI 1.38.0 instead removes the parent chain | `jayson` 4.3.0 ← `@solana/web3.js` ← Clerk's installed Solana adapters | Take the supported Clerk upgrade after its gate clears at 2026-10-07T21:37:27.585Z; the current graph remains unreachable under [DEBT-476 §F](../_archive/debt/debt-476-dependabot-alert-triage-2026-09.md#f-stream-json--no-closable-pin-unreachable-upstream-blocked) |

### The React Native peer (#82)

- **Declared, not used.** Three packages under `@clerk/ui`'s Solana wallet adapters declare `react-native` as a required peer: `@react-native-async-storage/async-storage`, `@solana-mobile/mobile-wallet-adapter-protocol` and `@solana-mobile/wallet-adapter-mobile`.
- **Only React Native entry points import it.** For the Solana packages that is `lib/cjs/index.native.js`, selected only by the `react-native` export condition. For async-storage it is the native module files under `AsyncStorage.native.js`. The browser and node entries that Next.js resolves never import it, and async-storage's web `AsyncStorage.js` imports only `merge-options`.
- **pnpm installed it anyway.** pnpm installs a missing required peer by itself. That put `react-native` and its Metro, Jest and Babel tooling into the graph: 171 packages (177 lockfile entries), `shell-quote` among them. The earlier `image-size` alerts (#48, #49), `js-yaml`'s second chain and `braces`' second chain came from the same tree.
- **The deployed app never loads the native adapters.** The application imports only `@clerk/ui/themes` (`components/providers.tsx`); Clerk loads its sign-in UI separately. Independent builds of the base commit and this branch have identical package-name sets across all deployment traces and the server bundle source maps. Neither includes React Native or Solana wallet-adapter modules. Text searches do find Solana identifiers in Clerk authentication wrappers and Sentry error filters, plus a React Native package name in Next's generated configuration; those strings are not imports of the removed peer. The [PR](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1411) records the comparison scope and results.

### The rest

- **source-map-js (#80).** No attacker-supplied source map is parsed. PostCSS and Tailwind read repository CSS at build time; css-tree and magicast run only in tests. The playbook's maturity exception is for urgent fixes, and this one is neither reachable nor more than a day from the gate.
- **sprintf-js (#81).** `js-yaml` loads `argparse` only in its command-line tool (`bin/js-yaml.js`); `gray-matter` calls the library. `argparse` can format caller-supplied help templates, but this application never invokes that CLI; its templates are fixed by `js-yaml`.
- **stream-json (#78, #79).** #78's Assembler is reached only through `jayson/lib/utils.js`, which no import path loads (§F). #79's JSONC parser and verifier (`stream-json/jsonc/`) do not exist in 1.9.1; the advisory's `<=3.5.0` range is wider than the code it describes. The installed versions cannot accept the fixed stream-json major, but a supported replacement is already published: [Clerk UI 1.38.0](https://github.com/clerk/javascript/releases/tag/%40clerk%2Fui%401.38.0) drops the three Solana adapter dependencies in favor of Wallet Standard. Its [upstream change](https://github.com/clerk/javascript/pull/9994) retains wallets that support Solana sign-in and removes an Android Mobile Wallet Adapter choice that could not complete that flow. npm dates publication to 2026-09-30T21:37:27.585Z, so the 7-day gate clears at 2026-10-07T21:37:27.585Z. This is a normal Clerk upgrade within the declared `^1.13.1` range, not a forced jayson major.

*Corrected 2026-10-06: the build evidence distinguishes absent native/adapter modules from harmless identifier strings; the earlier zero-mentions claim was false. The sprintf-js rationale relies on the unreachable CLI, not a restriction on argparse's formatting API; a published but age-gated Clerk upgrade also supersedes the earlier no-supported-fix disposition for stream-json.*

## Impact

Low. No alert is reachable by attacker input here. The cost of leaving them is alert noise that hides a real one, and 171 unused packages that keep producing alerts.

## Options

1. **Override `shell-quote: 1.11.0`.** Rejected. It keeps the unused React Native tree and adds another exact pin, which caps the package until the next alert.
2. **Mark the `react-native` peer optional through `packageExtensions`.** Chosen. Every Clerk and Solana package stays installed and unchanged; pnpm only stops installing a peer nothing here loads. A guard test fails if it returns.
3. **Set `autoInstallPeers: false`.** Rejected: it changes peer installation for every package to fix three.
4. **Stub or remove Clerk's Solana adapters, or override `jayson` to 5.** Rejected, as DEBT-476 ruled: a stub breaks Web3 sign-in if it is ever enabled, and a forced vendor major is unsupported.
5. **A `minimumReleaseAgeExclude` for `source-map-js@1.2.2`.** Rejected: the exception is for urgent, reachable fixes.

## Resolution (decided)

- **This PR.**
  - `packageExtensions` mark the `react-native` peer optional for the three packages;
  - `tests/dependency-graph-policy.test.ts` fails if `react-native` is installed again;
  - the `sharp` override moves to 0.35.5.
- **Owner ruling, 2026-10-06.** DEBT-476 deferred any trimming of the unused Solana tree until upstream supports it and the owner prioritizes it. After the build comparison, the owner approved this narrower step: it removes only the React Native peer and leaves the adapter tree in place.
- **After 2026-10-07T14:08:09.382Z.** Add the exact override `source-map-js: 1.2.2` in its own PR, with a cold frozen install and the full gate. Every consumer declares `^1.x`, so it stays in range.
- **After 2026-10-07T21:37:27.585Z.** Take Clerk UI 1.38.0 or a later eligible supported release in a separate dependency PR. Re-resolve under the unchanged age/trust policies, verify the Solana/jayson/stream-json tree is gone, and remove the three React Native peer extensions when their declaring packages disappear. Keep the graph guard and run the full gate, including authenticated sign-in/E2E. The upstream-supported removal trigger in DEBT-476 has arrived; waiting is now for maturity and repository validation.
- **No dismissals.** #77, #81, #55, #78 and #79 stay open. A dismissed alert stops tracking its fix, and an open one makes Dependabot raise the fix PR (the DEBT-495 correction of 2026-10-04).

## Verification

- [x] The guard test fails on the base lockfile and passes on the branch.
- [x] A cold `pnpm install --frozen-lockfile` passes the release-age and trust policies.
- [x] The base and branch builds have identical traced-package and server source-map package sets, with no React Native or Solana wallet-adapter modules; identifier-only text matches are accounted for above.
- [x] After promotion, alerts #82 and #83 read `fixed`, and Dependabot's #1404 is closed (2026-10-08: both alerts `fixed`; Dependabot closed #1404 on 2026-10-07, as it no longer matched its group).
- [ ] The `source-map-js` 1.2.2 override is promoted and alert #80 reads `fixed`.
- [ ] The eligible supported Clerk upgrade passes the full gate, removes the Solana/jayson/stream-json tree and obsolete peer extensions, and promotion makes #55/#78/#79 read `fixed`.

## Related

- [DEBT-476](../_archive/debt/debt-476-dependabot-alert-triage-2026-09.md): `stream-json` and the Solana tree.
- [DEBT-495](../_archive/debt/debt-495-braces-dos-advisory-without-fixed-release.md): `braces`.
- [Supply-chain overrides playbook](../dev/supply-chain-overrides.md#required-peers-a-web-build-never-imports).
