# DEBT-460: Dependency Upgrade Train Residues (TS7 Dual-Compiler Seam, Clerk `createRouteMatcher` Deprecation, Biome Schema Pin Drift)

**Status:** Open
**Priority:** P4
**Date:** 2026-07-20
**Confirmed:** 2026-07-20 (each part verified against the installed packages and checked-in config on `dev`/`main` at `9f11e674`, promoted via PR #685 merge `b5fd6880`)

---

## Description

The 2026-07-20 dependency upgrade train (PRs #677, #679, #678, #680, #682; promoted to production via #685) landed green end-to-end, but left three residues. None changes current behavior; each is a future-facing hazard that should be tracked rather than rediscovered.

### Part 1 — TypeScript 7 dual-compiler seam (from #682)

PR #682 adopted the native TypeScript 7 compiler using Microsoft's side-by-side split, via two intentionally aliased `package.json` entries:

- `"@typescript/native": "npm:typescript@^7.0.2"` — the native (Go) compiler. It owns the **`tsc`** bin, so `pnpm typecheck` (`tsc --noEmit`) runs native TS7. Verified: `tsc --version` → `7.0.2`; full-repo `pnpm typecheck` completes in under a second, multi-core.
- `"typescript": "npm:@typescript/typescript6@^6.0.2"` — the JS TypeScript 6 compiler API, published by Microsoft with its bin renamed to **`tsc6`** precisely so it does not claim `tsc`. Anything that resolves the `typescript` package name gets this API: the repo's two compiler-API consumers (`src/adapters/controllers/controller-output-datetime-contract.test.ts` and `tests/architecture-boundary-source-scan.ts`, both `import ts from 'typescript'`), every third-party peer dependency declaring `typescript: '>=…'`, `next build`'s build-time type checking (no `ignoreBuildErrors` is set in `next.config`), and editor/tsserver tooling pointed at the workspace TypeScript.
- Version-reporting quirk: the shim package is `@typescript/typescript6@6.0.2` but its bundled compiler reports `Version 6.0.3`. Package version and compiler version are decoupled; do not "fix" one to match the other.

The residues:

1. **Two type-checking sources of truth.** `pnpm typecheck` (TS7 native) and `next build` (TS6 API) can, in principle, diverge on a construct one accepts and the other rejects, producing a confusing split (typecheck green, build red, or the reverse). No divergence exists today — both passed on the same tree — but the seam is now structural.
2. **Booby-trapped config.** The aliasing looks wrong to a reader who has not seen this doc (a dependency named `typescript` that is not TypeScript 7; a TS7 package hidden under `@typescript/native`). JSON forbids comments, so nothing at the definition site explains it. During the 2026-07-20 pre-merge review this was initially misread as a no-op/dead dependency; only checking out the branch, installing, and probing `node_modules/.bin/tsc` corrected the reading. A well-meaning "simplification" (collapsing the aliases, or repointing `typecheck` at a nonexistent `tsgo` bin) would silently revert type checking to TS6 or break it outright.
3. **Manual lockstep upgrades.** The two pins must be advanced deliberately and together. Dependabot's handling of `npm:`-aliased specifiers is a watch item: confirm on the next weekly run (Mondays 09:00 ET per `.github/dependabot.yml`) whether it proposes updates for either alias; if it does not, TypeScript upgrades are now a manual chore that no automation will nag about.

### Part 2 — Clerk `createRouteMatcher` deprecation (surfaced by #678)

#678 moved `@clerk/nextjs` 7.5.13 → 7.5.17 in the lockfile (an in-range bump; `package.json` was untouched for Clerk). The installed 7.5.17 marks the API deprecated at `node_modules/@clerk/nextjs/dist/types/server/routeMatcher.d.ts:16`:

> `@deprecated This function will be removed in the next major version. Use resource-based auth checks instead.`

Production call site: [`proxy.ts:192-196`](../../proxy.ts#L192-L196) — `createRouteMatcher(PUBLIC_ROUTE_PATTERNS)` inside the dynamically imported `clerkMiddleware` wiring. `proxy.test.ts` injects `createRouteMatcher` as a dependency in twelve test blocks, so the DI seam contract is part of the migration surface, not just the one production line.

Behavior is unchanged today. Clerk's migration guide (verified live 2026-07-20: <https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher>) recommends protecting each server-side resource individually (pages, Route Handlers, Server Functions) with `auth.protect()`-style checks instead of centralized middleware matching.

### Part 3 — Biome schema pin drift (from #679)

`biome.json:2` pins `"$schema": "https://biomejs.dev/schemas/2.5.0/schema.json"` while the installed CLI is 2.5.3 (#679). Biome reports this as an informational diagnostic only; lint results are unaffected. The cause is structural: Dependabot bumps the CLI in `package.json`/`pnpm-lock.yaml` but never edits `biome.json`, so the pin re-drifts on every Biome bump.

## Impact

- Part 1: future TS upgrades and any package-json refactor carry a silent-regression risk (type checking downgraded or split) that generic review will not catch without this context; editor diagnostics may not match `pnpm typecheck`.
- Part 2: a future `@clerk/nextjs` major bump (which the `npm-minor-and-patch` group excludes by update-type, so it will arrive as a standalone visible PR) will remove the API and break `proxy.ts` at build time. The failure mode is loud, but the migration is auth-touching and should be done deliberately, not under upgrade pressure.
- Part 3: cosmetic noise only; risk is that the informational diagnostic trains reviewers to ignore Biome output.

## Resolution

1. **Part 1 (standing rule, no code change now):** treat the two TypeScript aliases as one unit — advance both pins together, keep `typecheck` on bare `tsc`, and never collapse the aliases while the two compiler-API consumers remain on the TS6 surface. Exit criterion: when those consumers (and peer-dep tooling) can run on the TS7-era API, collapse back to a single `typescript` dependency and archive this part. Confirm Dependabot's aliased-specifier behavior on the next weekly run and note the outcome here.
2. **Part 2 (gated migration):** before accepting any `@clerk/nextjs` major bump, migrate `proxy.ts` off `createRouteMatcher` per Clerk's guide, updating the `proxy.test.ts` DI seam in the same change. This is the binding trigger; no action needed until then.
3. **Part 3 (fold into next Biome PR):** when reviewing the next Biome group PR, update the `$schema` URL in `biome.json` to the new version in the same PR (or run `biome migrate`). Optionally make that a standing checklist step for the `biome` Dependabot group.

## Verification

- Part 1: `node_modules/.bin/tsc --version` → 7.x; `node_modules/.bin/tsc6 --version` → 6.x; both TS-API consumer tests green; `pnpm typecheck` and `pnpm build` green on the same tree. After any future TS bump, re-run all four probes.
- Part 2: `git grep createRouteMatcher` returns no production hits (only historical docs); Clerk major bump builds green.
- Part 3: `biome.json` `$schema` version equals `biome --version`; Biome emits no schema-mismatch informational.

## Related

- PRs: [#677](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/677), [#678](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/678), [#679](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/679), [#680](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/680), [#682](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/682) (train), [#685](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/685) (promotion, merge `b5fd6880`)
- Precedent for grouped residue docs: [DEBT-457](./debt-457-wave2-determinacy-and-test-hygiene-residues.md); for Stripe-group isolation rationale: DEBT-393 (see `.github/dependabot.yml` comment)
- TS7/TS6 split announcement: <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
