# DEBT-408: `@clerk/ui` Drags In the Solana + React-Native Subtree (`ws@7.5.11` / `utf-8-validate` Peer Mismatch)

**Priority:** P3 (install hygiene + supply-chain surface; see [Severity & Priority](#severity--priority) for the P2 argument)
**Created:** 2026-06-05
**Source:** A pnpm peer-dependency report flags a pre-existing `ws@7.5.11` ↔ `utf-8-validate@6.0.6` mismatch on `origin/dev` (it was already present before PR #403 / DEBT-407 and was *not* introduced by it). Investigation traced the warning to `@clerk/ui`, a direct dependency used only for two Clerk appearance-theme objects, which transitively pulls the entire Solana wallet-adapter + React Native stack.
**Related:** [Debt Index](./index.md), DEBT-393 (Dependabot triage / config hardening), DEBT-394 (`minimumReleaseAge` supply-chain maturity gate), DEBT-407 (the Vite 8 upgrade whose peer-check surfaced this), [`.claude/rules/frontend.md`](../../.claude/rules/frontend.md)
**Status:** Active — adversarial audit + reversible spike complete (2026-06-05). The simple `@clerk/ui/themes` -> `@clerk/themes` swap is mechanically green and visibly identical on the current sign-in/dashboard surfaces, but it is **not** a strict supported/object-identical Clerk-theme replacement: current Clerk Core 3 docs now document `@clerk/ui/themes`, the `@clerk/themes` prebuilt `dark`/`shadcn` objects differ from `@clerk/ui@1.14.0`, and `@clerk/themes` still carries `@clerk/shared@3.x` while `@clerk/nextjs@7` uses `@clerk/shared@4.x`. Docs-before-code: no dependency change has been committed.

---

## Problem

A medical-education Next.js web app is installing the **entire Solana crypto wallet-adapter stack, React Native 0.84.1, the Metro bundler, React DevTools, and their native build addons** — purely so that one file can import two Clerk appearance-theme objects (`dark`, `shadcn`).

The visible symptom is a benign-but-noisy peer-dependency warning: `ws@7.5.11` (buried deep in that React Native subtree) declares an *optional* peer `utf-8-validate@^5.0.2`, but the hoisted tree resolves `utf-8-validate@6.0.6`, which does not satisfy `^5.0.2`. The warning is cosmetic (the native addon is intentionally not built — see [Runtime Safety](#runtime-safety-why-the-warning-is-benign)), but it is a *signal* of a much larger latent issue: a crypto/mobile dependency tree that has no business being in this app's `node_modules` and that expands our install size and supply-chain surface for zero runtime benefit.

## Evidence

All repo citations re-verified mechanically on branch `chore/debt-408-clerk-ui-solana-subtree` at HEAD `d395b653` (`pnpm@11.3.0`; gates/spike under Node 24).

**1. The single, sole consumer of `@clerk/ui`:**

`components/providers.tsx:3`
```ts
import { dark, shadcn } from '@clerk/ui/themes';
```
Used only as Clerk `baseTheme` values:
- `components/providers.tsx:16` — `CLERK_APPEARANCE_DARK = { baseTheme: dark, ... }`
- `components/providers.tsx:27` — `CLERK_APPEARANCE_LIGHT = { baseTheme: shadcn, ... }`

A repo-wide source grep finds **no other `@clerk/ui` import** (no other subpath, no CSS asset):
- `rg -n "@clerk/ui" app components src lib` -> only `components/providers.tsx:3`.
- `rg -n "@clerk/(ui|themes).*\\.css|shadcn\\.css|@import.*clerk" app components src lib --glob "*.css" --glob "*.tsx" --glob "*.ts"` -> no hits.
- `find app components src lib -maxdepth 3 \( -name "*.css" -o -name "*.scss" \)` -> only `app/globals.css`.

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
`ws@8.21.0` (`pnpm-lock.yaml:5652-5662`) — the other `ws` copy:
```yaml
peerDependencies:
  utf-8-validate: '>=5.0.2'     # 6.0.6 SATISFIES this → no warning for ws@8
```
So only `ws@7.x`'s narrower `^5.0.2` is violated; `ws@8.x` is fine. Correction from the first draft: before pruning, `ws@8.21.0` is used by both `@vitest/browser` and `rpc-websockets@9.3.9` inside the Solana subtree. After the `@clerk/ui` spike removal, `pnpm why ws` shows one remaining `ws@8.21.0` owner: `@vitest/browser@4.1.7`.

**5. Current Clerk support/canonical-path evidence (resolved 2026-06-05):**

- Clerk's current Core 3 [Next.js themes docs](https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/themes) (last updated May 27, 2026) say to install `@clerk/ui` and import prebuilt themes from `@clerk/ui/themes`. They also recommend importing `@clerk/ui/themes/shadcn.css` for the shadcn theme so Tailwind can generate classes that only appear in external theme configuration.
- Clerk's older [shadcn compatibility changelog](https://clerk.com/changelog/2025-07-23-shadcn-theme) introduced the shadcn theme using `@clerk/themes` and `baseTheme: shadcn`, so `@clerk/themes` is not abandoned; it is still published.
- NPM/GitHub release metadata (`npm view @clerk/themes dist-tags versions --json`, `npm view @clerk/themes@latest dependencies --json`, and the [`clerk/javascript` releases](https://github.com/clerk/javascript/releases)) shows `@clerk/themes@2.4.62` exists under the `latest-v5` tag and still updates `@clerk/shared@3.47.7`. There is no current `@clerk/themes` line aligned to `@clerk/shared@4.x`; `@clerk/themes@latest` is `2.4.57` with `@clerk/shared@^3.47.2`.
- GitHub issue/PR search in `clerk/javascript` for `@clerk/ui` + Solana and for `@clerk/themes` + `@clerk/shared` found no upstream issue, install flag, or planned slim split that removes the Solana dependencies from `@clerk/ui`.

**6. Theme-object equivalence evidence (resolved 2026-06-05):**

The simple import swap is **not object-identical**:

- `@clerk/ui@1.14.0/dist/themes/dark.js` contains only the dark variables plus `activeDeviceIcon`; `@clerk/themes@2.4.57/2.4.62` adds provider icon inversion rules for Apple/GitHub/OKX/Vercel.
- `@clerk/ui@1.14.0/dist/themes/shadcn.js` uses `colorModalBackdrop: "color-mix(... transparent 50%)"`, `colorRing: "color-mix(... transparent 50%)"`, and `cardBox: "shadow-sm border data-[elevation=flush]:shadow-none data-[elevation=flush]:border-0"`.
- `@clerk/themes@2.4.57/2.4.62` uses `colorModalBackdrop: "var(--color-black)"`, `colorRing: "var(--ring)"`, `cardBox: "shadow-sm border"`, and provider-icon dark-mode classes.

The reversible spike still showed current visible-surface parity:

- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, `pnpm test:browser`, `pnpm test:integration`, `pnpm build`, and `pnpm test:e2e` all passed under Node 24 after the simple swap.
- Screenshots captured before/after for unauthenticated sign-in light/dark and authenticated dashboard light/dark were byte-identical (`magick compare -metric AE` returned `0` for all four pairs). Paths used during audit: `/tmp/debt408-clerk-visuals/*`.

This means the simple swap is visibly safe for the currently exercised Clerk surfaces, but it is not a proof of global theme identity for provider icons, flush card elevation, or future Clerk component states that use the differing theme keys.

**7. Related concrete Clerk warning discovered during visual verification:**

Both baseline and spiked runs emitted Clerk's `structural_css_pin_clerk_ui` warning because `components/auth-nav.tsx:60` passes `appearance.elements.userButtonTrigger: "min-h-[44px] min-w-[44px]"` to `<UserButton>`, which causes generated CSS targeting `.cl-userButtonBox` / `.cl-userButtonTrigger`. Clerk's browser warning says these selectors depend on internal DOM structure and recommends:

```ts
import { ui } from '@clerk/ui';

<ClerkProvider ui={ui}>
```

This is separate from the Solana/RN peer warning, but it directly affects the support analysis: the fully Clerk-supported way to pin structural CSS currently keeps `@clerk/ui` installed and passed to `ClerkProvider`, which conflicts with removing `@clerk/ui` for dependency minimization.

## Blast Radius

- **Runtime (app):** none. The `ws@7.5.11` consumers are React-Native / Metro / DevTools tooling that this web app never executes. We import only static theme objects.
- **Runtime (tests):** none. Before pruning, `ws@8.21.0` is used by `@vitest/browser` and also by Solana's `rpc-websockets`; after pruning, only the `@vitest/browser` copy remains. Its peer range is satisfied.
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

### Option A — Replace `@clerk/ui/themes` with `@clerk/themes`, drop `@clerk/ui` (root-cause fix) — **mechanically green, but not strict-supported/object-identical**

`@clerk/themes@2.4.57` (the `latest` dist-tag) is the lightweight Clerk appearance-themes package and exports the two theme names we use:

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
The reversible spike proved this deletes the entire `@clerk/ui -> @solana/* -> react-native -> ws@7.5.11` subtree from the lockfile, eliminating both the bloat **and** the peer warning at the root:

- `pnpm install`: `Packages: +12 -365`; dependencies changed from `@clerk/ui 1.14.0` to `@clerk/themes 2.4.57`.
- Actual `packages:` nodes removed from `pnpm-lock.yaml`: 356; added nodes: `@clerk/themes@2.4.57`, `@clerk/shared@3.47.7`, `swr@2.3.4`.
- Key removed nodes include `@clerk/ui@1.14.0`, `@clerk/localizations@4.7.0`, Emotion/Floating UI/FormKit/OTP/QRCode UI deps, all `@solana/*` and `@solana-mobile/*` wallet packages, `@solana/web3.js@1.98.4`, `@react-native-async-storage/async-storage@1.24.0`, `react-native@0.84.1`, `metro@0.83.7` and Metro subpackages, `react-devtools-core@6.1.5`, `jayson@4.3.0`, `isomorphic-ws@4.0.1`, `rpc-websockets@9.3.9`, `ws@7.5.11`, `bufferutil@4.1.0`, and `utf-8-validate@6.0.6`.

But this is **not** a strict zero-behavior-change proof:

- Current Clerk docs document `@clerk/ui/themes` as the themes path for Core 3; `@clerk/themes` is still published and historically documented, but not the current canonical docs path.
- `@clerk/themes` prebuilt `dark` and `shadcn` differ from `@clerk/ui@1.14.0` as documented above.
- `@clerk/themes` introduces a second `@clerk/shared@3.47.7` alongside `@clerk/nextjs@7` / `@clerk/shared@4.14.0`. The spike proved this coexistence does not break typecheck, build, tests, E2E, or the captured Clerk surfaces, but it does not remove the fact that two Clerk shared majors are installed.
- The app already emits Clerk's structural-CSS warning; Clerk's supported remediation for that warning is to pass `ui` from `@clerk/ui`, which conflicts with removing `@clerk/ui`.

Use Option A only if the owner explicitly accepts "byte-identical current visible surfaces under full gate" as sufficient, despite the object/canonical-path caveats. Under the stricter "same supported theme objects everywhere" bar, Option A is **NO-GO**.

### Option B — Keep `@clerk/ui`, silence the warning via pnpm config (cosmetic-only fallback)

If the Option A spike reveals a hard `@clerk/shared` incompatibility or that `@clerk/themes` is being deprecated, fall back to silencing the warning while accepting the bloat:

- Add a `pnpm.peerDependencyRules.allowedVersions` entry mapping `utf-8-validate` for `ws@7` to the installed `6.x`, **or** a `pnpm.overrides` pin. This quiets the report but does **not** remove the Solana/RN bloat (those are regular deps of `@clerk/ui` and stay installed).

Option B is strictly inferior on the real cost (bloat + supply-chain surface) and is only a fallback if A is blocked.

### Option D — Keep `@clerk/ui` and wire Clerk's `ui` prop (support-alignment follow-up, not bloat removal)

Because the app has `appearance.elements.userButtonTrigger` styling, Clerk emits a concrete `structural_css_pin_clerk_ui` warning and recommends passing `ui` from `@clerk/ui` to `<ClerkProvider>`. This is the supported way to pin Clerk's internal component DOM/CSS contract, but it keeps the Solana/RN subtree installed and therefore does **not** pay down DEBT-408's footprint goal. Track this as a related Clerk-versioning/support concern if the owner decides to keep `@clerk/ui`.

### Option C — Accept and document (no change)

Record the warning as known/benign and move on. Chosen only if both A and B are judged not worth the change cost. This doc itself already discharges the "known and explained" part.

## Recommendation

Do **not** ship the simple Option A swap as a guaranteed strict-equivalence fix. It is mechanically excellent and visibly identical on audited surfaces, but current Clerk docs/canonical support and theme-object differences prevent claiming "identical Clerk theming" without a scope decision.

Owner decision:

1. If the hard bar is **supported path + identical theme object semantics**, choose **NO-GO for root-cause pruning today**. Keep `@clerk/ui` (Option C) or silence the peer warning only (Option B), and optionally file/track the `ui` prop support-alignment work (Option D).
2. If the accepted bar is **current user-visible surfaces are byte-identical under full local gate/E2E**, Option A is implementation-ready: it removes 356 lockfile package nodes and clears the peer warning with no observed auth/theme regression.

## Severity & Priority

Rated **P3**: nothing is broken at runtime, build, or test time today, so it is not P1/P2 by the "concrete user harm" bar. The legitimate, non-speculative costs are (a) install bloat and (b) expanded supply-chain/audit surface — both real and measurable, not "could theoretically be better."

A **P2 argument** exists and the owner may elect it: this repo has invested heavily in supply-chain hardening (the DEBT-393/394 `minimumReleaseAge` + trust-policy arc). Carrying the full Solana crypto-wallet + React Native stack — entirely unused — directly contradicts that posture, and pruning it is squarely in scope of that investment. If supply-chain surface is weighted as a first-class risk, P2 is defensible. Left at P3 pending owner call.

## Acceptance Criteria

Option A is done only after the owner explicitly accepts the visible-surface parity bar:
- [ ] `components/providers.tsx` imports `dark` and `shadcn` from `@clerk/themes`; `@clerk/ui` is removed from `package.json`.
- [ ] `pnpm-lock.yaml` no longer contains `@clerk/ui`, `@solana/*`, `react-native`, `metro`, `react-devtools-core`, or `ws@7.5.11`. `ws@8.21.0` (vitest) remains and its peer range stays satisfied.
- [ ] The PR body explicitly discloses that `@clerk/themes` adds `@clerk/shared@3.47.7` alongside Clerk shared v4, and that full gates/E2E prove no observed dual-instance break.
- [ ] The PR body explicitly discloses the non-identical `@clerk/ui` vs `@clerk/themes` theme-object keys and scopes the equivalence claim to audited visible surfaces, not all possible Clerk component states.
- [ ] Clerk sign-in and dashboard/user widgets render byte-identically in dark and light mode before/after (`magick compare -metric AE` returns `0` for all audited pairs).
- [ ] Full gate green: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` (+ E2E if the authenticated billing env is available).
- [ ] `pnpm install --frozen-lockfile` is clean and the `ws@7.5.11` / `utf-8-validate` peer warning is gone.
- [ ] CodeRabbit review clean on the latest head before merge.

## Rollback

Single-commit revert. The change is confined to one import line, one `package.json` dependency swap, and the regenerated `pnpm-lock.yaml`. Reverting restores `@clerk/ui` and the prior (working, warning-emitting) tree. No data, schema, or runtime-config surface is touched.
