# DEBT-392: Dependency Hygiene Audit (security, actions, lockfile, automation, runtime)

**Priority:** P2 (GitHub Actions is already warning that JavaScript actions on Node 20 will be forced to Node 24; production-reachable Clerk and Next advisories are present; lockfile and automation gaps make this drift likely to recur.)
**Created:** 2026-05-23
**Source:** Periodic dependency hygiene audit after the SPEC-040 / SPEC-039 / DEBT-391 ship to main. The proximate trigger was a Node.js 20 deprecation warning printed by GitHub Actions in the merge CI run for PR #320 (run `26346890442`, job step "Complete job").
**Related:** [DEBT-391](./debt-391-local-e2e-schema-drift-preflight.md), [DEBT-340 (archived, Clerk v7 + Next.js 16.2.1 upgrade)](../_archive/debt/debt-340-clerk-v7-nextjs-upgrade.md), [DEBT-332 (security posture audit)](./debt-332-security-posture-audit.md)

**Status:** Resolved 2026-05-25 — all six tiers shipped across 14 PRs (#321, #322, #323, #324, #325, #328, #329, #330, #331, #332, #333, #334, #335, #339). Final `pnpm audit`: 0 critical / 0 high / 3 moderate. Dependabot is now live and has begun opening weekly PRs; triage of those open PRs and supply-chain hardening (pnpm 11 + `minimumReleaseAge` / `strictDepBuilds` / `blockExoticSubdeps` / `trustPolicy`) are tracked as separate follow-up debt cycles.

---

## Problem

The repo has not had a formal dependency-hygiene pass since the Clerk v7 / Next.js 16.2.1 cut in DEBT-340 (2026-03-28). Fresh checks show `pnpm audit --json` reports **49 vulnerabilities (3 critical, 26 high, 18 moderate, 2 low)**, including production-reachable Clerk and Next advisories. The same pass also found a GitHub Actions Node 20 runner warning, a stale `packageManager` pin, a failing `pnpm dedupe --check`, no automated dependency-monitoring configuration, and no tracked license baseline.

This audit is concrete and mechanically reproducible. Version claims come from `pnpm outdated --format=json`, `pnpm ls --depth=0 --json`, `npm view`, upstream action manifests, upstream changelogs, source grep, and `pnpm audit --json`. It intentionally separates production-reachable security work from dev/tooling security, routine freshness, runtime alignment, and cleanup. Stale is not automatically broken; the remediation only lists items with named advisories, named platform deadlines, failed local checks, missing automation, or zero-import evidence.

---

## Findings

### A. GitHub Actions Runtime - observed CI warning June 2, public changelog June 16

The merge CI run for PR #320 (`https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/26346890442`, "Complete job" step) printed a Node 20 deprecation warning. Reproduce with:

```sh
gh run view 26346890442 --log | rg -n "Node.js 20 actions are deprecated|forced to run with Node.js 24|removed from the runner"
```

The runner warning says actions will be forced to Node 24 by default starting **June 2, 2026** and Node 20 will be removed on **September 16, 2026**.

The public GitHub changelog at `https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/` says **June 16, 2026**:

```sh
curl -fsSL https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/ | rg -n "June 16|Node24|Node20"
```

Treat June 2 as the operational deadline because it is what our own runner emitted. Keep the public June 16 date visible so future readers do not "correct" the discrepancy away.

Flagged actions:

| Flagged action | Source in this repo | Verified target |
|---|---|---|
| `pnpm/action-setup@v4` | `.github/workflows/ci.yml:71` | Direct action. Current upstream latest verified from GitHub releases is `pnpm/action-setup@v6.0.8`, whose action runtime is Node 24. |
| `actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea` | Transitive through `codecov/codecov-action@v5` at `.github/workflows/ci.yml:128` | `codecov/codecov-action@v5.5.4` still pins `actions/github-script@... # v7.0.1`; `codecov/codecov-action@v6.0.1` pins `actions/github-script@... # v8.0.0`. |

Verification commands:

```sh
nl -ba .github/workflows/ci.yml | sed -n '60,135p'
curl -fsSL https://raw.githubusercontent.com/codecov/codecov-action/v5.5.4/action.yml | rg -n "github-script|using:|runs:"
curl -fsSL https://raw.githubusercontent.com/codecov/codecov-action/v6.0.1/action.yml | rg -n "github-script|using:|runs:"
gh api repos/codecov/codecov-action/releases --jq '.[0:5] | .[] | [.tag_name,.published_at] | @tsv'
```

Important correction: `codecov/codecov-action@v6.0.0` is the first checked major release that moves to `actions/github-script` v8; `v6.0.1` is the current latest release verified in this audit. A latest v5 patch is not sufficient.

### B. Security Advisories With Reachability

Fresh audit command:

```sh
pnpm audit --json
```

Fresh distribution: **49 vulnerabilities (3 critical, 26 high, 18 moderate, 2 low)**.

Do not cite ephemeral `/tmp` output. The durable evidence is the command above plus the GHSA identifiers below.

#### Critical (3)

| GHSA | Package | Vulnerable | Patched | Path | Reachability |
|---|---|---|---|---|---|
| GHSA-vqx2-fgx2-5wq9 | `@clerk/shared` | `>=4.0.0 <4.8.1` | `>=4.8.1` | `.>@clerk/nextjs>@clerk/shared` | **Production-reachable.** `proxy.ts:192-201` imports Clerk middleware and calls `auth.protect()` on protected routes. |
| GHSA-vqx2-fgx2-5wq9 | `@clerk/nextjs` | `>=7.0.0 <7.2.1` | `>=7.2.1` | `.>@clerk/nextjs` | **Production-reachable.** Clerk protects app routes and renders auth surfaces. |
| GHSA-vqx2-fgx2-5wq9 | `@clerk/shared` | `>=3.0.0-canary.v20250225091530 <3.47.4` | `>=3.47.4` | `.>@clerk/testing>@clerk/shared` | **E2E-only.** `@clerk/testing` imports exist only in `tests/e2e/global.setup.ts` and `tests/e2e/helpers/clerk-auth.ts`. |

#### High (26), clustered

| Cluster | Representative GHSA(s) | Current path(s) | Fix target | Reachability |
|---|---|---|---|---|
| Clerk authorization bypass | GHSA-w24r-5266-9c3c | `@clerk/nextjs`, `@clerk/react`, `@clerk/backend`, `@clerk/shared`; plus older `@clerk/testing` backend/shared chain | `@clerk/nextjs >=7.2.4`; latest direct target `7.4.1`; `@clerk/testing` latest `2.0.33` shares `@clerk/shared ^4.13.1` and `@clerk/backend ^3.4.13` | **Production-reachable** through `@clerk/nextjs`; **E2E-only** for the `@clerk/testing` chain. |
| Next.js App Router / Server Components / Cache Components | GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj, GHSA-mg66-mrh9-m8jx, GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6 | `.>next` | `next >=16.2.6` | **Production-reachable.** The app runs Next 16.2.1 and `next.config.ts:4` has `cacheComponents: true`. |
| Next.js Pages Router i18n bypass | GHSA-36qx-fr4f-26g5 | `.>next` | `next >=16.2.5` | **Not currently reachable by route model.** This app uses App Router; keep the patch because it lands with the same Next patch. |
| Next.js WebSocket SSRF | GHSA-c4j6-fc7j-m34r | `.>next` | `next >=16.2.5` | **Production-reachable unless proven otherwise.** Next is the production server; no narrower safe claim is justified here. |
| Drizzle SQL identifier escaping | GHSA-gpj5-g38j-94v9 | `.>drizzle-orm` | `drizzle-orm >=0.45.2` | **No current call site.** `rg "sql\\.identifier|sql\\.raw\\(" src/ app/ lib/` returns zero matches. Patch remains prudent and cheap. |
| Vite / Rollup / Picomatch dev-server chain | GHSA-mw96-cpmx-2vgc, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, GHSA-c2c7-rcm5-vvqj | `@vitejs/plugin-react>vite>...` | `@vitejs/plugin-react 6.0.2`, Vitest-family bumps; verify resolved `vite >=7.3.2` | **Dev/tooling only.** Used by Vitest/browser tooling, not production traffic. |
| Sentry bundler / webpack plugin transitive chain | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74, GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc | `@sentry/nextjs>@sentry/bundler-plugin-core...` and `@sentry/nextjs>@sentry/webpack-plugin...` | `@sentry/nextjs 10.53.1` | **Production dependency, advisory paths are build-chain.** Sentry runtime is imported, but these vulnerable packages sit under bundler/webpack plugin paths. |
| `lint-staged` transitive glob/YAML chain | GHSA-c2c7-rcm5-vvqj and GHSA-48c2-rrv3-qjmp | `.>lint-staged>micromatch>picomatch`, `.>lint-staged>yaml` | `lint-staged 17.0.5` | **Local tooling only.** Pre-commit path, not production. |
| `@clerk/testing` `js-cookie` chain | GHSA-qjx8-664m-686j | `.>@clerk/testing>@clerk/shared>js-cookie` | `@clerk/testing 2.0.33` | **E2E-only.** Still blocks a clean audit unless upgraded or explicitly filtered by reachability. |

Moderate and low advisories repeat these clusters: Next.js rows, Sentry build-chain rows, Vite/Vitest rows, `postcss`, `ws`, `uuid`, and `esbuild` via Drizzle tooling. Their fix paths should follow the same reachability classification instead of being treated as equal production risk.

### C. Major Version Behind - Migration Assessment Needed

Source commands:

```sh
pnpm outdated --format=json
pnpm ls --depth=0 --json
npm view <pkg> version dist-tags engines peerDependencies dependencies --json
```

| Package | Current | Latest | Constraint check | Verified migration concerns | Migration complexity |
|---|---|---|---|---|---|
| `@types/node` | 22.15.18 | 25.9.1 | Types must match the runtime major, not the newest available major. Latest Node 24 type line verified at `24.12.4`. | If runtime alignment targets Node 24, use `@types/node@24.x`, not 25.x. | **Trivial**, but only after runtime target is decided. |
| `@vitejs/plugin-react` | 5.1.3 | 6.0.2 | Needed to resolve the Vite/Rollup advisory chain cleanly. | Treat as dev/tooling security; verify resolved `vite >=7.3.2` with `pnpm why vite`. | **Moderate**. |
| `dotenv` | 16.5.0 | 17.4.2 | Used by `drizzle.config.ts`, `playwright.config.ts`, `scripts/seed.ts`, `tests/shared/load-dotenv-file.ts`, and inline `.env.local` snippets in repo docs. | Audit parse/logging behavior at every call site. | **Moderate**. |
| `jsdom` | 26.1.0 | 29.1.1 | Used by `*.test.tsx` through the repo's React 19 jsdom testing convention. | Run unit suite under candidate major; no production reachability. | **Moderate**. |
| `lint-staged` | 16.2.7 | 17.0.5 | Hook config lives at `package.json:34-40`. | Closes local tooling `yaml` / `picomatch` rows; re-test Husky/lint-staged chain. | **Trivial-to-moderate**. |
| `stripe` | 20.3.0 | 22.1.1 | `lib/stripe.ts:22` explicitly pins `apiVersion: '2026-01-28.clover'`. | **Split into two PRs.** PR A bumps SDK while preserving the explicit API pin and verifies ES6-class import, host override removal, and type-export changes from the upstream changelog. PR B separately advances the API pin after webhook + reconcile tests pass. Note: `stripe@22.0.0` used `2026-03-25.dahlia`; `stripe@22.1.x` uses `2026-04-22.dahlia`. | **Hard**. |
| `typescript` | 5.9.3 | 6.0.3 | `tsconfig.json` uses strict/bundler settings and `types` is not currently explicit. | Official TS 6 notes call out `types` defaulting to `[]`, `rootDir` defaulting to `.`, deprecations for `target: es5`, `downlevelIteration`, `moduleResolution node/node10`, `module amd/umd/systemjs/none`, `baseUrl`, `moduleResolution classic`, `outFile`, legacy `module` namespace syntax, import `asserts` deprecation, and `tsc foo.ts` becoming an error when `tsconfig.json` exists. | **Hard**. Its own PR with `pnpm typecheck && pnpm build` as the gate. |
| `zod` | 3.24.4 | 4.4.3 | Count of import sites in app code: **22**, verified by `rg -l "from ['\\\"]zod['\\\"]|from 'zod/" src/ app/ lib/ tests/ scripts/ | wc -l`. | Upstream v4 migration guide says error customization moves to a unified `error` param, `invalid_type_error` / `required_error` are dropped, `errorMap` is renamed, issue formats changed, and several schema APIs changed/deprecated. Do **not** describe v4 as a top-level import rename; `import * as z from "zod"` remains the v4 path. | **Hard**. |
| `lucide-react` | 0.563.0 | 1.16.0 | Leaf UI icon library. | Count import sites before upgrade and audit icon names. This is not security debt. | **Moderate**. |

### D. Minor/Patch Behind - Routine Inventory

Source: `pnpm outdated --format=json` against current lockfile. These are not all security remediation. Do not bundle them into security PRs unless they are part of the same advisory fix.

| Package | Current | Latest | Notes |
|---|---|---|---|
| `next` | 16.2.1 | 16.2.6 | Production security. |
| `@clerk/nextjs` | 7.0.7 | 7.4.1 | Production security. |
| `@clerk/ui` | 1.2.4 | 1.13.1 | Pair with Clerk security PR. |
| `@sentry/nextjs` | 10.38.0 | 10.53.1 | Production dependency; advisory paths are build-chain. |
| `drizzle-orm` | 0.45.1 | 0.45.2 | Precautionary patch; no current identifier/raw call site. |
| `drizzle-kit` | 0.31.8 | 0.31.10 | Pair with Drizzle ecosystem verification. |
| `postcss` | 8.5.3 | 8.5.15 | Direct top-level dep is likely unused; see Section F. |
| `react` / `react-dom` | 19.2.4 | 19.2.6 | Routine freshness, not security. |
| `@types/react` | 19.2.10 | 19.2.15 | Routine freshness. |
| `@types/react-dom` | 19.2.3 | latest 19.2.x | Routine freshness. |
| `@biomejs/biome` | 2.3.13 | 2.4.15 | Routine tooling. |
| `@playwright/test` | 1.58.1 | 1.60.0 | E2E tooling. |
| `pino` | 10.3.0 | 10.3.1 | Routine freshness. |
| `postgres` | 3.4.8 | 3.4.9 | Routine freshness. |
| `tailwind-merge` | 3.4.0 | 3.6.0 | Routine UI utility. |
| `tailwindcss` / `@tailwindcss/postcss` | 4.1.18 | 4.3.0 | Pair together. |
| `tsx` | 4.21.0 | 4.22.3 | Script/tooling freshness. |
| `vitest` family | 4.0.18 | 4.1.7 | Dev/tooling security path through Vite. |
| `vitest-browser-react` | 2.0.5 | 2.2.0 | Browser-test tooling. |

### E. Engines + Runtime Pinning

Current state:

- `package.json:3` packageManager: `"pnpm@10.9.0"`.
- `package.json:4-7` engines: `"node": ">=20.19.0"`, `"pnpm": ">=10.0.0"`.
- No `.nvmrc` exists (`test -f .nvmrc && cat .nvmrc || true` prints nothing).
- CI: `.github/workflows/ci.yml:77-79` uses `actions/setup-node@v6` with `node-version: 22`.
- Vercel's Node docs say available versions include Node 20.x / 22.x / 24.x, with Node 24.x the current default for new projects, and package `engines.node` overrides runtime selection. Source: `https://vercel.com/docs/functions/runtimes/node-js/node-js-versions`.
- Official Node release schedule from `https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`: Node 20 EOL 2026-04-30, Node 22 EOL 2027-04-30, Node 24 EOL 2028-04-30.

Choose one runtime major and pin it precisely.

Recommended: align to Node 24 (LTS, current Vercel default, GitHub Actions JS-action target). In a dedicated runtime-alignment PR, set:

- CI: `actions/setup-node@v6` with `node-version: 24`
- `package.json` `engines.node`: `"24.x"`
- `.nvmrc`: `24`
- `@types/node`: target `24.x` (current 24.x latest verified as `24.12.4`, not `@types/node@25`)

If the team deliberately defers to Node 22 LTS, use `engines.node: "22.x"` or `"^22.0.0"`. Do not use `">=22.0.0"` and claim it pins Node 22 on Vercel. It is a lower-bound constraint; Vercel can resolve to a newer in-range major, typically 24.x.

### F. Potentially Unused Dependencies

Verification:

```sh
rg -n "from ['\"]postcss['\"]|require\\(['\"]postcss['\"]\\)|postcss" src lib app tests scripts . --glob '!node_modules/**' --glob '!.next/**' --glob '!coverage/**' --glob '!pnpm-lock.yaml' --glob '!playwright-report/**' --glob '!test-results/**'
pnpm why postcss
```

| Package | Direct import sites | Implicit usage found? | Verdict |
|---|---|---|---|
| `postcss` (dependency) | 0 source `import`/`require` sites | `postcss.config.mjs` references `@tailwindcss/postcss`, not `postcss` directly. `pnpm why postcss` shows `next`, `@tailwindcss/postcss`, and Vite bring their own PostCSS copies, plus our direct `postcss 8.5.3`. | **Likely unused as a direct dep.** Remove in cleanup only, then prove with `pnpm build` and tests. |
| `server-only` | Side-effect imports, not named imports | Used by server-only modules such as `lib/auth.ts`, `lib/db.ts`, `lib/env.ts`, `lib/stripe.ts`, and `components/get-started-cta.tsx`. | **Keep.** Real usage. |
| `tailwindcss` / `@tailwindcss/postcss` / `tw-animate-css` | Loaded through CSS/PostCSS | `postcss.config.mjs` and `app/globals.css` use these implicitly. | **Keep.** Real usage. |

### G. Lockfile and Automation Hygiene

- **`pnpm dedupe --check` currently fails.** Reproduce: `pnpm dedupe --check`. Output lists lockfile dedupe candidates including `postcss 8.5.3 -> 8.5.6`, `@types/node 22.15.18 -> 22.19.15`, and a peer-dep warning under `@solana/web3.js > jayson > ws` (`utf-8-validate@^5.0.2`, found `6.0.6`). Action: run `pnpm dedupe` in a dedicated PR after Tier 2 security bumps land, verify full gate green, and document any peer warnings that remain.
- **packageManager pin drift.** `package.json` pins `pnpm@10.9.0`; `npm view pnpm version dist-tags engines --json` shows latest 10.x is `10.33.4`, latest 11.x is `11.2.2`, and pnpm 11 requires `node >=22.13`. Vercel respects package manager selection through Corepack. Recommendation: bump to `pnpm@10.33.4` now with no Node-version coupling; defer pnpm 11 until the runtime-alignment PR.
- **No automated dependency monitoring.** Verified with `find . -maxdepth 3 \( -name 'renovate.json' -o -name '.renovaterc' -o -name '.renovaterc.json' -o -path './.github/dependabot.yml' -o -path './.github/dependabot.yaml' \) -print`: no Renovate or Dependabot config exists. The manual audit is the symptom. Action: add Dependabot or Renovate config in its own PR. Recommendation: Dependabot (built-in, free, no third-party), grouped security updates, weekly cadence, and manual major-version flow.
- **Deprecated subdependencies.** `pnpm dedupe --check` reports 11 deprecated subdependencies in the resolved tree: `@clerk/types@4.101.18`, `@esbuild-kit/core-utils@3.3.2`, `@esbuild-kit/esm-loader@2.6.5`, `@ungap/structured-clone@1.3.0`, `glob@10.5.0`, `glob@7.2.3`, `inflight@1.0.6`, `rimraf@3.0.2`, `uuid@8.3.2`, `uuid@9.0.1`, `whatwg-encoding@3.1.1`. Most are transitive and may resolve through Tier 2/3 bumps. Re-check after those PRs and record named exceptions.
- **License baseline.** `pnpm licenses list --json` shows mostly permissive licenses, with these review-worthy entries in the tree: `FSL-1.1-MIT` (`@sentry/cli`, `@sentry/cli-darwin`), `LGPL-3.0-only` (`rpc-websockets`), `LGPL-3.0-or-later` (`@img/sharp-libvips-darwin-arm64`), and two `Unknown` license fields (`eyes`, `text-encoding-utf-8`). This is not a confirmed violation. The debt is the absence of a tracked baseline. Action: snapshot the current license distribution into a tracked doc such as `docs/dev/license-baseline.md`, then add an allowlist check in a separate PR if the team wants CI enforcement.

### H. Cross-Cutting Notes

- **Clerk version.** The v7 line is intentional per DEBT-340. The security PR should include `@clerk/nextjs`, `@clerk/ui`, and `@clerk/testing`; splitting `@clerk/testing` into a later tier leaves critical/high audit rows alive.
- **Next.js / React pairing.** Next 16.2.x and React 19.2.x remain the chosen line. The Next security patch stays inside the same major/minor family.
- **Sentry.** `@sentry/nextjs` is production instrumentation (`instrumentation.ts`, `sentry.client.config.ts`, `lib/report-client-error.ts`), but the current audit paths are build-chain plugin dependencies. Patch it, but do not call those specific GHSA paths request-path reachable without evidence.
- **Stripe SDK.** The explicit API pin at `lib/stripe.ts:22` is the safety boundary. Preserve it during SDK upgrade; move the API pin only in a separate PR.
- **Tailwind v3 vs v4.** Already on Tailwind v4 (`tailwindcss: 4.1.18`, `@tailwindcss/postcss: 4.1.18`, `app/globals.css` imports Tailwind v4 style). No v3-to-v4 migration debt remains.
- **Bundle-size deltas.** For large runtime-facing upgrades (`next`, Clerk, Sentry, Zod, `lucide-react`), record bundle/build output deltas in each PR. Do not turn "newer" into "better" without checking the artifact.

---

## Required Remediation (tiered)

### Tier 1 - Hard-deadline Actions runtime (2026-06-02 operational / 2026-06-16 public)

- Bump `pnpm/action-setup@v4` -> `pnpm/action-setup@v6` in `.github/workflows/ci.yml:71` (latest verified as `v6.0.8`). Keep the existing pnpm version input until the package-manager PR changes it deliberately.
- Bump `codecov/codecov-action@v5` -> `codecov/codecov-action@v6.0.1`. Verified `v5.5.4` still pins `actions/github-script@v7.0.1` (Node 20); `v6.0.1` pins `actions/github-script@v8.0.0` (Node 24). `v6.0.0` is the first checked major release that removes the Node-20 transitive warning; `v6.0.1` is the current latest.
- Set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` in `ci.yml` as part of the same Actions PR, after bumping `pnpm/action-setup` and Codecov. Downside: earlier discovery of any Node-24-incompatible action in our chain. Upside: proves the exact post-flip runner mode before GitHub flips the default. Acceptable risk.

### Tier 2 - Production security

One PR per upgrade area unless the dependency chains must move together.

1. **Clerk security PR.** Bump `@clerk/nextjs` `7.0.7 -> 7.4.1` (production-reachable critical/high), `@clerk/ui` `1.2.4 -> 1.13.1`, and `@clerk/testing` `1.14.0 -> 2.0.33` (E2E-only critical/high). All three share the secure `@clerk/shared` / `@clerk/backend` chain; splitting them across tiers leaves critical/high audit rows alive after Tier 2.
2. **Next.js patch.** Bump `next` `16.2.1 -> 16.2.6`. Production-reachable. Required for the App Router / Server Components / Cache Components advisories; one Pages Router i18n advisory is not reachable but closes with the same patch.
3. **Sentry patch.** Bump `@sentry/nextjs` `10.38.0 -> 10.53.1`. Production dependency; current advisory paths are build-chain (`bundler-plugin-core`, `webpack-plugin`) and should be annotated that way in the PR.
4. **PostCSS patch/removal decision.** Either patch direct `postcss` `8.5.3 -> 8.5.15` with the Next/Vite/Tailwind chain, or remove the direct `postcss` dependency in Tier 6 if the team chooses cleanup first. Do not leave the direct vulnerable `postcss` path unexplained.

### Tier 3 - Dev/tooling security + lockfile hygiene

- **Vite/Vitest toolchain.** Bump `@vitejs/plugin-react`, `vitest`, `@vitest/browser-playwright`, `@vitest/coverage-v8`, and `vitest-browser-react` enough to resolve `vite >=7.3.2`, Rollup, and Picomatch advisory paths. Verify with `pnpm why vite`, `pnpm test --run`, and `pnpm test:browser`.
- **`lint-staged` tooling.** Bump `lint-staged` `16.2.7 -> 17.0.5` to close its `yaml` / `picomatch` paths. Verify Husky/lint-staged behavior through the existing hook commands.
- **`jsdom` tooling.** Bump `jsdom` `26.1.0 -> 29.1.1` separately and run the unit suite that exercises `// @vitest-environment jsdom`.
- **Drizzle precautionary patch.** Bump `drizzle-orm` `0.45.1 -> 0.45.2` plus `drizzle-kit` `0.31.8 -> 0.31.10` and `postgres` `3.4.8 -> 3.4.9`. Current exploit reachability is zero because the repo has no `sql.identifier` / `sql.raw(` app-code matches, but the patch is still appropriate.
- **Lockfile dedupe.** After Tier 2 security bumps land, run `pnpm dedupe`, verify the full gate, and commit only the lockfile changes that remain necessary. Record any unresolved peer warning.

### Tier 4 - Major upgrades (each its own PR)

- **Stripe SDK split.** PR A: bump `stripe` `20.3.0 -> 22.1.1` while preserving `apiVersion: '2026-01-28.clover'` at `lib/stripe.ts:22`; verify ES6-class change, host override removal, and type exports per upstream CHANGELOG. PR B: advance the Stripe API version pin only after webhook + reconcile tests pass against the new SDK.
- **Zod 3 -> 4.** Bump `zod` `3.24.4 -> 4.4.3`; handle error customization, issue-format, and schema-API changes across the 22 verified import sites.
- **TypeScript 5 -> 6.** Bump `typescript` `5.9.3 -> 6.0.3` in its own PR. Gate on `pnpm typecheck && pnpm build`; explicitly handle `types`, `rootDir`, and deprecation diagnostics.
- **Dotenv 16 -> 17.** Audit each dotenv call site and the inline command snippets before changing behavior.
- **Lucide 0 -> 1.** Audit icon names and build output. Leaf UI risk, but still a major.
- **Lint-staged 16 -> 17.** If not already handled in Tier 3, keep it as its own major-upgrade PR.

### Tier 5 - Runtime alignment

- Choose Node 24 (recommended) or a precise Node 22 LTS deferral. Update CI `node-version`, `package.json` `engines.node`, `.nvmrc`, `@types/node` major, and Vercel runtime expectations together.
- Pair `packageManager` cleanup with this plan: bump `pnpm@10.9.0 -> 10.33.4` immediately if desired; defer pnpm 11 until Node alignment because pnpm 11 requires `node >=22.13`.

### Tier 6 - Cleanup and automation

- Remove the top-level `postcss` dependency if build/tests prove Next / Vite / Tailwind continue resolving their own PostCSS chains.
- Add Dependabot or Renovate. Recommendation: Dependabot with grouped security updates, weekly cadence, and manual major-version flow.
- Add `docs/dev/license-baseline.md` with the current license distribution and review-worthy exceptions. Add CI enforcement only after the baseline is accepted.

---

## Public-Safety Boundary

Do document: package names, public version numbers, GHSA identifiers, public deprecation dates, CI run URLs that are public to the repo, and public upstream advisory / changelog URLs.

Do not commit:

- Vercel project IDs, Neon project / branch IDs, account IDs, billing IDs.
- Full `DATABASE_URL` values or any auth tokens, including Codecov tokens and Clerk / Stripe secrets.
- The full text of `.env.local` or screenshots of secret-bearing CI logs.

Per DEBT-391's existing boundary line: "the repo records the contract while provider-specific private values stay in the providers."

---

## Acceptance Criteria

- After Tier 1 (Actions): GitHub Actions CI run produces zero Node-20 deprecation warnings.
- After Tier 2 (Production security): zero critical and zero high production-reachable advisories; any remaining critical/high are explicitly classified as dev/tooling/E2E-only with reachability evidence.
- After Lockfile Hygiene PR: `pnpm dedupe --check` exits clean or documented peer-dep exceptions are listed in the doc.
- After Runtime Alignment PR: CI `node-version`, `package.json` `engines.node`, `.nvmrc`, `@types/node` major, and Vercel runtime major all agree.
- After Automation PR: Dependabot or Renovate is present and producing weekly grouped PRs.
- After license-baseline PR: `docs/dev/license-baseline.md` exists with the snapshot.
