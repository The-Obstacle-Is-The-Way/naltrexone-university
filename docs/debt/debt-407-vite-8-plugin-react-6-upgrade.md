# DEBT-407: Vite 8 + @vitejs/plugin-react 6 Coupled Test-Infra Upgrade

**Priority:** P2
**Created:** 2026-06-04
**Source:** Dependabot opened separate major-upgrade PRs for `vite` 7.3.3 -> 8.0.14 (#386) and `@vitejs/plugin-react` ^5.2.0 -> ^6.0.2 (#387). The plugin-react PR is red by itself because plugin-react 6 peers on Vite 8.
**Related:** [DEBT-403](../_archive/debt/debt-403-biome-245-lint-conformance.md), [DEBT-393](../_archive/debt/debt-393-dependabot-triage-and-config-hardening.md), [Testing Infrastructure](../dev/testing-infrastructure.md)

**Status:** Active

---

## Problem

Dependabot split a hard-coupled test-infrastructure upgrade into two independent PRs:

- [PR #386](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/386) bumps `vite` 7.3.3 -> 8.0.14. It is green and mergeable on its own because `@vitejs/plugin-react` 5.2.0 already allows Vite 8.
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

- #386 (`dependabot/npm_and_yarn/dev/vite-8.0.14`) is `CLEAN`; the `test` CI check succeeded.
- #387 (`dependabot/npm_and_yarn/dev/vitejs/plugin-react-6.0.2`) is `UNSTABLE`; the `test` CI check failed.

Package metadata spot-check:

- `@vitejs/plugin-react@6.0.2` has peer dependency `vite: ^8.0.0`.
- `@vitejs/plugin-react@6.0.2` also declares optional peers `@rolldown/plugin-babel` and `babel-plugin-react-compiler`. They are optional and must not be installed unless the project explicitly adopts those features.
- `@vitejs/plugin-react@5.2.0` allows `vite: ^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`, explaining why the Vite-only PR can pass.
- `vitest@4.1.7` allows `vite: ^6.0.0 || ^7.0.0 || ^8.0.0` and supports the repo's Node 24 baseline.
- `vite@8.0.14` supports Node `^20.19.0 || >=22.12.0`; no Node/Vitest bump is required.

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
- Esbuild/OXC customization: no custom Vite transform or compiler options in the Vitest configs.
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
5. Run the full local gate under Node 24 with the integration database prepared:

```bash
pnpm db:test:up
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:migrate
SEED_INCLUDE_PLACEHOLDERS=true DATABASE_URL="postgresql://postgres:postgres@localhost:5434/addiction_boards_test" pnpm db:seed
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

6. Open a PR to `dev` titled `DEBT-407 — vite 8 + @vitejs/plugin-react 6 (coupled test-infra majors)`.
7. Close #386 and #387 as superseded by the coupled PR.
8. Require fresh CodeRabbit review on the latest head before merge.

---

## Rollback

If the coupled PR exposes a real regression:

1. Revert the two dependency lines in `package.json`:
   - `vite` back to `"7.3.3"`
   - `@vitejs/plugin-react` back to `"^5.2.0"`
2. Run `pnpm install` to restore `pnpm-lock.yaml`.
3. Re-run the same full local gate.

No source-code rollback should be needed because the intended implementation is dependency metadata plus lockfile only.

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
