# DEBT-408: `@clerk/ui` Drags In the Solana + React-Native Subtree (`ws@7.5.11` / `utf-8-validate` Peer Mismatch)

**Priority:** P3 (install hygiene + supply-chain surface; see [Severity & Priority](#severity--priority) for the P2 argument)
**Created:** 2026-06-05
**Source:** A pnpm peer-dependency report flags a pre-existing `ws@7.5.11` ↔ `utf-8-validate@6.0.6` mismatch on `origin/dev` (it was already present before PR #403 / DEBT-407 and was *not* introduced by it). Investigation traced the warning to `@clerk/ui`, a direct dependency used only for two Clerk appearance-theme objects, which transitively pulls the entire Solana wallet-adapter + React Native stack.
**Related:** [Debt Index](./index.md), DEBT-393 (Dependabot triage / config hardening), DEBT-394 (`minimumReleaseAge` supply-chain maturity gate), DEBT-407 (the Vite 8 upgrade whose peer-check surfaced this), [`.claude/rules/frontend.md`](../../.claude/rules/frontend.md)
**Status:** Active — investigation complete, remediation proposed (not yet implemented). Docs-before-code: this is the spec; no dependency change has been made.

---

## Problem

A medical-education Next.js web app is installing the **entire Solana crypto wallet-adapter stack, React Native 0.84.1, the Metro bundler, React DevTools, and their native build addons** — purely so that one file can import two Clerk appearance-theme objects (`dark`, `shadcn`).

The visible symptom is a benign-but-noisy peer-dependency warning: `ws@7.5.11` (buried deep in that React Native subtree) declares an *optional* peer `utf-8-validate@^5.0.2`, but the hoisted tree resolves `utf-8-validate@6.0.6`, which does not satisfy `^5.0.2`. The warning is cosmetic (the native addon is intentionally not built — see [Runtime Safety](#runtime-safety-why-the-warning-is-benign)), but it is a *signal* of a much larger latent issue: a crypto/mobile dependency tree that has no business being in this app's `node_modules` and that expands our install size and supply-chain surface for zero runtime benefit.

## Evidence

All citations verified mechanically on branch `dev` at HEAD `72380092` (`pnpm@11.3.0`, local `node v22.22.1`).

**1. The single, sole consumer of `@clerk/ui`:**

`components/providers.tsx:3`
```ts
import { dark, shadcn } from '@clerk/ui/themes';
```
Used only as Clerk `baseTheme` values:
- `components/providers.tsx:16` — `CLERK_APPEARANCE_DARK = { baseTheme: dark, ... }`
- `components/providers.tsx:27` — `CLERK_APPEARANCE_LIGHT = { baseTheme: shadcn, ... }`

A repo-wide grep finds **no other `@clerk/ui` import** (no other subpath, no CSS asset):
- `grep -rn "@clerk/ui"` across `app/ components/ src/ lib/ styles/` → only `components/providers.tsx:3`.
- No `@clerk/ui/themes/shadcn.css` (or any `@clerk/ui/*.css`) import anywhere; no Clerk reference in `app/globals.css`.

**2. `@clerk/ui` is a direct dependency declaring Solana as a *regular* dependency:**

`package.json:45` → `"@clerk/ui": "^1.13.1"` (resolves to `1.14.0`).

`@clerk/ui@1.14.0` regular dependencies (from the npm registry manifest) include:
```
@solana/wallet-adapter-react  0.15.39
@solana/wallet-adapter-base   0.9.27
@solana/wallet-standard       1.1.4
```
These are *regular* dependencies (Clerk ships Web3 / crypto-wallet sign-in support inside its UI components), so pnpm installs them regardless of which `@clerk/ui` subpath we import. Importing only `@clerk/ui/themes` cannot tree-shake them out at install time.

**3. The full chain to the mismatch (verified via `pnpm why react-native` and `pnpm why ws`):**

```
root project (dependencies)
└─ @clerk/ui@1.14.0
   └─ @solana/wallet-adapter-react@0.15.39
      └─ @solana-mobile/wallet-adapter-mobile@2.2.8
         └─ @react-native-async-storage/async-storage@1.24.0
            └─ react-native@0.84.1
               ├─ @react-native/community-cli-plugin → @react-native/dev-middleware → ws@7.5.11
               ├─ metro@0.83.7        → ws@7.5.11
               └─ react-devtools-core → ws@7.5.11
```
(`@solana/web3.js@1.98.4` and `jayson@4.3.0` / `isomorphic-ws@4.0.1` are also in this subtree and also consume `ws@7.5.11`.)

**4. The peer ranges that produce the warning (`pnpm-lock.yaml`):**

`ws@7.5.11` (`pnpm-lock.yaml:5639-5650`):
```yaml
peerDependencies:
  bufferutil: ^4.0.1
  utf-8-validate: ^5.0.2        # tree has 6.0.6 → MISMATCH (this is the warning)
peerDependenciesMeta:
  bufferutil:     { optional: true }
  utf-8-validate: { optional: true }   # ← optional, so it is only a warning
```
`ws@8.21.0` (`pnpm-lock.yaml:5652-5662`) — the *other* `ws` copy, used by `@vitest/browser` only:
```yaml
peerDependencies:
  utf-8-validate: '>=5.0.2'     # 6.0.6 SATISFIES this → no warning for ws@8
```
So only `ws@7.x`'s narrower `^5.0.2` is violated; `ws@8.x` is fine.

## Blast Radius

- **Runtime (app):** none. The `ws@7.5.11` consumers are React-Native / Metro / DevTools tooling that this web app never executes. We import only static theme objects.
- **Runtime (tests):** none. The only `ws` we actually run is `ws@8.21.0` via `@vitest/browser`, whose peer range is satisfied.
- **Install footprint:** large. `react-native@0.84.1`, `@solana/web3.js`, `metro@0.83.7`, `react-devtools-core`, plus native addons (`bufferutil`, `utf-8-validate`) are installed for no app use.
- **Supply-chain surface:** every one of those transitive packages is a provenance/audit target under this repo's hardened `pnpm-workspace.yaml` policy (`minimumReleaseAge: 10080`, `minimumReleaseAgeStrict`, `blockExoticSubdeps`, `trustPolicy: no-downgrade`). Pulling the entire Solana crypto stack into a billing-adjacent medical app is exactly the kind of surface that policy exists to minimize.

## Runtime Safety (why the warning is benign)

The mismatch is cosmetic, not a defect:

1. `utf-8-validate` and `bufferutil` are **optional** peers of `ws` (`peerDependenciesMeta.*.optional: true`, `pnpm-lock.yaml:5645-5650`). A non-matching optional peer is a warning, never an install failure.
2. `pnpm-workspace.yaml` `allowBuilds` **intentionally disables building both native addons**, with comments stating `ws` falls back to pure JS:
   ```yaml
   bufferutil: false      # optional ws peer/native performance addon built by node-gyp-build; ws can fall back.
   utf-8-validate: false  # optional ws peer/legacy UTF-8 native addon built by node-gyp-build; Node 24/ws can fall back.
   ```
   So `ws` never loads `utf-8-validate@6.0.6` at all — the version that "mismatches" is never executed.
3. The `ws@7` consumers are never run by the app or the test suites.

Net: nothing is broken today. This is **install hygiene and supply-chain surface**, not a correctness or security bug. It is documented here so the warning is *known and explained* rather than rediscovered every install, and so the bloat is tracked for paydown.

## Remediation Options

### Option A — Replace `@clerk/ui/themes` with `@clerk/themes`, drop `@clerk/ui` (root-cause fix) — **recommended, pending spike**

`@clerk/themes@2.4.57` (latest) is the dedicated, lightweight Clerk appearance-themes package and exports the exact two themes we use:

- Verified from the package's own type declarations (`@clerk/themes@2.4.57/dist/index.d.ts`):
  ```ts
  export { dark } from './themes/dark.js';
  export { shadcn } from './themes/shadcn.js';
  ```
- Its declared dependencies are **Solana/React-Native-free**: `{ tslib: 2.8.1, "@clerk/shared": "^3.47.2" }`.

The change is one import line plus one `package.json` removal:
```diff
- import { dark, shadcn } from '@clerk/ui/themes';
+ import { dark, shadcn } from '@clerk/themes';
```
```diff
- "@clerk/ui": "^1.13.1",
+ "@clerk/themes": "^2.4.57",
```
This deletes the entire `@clerk/ui → @solana/* → react-native → ws@7.5.11` subtree from the lockfile, eliminating both the bloat **and** the peer warning at the root.

**Open verification items (resolve in the implementation spike — do not assume):**
- **`@clerk/shared` major coexistence.** `@clerk/themes@2.4.57` pins `@clerk/shared@^3.47.2`, while `@clerk/nextjs@^7.4.1` / `@clerk/ui@1.14.0` pin `@clerk/shared@^4.x`. Adding `@clerk/themes@2.x` may install a *second* `@clerk/shared@3.x` copy. For static `baseTheme` objects this is very likely harmless, but confirm no dual-instance breakage and check whether a newer `@clerk/themes` line aligned to `@clerk/shared@4` exists at implementation time.
- **Canonical-path direction.** Clerk's current docs reference `@clerk/ui/themes` as an import path for `dark`, which suggests `@clerk/ui/themes` may be Clerk's *newer* canonical location and `@clerk/themes` the older standalone one. Confirm the standalone `@clerk/themes` path is still supported with `@clerk/nextjs@7` and is not slated for removal before committing to it.
- **Visual parity.** Confirm the Clerk widgets render identically in both dark (`baseTheme: dark`) and light (`baseTheme: shadcn`) modes after the swap. The `appearance.variables` hex overrides in `providers.tsx` (the documented Clerk third-party API seam per `.claude/rules/frontend.md` §3) are unaffected.

### Option B — Keep `@clerk/ui`, silence the warning via pnpm config (cosmetic-only fallback)

If the Option A spike reveals a hard `@clerk/shared` incompatibility or that `@clerk/themes` is being deprecated, fall back to silencing the warning while accepting the bloat:

- Add a `pnpm.peerDependencyRules.allowedVersions` entry mapping `utf-8-validate` for `ws@7` to the installed `6.x`, **or** a `pnpm.overrides` pin. This quiets the report but does **not** remove the Solana/RN bloat (those are regular deps of `@clerk/ui` and stay installed).

Option B is strictly inferior on the real cost (bloat + supply-chain surface) and is only a fallback if A is blocked.

### Option C — Accept and document (no change)

Record the warning as known/benign and move on. Chosen only if both A and B are judged not worth the change cost. This doc itself already discharges the "known and explained" part.

## Recommendation

Pursue **Option A**. It is a ~2-line change that, if the spike clears the three verification items, removes hundreds of unused transitive packages (the whole Solana + React Native + Metro stack), shrinks the supply-chain surface in line with the repo's hardened install policy, and silences the peer warning at its root. Gate the merge on the spike confirming `@clerk/shared` coexistence and visual parity; fall back to Option B only if A is blocked upstream.

## Severity & Priority

Rated **P3**: nothing is broken at runtime, build, or test time today, so it is not P1/P2 by the "concrete user harm" bar. The legitimate, non-speculative costs are (a) install bloat and (b) expanded supply-chain/audit surface — both real and measurable, not "could theoretically be better."

A **P2 argument** exists and the owner may elect it: this repo has invested heavily in supply-chain hardening (the DEBT-393/394 `minimumReleaseAge` + trust-policy arc). Carrying the full Solana crypto-wallet + React Native stack — entirely unused — directly contradicts that posture, and pruning it is squarely in scope of that investment. If supply-chain surface is weighted as a first-class risk, P2 is defensible. Left at P3 pending owner call.

## Acceptance Criteria

Option A is done when:
- [ ] `components/providers.tsx` imports `dark` and `shadcn` from `@clerk/themes`; `@clerk/ui` is removed from `package.json`.
- [ ] `pnpm-lock.yaml` no longer contains `@clerk/ui`, `@solana/*`, `react-native`, `metro`, `react-devtools-core`, or `ws@7.5.11`. `ws@8.21.0` (vitest) remains and its peer range stays satisfied.
- [ ] No duplicate/conflicting `@clerk/shared` instance causes a type or runtime break (spike item 1 resolved).
- [ ] Clerk sign-in / user widgets render with correct dark and light themes (spike item 3 resolved) — visual verification per `docs/tooling/agent-browser.md` (auth required).
- [ ] Full gate green: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` (+ E2E if the authenticated billing env is available).
- [ ] `pnpm install --frozen-lockfile` is clean and the `ws@7.5.11` / `utf-8-validate` peer warning is gone.
- [ ] CodeRabbit review clean on the latest head before merge.

## Rollback

Single-commit revert. The change is confined to one import line, one `package.json` dependency swap, and the regenerated `pnpm-lock.yaml`. Reverting restores `@clerk/ui` and the prior (working, warning-emitting) tree. No data, schema, or runtime-config surface is touched.
