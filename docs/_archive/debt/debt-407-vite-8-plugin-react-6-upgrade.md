# DEBT-407: Vite 8 + @vitejs/plugin-react 6 Coupled Test-Infra Upgrade

**Priority:** P2
**Created:** 2026-06-04
**Source:** Dependabot opened separate major-upgrade PRs for `vite` 7.3.3 -> 8.0.14 (#386) and `@vitejs/plugin-react` ^5.2.0 -> ^6.0.2 (#387). The plugin-react PR is red by itself because plugin-react 6 peers on Vite 8.
**Related:** [DEBT-403](./debt-403-biome-245-lint-conformance.md), [DEBT-393](./debt-393-dependabot-triage-and-config-hardening.md), [Testing Infrastructure](../../dev/testing-infrastructure.md)

**Status:** **Resolved 2026-06-05.** Shipped as PR #403 (squash-merged to `dev` as `60b3975a`); Dependabot #386/#387 closed as superseded. See Resolution below.

---

## Resolution (2026-06-05)

Shipped as PR #403, squash-merged to `dev` as `60b3975a`, superseding Dependabot #386 and #387 (both closed as superseded).

- `package.json`: `vite` `7.3.3` -> `8.0.14` (exact pin retained); `@vitejs/plugin-react` `^5.2.0` -> `^6.0.2` (caret retained); `vitest` unchanged at `^4.1.7`.
- No source or Vitest-config changes were required. `vitest.browser.config.ts`'s `react()` call and `optimizeDeps.include` list worked unchanged under Vite 8's Rolldown/OXC optimizer and plugin-react 6's Babel-free transform.
- `pnpm-lock.yaml` churn matched the prediction: the `@babel/plugin-transform-react-jsx-*` chain that plugin-react 5 pulled was removed (plugin-react 6 moves React Refresh to OXC), the Rolldown/OXC native runtime (`@napi-rs/wasm-runtime`, `@emnapi/*`, `@tybys/wasm-util`) was added, and esbuild advanced transitively `0.27.2` -> `0.28.0`. No first-party dependency versions changed.
- Full CI gate on Node 24 was green — typecheck, lint, unit, Browser Mode, integration, and `next build` — with `codecov/patch` green. CodeRabbit approved at head `6d781b54` with no actionable comments.

The Acceptance Criteria below were all met.

---

## Problem

Dependabot split a hard-coupled test-infrastructure upgrade into two independent PRs:

- [PR #386](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/386) bumps `vite` 7.3.3 -> 8.0.14. Its `test` CI check passed on its own because `@vitejs/plugin-react` 5.2.0 already allows Vite 8.
- [PR #387](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/387) bumps `@vitejs/plugin-react` ^5.2.0 -> ^6.0.2. It is red on the current tree because plugin-react 6.0.2 peers on `vite: ^8.0.0`.

The correct delivery shape is one manual PR that lands both package changes together. Keeping the split Dependabot PRs open creates avoidable CI churn: #387 cannot pass without the #386 upgrade, while #386 alone would leave the coupled plugin major behind.

---

## Evidence

Current package state:

- `package.json` has `vite: "7.3.3"`.
- `package.json` has `@vitejs/plugin-react: "^5.2.0"`.
- `package.json` has `vitest: "^4.1.7"`.
- `package.json` engines pin this repo to Node `24.x`.

Dependabot PR state checked on 2026-06-04:

- #386 (`dependabot/npm_and_yarn/dev/vite-8.0.14`) has a successful `test` CI check. That CI job uses Node 24 (`.github/workflows/ci.yml:76-80`) and runs typecheck, Biome CI, database migrate/seed, `pnpm test:coverage`, `pnpm test:integration:coverage`, `pnpm test:browser:coverage`, and `pnpm build` (`.github/workflows/ci.yml:85-135`); same-repo E2E is intentionally skipped for Dependabot PRs because repository secrets are unavailable (`.github/workflows/ci.yml:137-140`).
- #387 (`dependabot/npm_and_yarn/dev/vitejs/plugin-react-6.0.2`) is `UNSTABLE`; the `test` CI check failed.

Package metadata spot-check:

- `@vitejs/plugin-react@6.0.2` has peer dependency `vite: ^8.0.0`.
- `@vitejs/plugin-react@6.0.2` also declares optional peers `@rolldown/plugin-babel` and `babel-plugin-react-compiler`. They are optional and must not be installed unless the project explicitly adopts those features.
- `@vitejs/plugin-react@5.2.0` allows `vite: ^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`, explaining why the Vite-only PR can pass.
- `vitest@4.1.7` allows `vite: ^6.0.0 || ^7.0.0 || ^8.0.0` and supports the repo's Node 24 baseline.
- `vite@8.0.14` supports Node `^20.19.0 || >=22.12.0`; no Node/Vitest bump is required.
- The supply-chain maturity gate should not block Phase 1: `pnpm-workspace.yaml:1-2` enforces `minimumReleaseAge: 10080` with `minimumReleaseAgeStrict: true`; registry metadata shows `@vitejs/plugin-react@6.0.2` was published on 2026-05-14 and `vite@8.0.14` was published on 2026-05-21, both more than seven days before this doc's 2026-06-04 creation date.

---

## Blast Radius

This upgrade is test-infrastructure only.

The production build remains Next.js-owned:

- `package.json` script `build` is `next build`.

Vite is used by the Vitest configuration surface:

- `vitest.config.ts` imports `defineConfig` from `vitest/config`.
- `vitest.integration.config.ts` imports `defineConfig` from `vitest/config`.
- `vitest.browser.config.ts` imports `defineConfig` from `vitest/config` and `react` from `@vitejs/plugin-react`.
- `vitest.browser.config.ts` uses the plugin as `plugins: [react()]` with no options.

No application code imports Vite or plugin-react. The high-risk runtime surfaces for this change are therefore the Vitest transform path (`pnpm test --run`) and the browser-test React plugin path (`pnpm test:browser`), not `pnpm build`.

---

## Breaking-Change Scan

The audited Vite 8 and plugin-react 6 breaking surfaces do not map to this repository's current usage:

- Rolldown configuration: no `rolldownOptions` usage in Vitest configs.
- Dependency optimizer: the [Vite 8 migration guide](https://vite.dev/guide/migration.html#dependency-optimizer-now-uses-rolldown) says the dependency optimizer now uses Rolldown instead of esbuild. This is a live surface because `vitest.browser.config.ts:15-27` has an `optimizeDeps.include` list for Clerk, Sentry, Drizzle, Pino, Postgres, `server-only`, Stripe, and Zod. #386 already ran Vite 8.0.14 through CI's browser coverage and build steps (`.github/workflows/ci.yml:123-135`) with that same include list and plugin-react 5; the remaining coupled-PR delta is plugin-react 5 -> 6, validated by `pnpm test:browser`.
- Esbuild/OXC customization: no custom Vite transform or compiler options in the Vitest configs. The local risk is the optimizer surface above, not custom esbuild/OXC options.
- Lightning CSS: no Vite CSS pipeline customization; production CSS is still handled through Next/Tailwind.
- CJS interop: no custom Vite dependency interop configuration.
- `import.meta.hot` URL behavior: no HMR-specific application code under the test configs.
- `mainFields`: no custom Vite resolver `mainFields` usage.
- plugin-react Babel configuration: `react()` is called without options, and the repo does not configure plugin-react Babel transforms.
- React Compiler: not configured; plugin-react 6's `babel-plugin-react-compiler` peer is optional and not part of this upgrade.

The one local plugin-react call site is intentionally minimal:

```ts
plugins: [react()],
```

That makes `pnpm test:browser` the load-bearing proof for the plugin-react 6 path.

---

## Required Remediation

Land one manual source-of-truth PR that supersedes Dependabot #386 and #387:

1. Update `package.json`:
   - `vite: "7.3.3"` -> `"8.0.14"`; keep the exact pin style.
   - `@vitejs/plugin-react: "^5.2.0"` -> `"^6.0.2"`; keep the caret style.
2. Run `pnpm install` and commit the resulting `pnpm-lock.yaml` update.
3. Install no new packages for plugin-react's optional peers.
4. Confirm dependency resolution with `pnpm ls vite @vitejs/plugin-react vitest`:
   - `vite@8.0.14`
   - `@vitejs/plugin-react@6.0.2`
   - `vitest@4.1.7`
   - no unmet peer warnings
5. Run the full local gate under Node 24 with the integration database prepared. Node 22.22.1 satisfies Vite 8's engine floor (`>=22.12`), but CI explicitly uses Node 24, so switch to Node 24 before trusting a green local gate as CI-parity evidence:

```bash
pnpm db:test:up
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:migrate
SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:seed
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

6. Open a PR to `dev` titled `DEBT-407 — vite 8 + @vitejs/plugin-react 6 (coupled test-infra majors)`.
7. Close #386 and #387 as superseded by the coupled PR.
8. Require fresh CodeRabbit review on the latest head before merge.
9. Stop after CodeRabbit is clean and wait for the owner's explicit grade/GO before merging.

---

## Rollback

If the coupled PR exposes a real regression:

1. Revert the two dependency lines in `package.json`:
   - `vite` back to `"7.3.3"`
   - `@vitejs/plugin-react` back to `"^5.2.0"`
2. Run `pnpm install` to restore `pnpm-lock.yaml`.
3. Re-run the same full local gate.

No source-code rollback should be needed because the intended implementation is dependency metadata plus lockfile only.

If a regression is isolated to plugin-react 6's Browser Mode path rather than Vite 8 itself, first confirm whether a small plugin-react/Vite configuration adjustment is the correct remediation. For example, plugin-react 6's `@rolldown/plugin-babel` peer is optional and should remain uninstalled unless a concrete Browser Mode regression proves a Babel-backed transform is required.

---

## Acceptance Criteria

- The upgrade lands as one coupled PR, not as the two split Dependabot PRs.
- `package.json` pins `vite` to `8.0.14` and `@vitejs/plugin-react` to `^6.0.2`.
- `pnpm-lock.yaml` contains the corresponding lockfile changes and no unrelated churn.
- `pnpm ls vite @vitejs/plugin-react vitest` reports the expected versions with no unmet peer warnings.
- `pnpm test --run` passes, proving the Vitest transform path remains compatible.
- `pnpm test:browser` passes, proving the `@vitejs/plugin-react` `react()` Browser Mode path remains compatible.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:integration`, and `pnpm build` pass.
- Dependabot PRs #386 and #387 are closed as superseded.
- CodeRabbit has reviewed the latest head before merge.
- The owner has explicitly graded the PR ready before merge.
