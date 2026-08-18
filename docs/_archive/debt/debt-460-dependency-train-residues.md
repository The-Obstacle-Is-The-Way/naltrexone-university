# DEBT-460: Dependency Upgrade Train Residues (TS7 Dual-Compiler Seam, Clerk `createRouteMatcher` Deprecation, Biome Schema Pin Drift)

**Status:** Deferred / Parked (standing rules; not resolved) — 2026-07-23
**Priority:** P4
**Date:** 2026-07-20
**Baseline confirmed:** 2026-07-20 (each part verified against the installed packages and checked-in config on `dev`/`main` at `9f11e674`, promoted via PR #685 merge `b5fd6880`)
**Latest update confirmed:** 2026-08-17/18 (PR #805 bundle — Part 1 residue 1 failure mode, Part 1 residue 3 evidence correction, and Part 3 fold-in; see "Observed outcome" below)

## Register final-wave disposition (2026-07-23)

All three residues are durable upgrade rules rather than current executable
work, so this record is archived for filing and represented by one
Deferred/Parked register row. This is not a resolution:

1. advance both TypeScript pins together; collapse them only when the three TS6
   compiler-API consumers and peer tooling can run on the TS7-era API; treat
   both aliases as a manual update surface because updater jobs skip aliases;
2. migrate `proxy.ts` off `createRouteMatcher` **before** accepting any
   `@clerk/nextjs` major bump; and
3. fold the `biome.json` `$schema` bump into every Biome Dependabot PR.

---

## Observed outcome (2026-08-17/18, PR #805 bundling PRs #799 + #800)

The proposed PR #805 bundle directly exercised Part 3 and exposed a new Part 1
failure mode. Its initial write-up also treated PR #799 as proof of residue 3;
the 2026-08-18 adversarial review corrected that inference below.

### Part 1 residue 3 — manual updates: upstream-confirmed; PR #799 inconclusive

PR #799 left both `npm:` aliases untouched, but that run did **not** prove they
were skipped: `typescript@7.0.2` and `@typescript/typescript6@6.0.2` were already
the newest stable releases available, so there was no update to propose. The
group's `*` pattern does not turn that no-op into an alias-handling experiment.

The standing conclusion is nevertheless confirmed by Dependabot's own
implementation record. [dependabot-core PR #15070](https://github.com/dependabot/dependabot-core/pull/15070)
says aliases are ignored in update jobs and deliberately enables dealiasing
only for dependency-graph work; [issue #15847](https://github.com/dependabot/dependabot-core/issues/15847)
tracks the resulting silent loss of version-update coverage. TypeScript alias
upgrades are therefore still a **manual lockstep chore**. Advance both pins
together by hand and re-run the probes in Verification.

### Part 1 residue 1 — the seam bit, in a form the residue did not predict

The residue anticipated divergence *between the two compilers* (a construct one
accepts and the other rejects). The actual first failure was a **resolution**
failure, not a type-judgement one, and it broke `next build` outright:

Next **16.3.0** flipped the default of `experimental.useTypeScriptCli` from
`false` to `true` (`dist/server/config-shared.js`; the value is the only
relevant change — `verify-typescript-setup.js`, `has-necessary-dependencies.js`
and `build/type-check.js` are byte-identical between 16.2.12 and 16.3.0). In
CLI mode Next requires the file `typescript/bin/tsc`; in API mode it requires
`typescript/lib/typescript.js`. The `@typescript/typescript6` shim ships
`lib/typescript.js` but renames its bin to **`tsc6` precisely so it does not
claim `tsc`** — the very property that makes the seam work. So CLI mode
reported the `typescript` package as missing and failed the build with the
misleading "It looks like you're trying to use TypeScript but do not have the
required package(s) installed."

Next's own escape hatch does not fire here: it probes for
`@typescript/native-preview`, whereas this repo aliases `@typescript/native`.
That escape hatch is also gated on `!useTypeScriptCli`, so it is unreachable in
CLI mode regardless of the package name.

**Resolution applied:** `next.config.ts` now pins
`experimental.useTypeScriptCli: false`, restoring API mode with an explanatory
comment at the definition site. This is the *anti*-booby-trap: it makes the
dependency explicit where JSON could not. Verified that type checking still
genuinely runs — a deliberately injected `const x: number = "string"` fails the
build with `Type error: Type 'string' is not assignable to type 'number'`, so
this is a mode pin and **not** an `ignoreBuildErrors`-style bypass.
`next.config.test.ts` now couples the two aliases to that config contract:
mutating the pin to `true` red-failed the targeted test (`expected true to be
false`), while the restored pin passed both config tests; the test also asserts
that `ignoreBuildErrors` is not enabled. Collapsing either alias will therefore
force the pin and its contract test to be reconsidered together.

Upstream independently reproduced this exact alias topology and missing-package
failure in [Next issue #96589](https://github.com/vercel/next.js/issues/96589).
[Next issue #97015](https://github.com/vercel/next.js/issues/97015) records a
second webpack-paths failure from the same resolver boundary. The prospective
fix, [Next PR #97334](https://github.com/vercel/next.js/pull/97334), explicitly
confirms that `useTypeScriptCli: false` avoids the regression; as of 2026-08-18
it remains a draft, unmerged PR and is not in a released Next version.

The adversarial review also tested the broader alternative in a detached
worktree: make TypeScript 7 the canonical `typescript` package, install the TS6
API under `@typescript/typescript6`, rewrite all three API imports, and remove
the Next pin. Native typecheck, the 18 targeted API-consumer tests, and a Next
build passed, so that topology is technically possible on this tree. It is not
the safer dependency-PR fix: [Microsoft's published TS7 migration guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
uses the current alias shape so legacy peers can continue importing
`typescript`, whereas the alternative changes peer resolution, three source
imports, and the lockfile surface before those peers support the TS7-era API.

**New standing rule:** the seam now has a third failure mode — a bundler or
tool that resolves the `typescript` **bin** rather than its **API** will break.
Remove the `next.config.ts` pin only when either a released Next version is
verified to support the alias topology in CLI mode or the aliases are collapsed
under the Part 1 exit criterion. Re-enable CLI mode and remove the regression
test in that same verified change.

### Part 3 — Biome `$schema` pin: folded in as required

`biome.json` `$schema` advanced 2.5.6 → 2.5.7 in the same PR as the
`@biomejs/biome` 2.5.6 → 2.5.7 bump, per the standing rule. `biome --version`
and the pinned schema version match exactly; Biome emits no schema-mismatch
informational.

### Part 2 — not triggered

`@clerk/nextjs` moved 7.6.4 → 7.7.1, a **minor** bump, so the
`createRouteMatcher` migration trigger (any *major*) has not fired. `proxy.ts`
is unchanged and the deprecation remains latent.

---

## Description

The 2026-07-20 dependency upgrade train (PRs #677, #679, #678, #680, #682; promoted to production via #685) landed green end-to-end, but left three residues. None changes current behavior; each is a future-facing hazard that should be tracked rather than rediscovered.

### Part 1 — TypeScript 7 dual-compiler seam (from #682)

PR #682 adopted the native TypeScript 7 compiler using Microsoft's side-by-side split, via two intentionally aliased `package.json` entries:

- `"@typescript/native": "npm:typescript@^7.0.2"` — the native (Go) compiler. It owns the **`tsc`** bin, so `pnpm typecheck` (`tsc --noEmit`) runs native TS7. Verified: `tsc --version` → `7.0.2`; full-repo `pnpm typecheck` completes in under a second, multi-core.
- `"typescript": "npm:@typescript/typescript6@^6.0.2"` — the JS TypeScript 6 compiler API, published by Microsoft with its bin renamed to **`tsc6`** precisely so it does not claim `tsc`. Anything that resolves the `typescript` package name gets this API: the repo's three compiler-API consumers (`src/adapters/controllers/controller-output-datetime-contract.test.ts`, `tests/architecture-boundary-source-scan.ts`, and `tests/server-span-family-boundary.test.ts`, all `import ts from 'typescript'`), every third-party peer dependency declaring `typescript: '>=…'`, `next build`'s build-time type checking (no `ignoreBuildErrors` is set in `next.config`), and editor/tsserver tooling pointed at the workspace TypeScript.
- Version-reporting quirk: the shim package is `@typescript/typescript6@6.0.2` but its bundled compiler reports `Version 6.0.3`. Package version and compiler version are decoupled; do not "fix" one to match the other.

The residues:

1. **Two type-checking sources of truth.** `pnpm typecheck` (TS7 native) and `next build` (TS6 API) can, in principle, diverge on a construct one accepts and the other rejects, producing a confusing split (typecheck green, build red, or the reverse). No divergence exists today — both passed on the same tree — but the seam is now structural.
2. **Booby-trapped config.** The aliasing looks wrong to a reader who has not seen this doc (a dependency named `typescript` that is not TypeScript 7; a TS7 package hidden under `@typescript/native`). JSON forbids comments, so nothing at the definition site explains it. During the 2026-07-20 pre-merge review this was initially misread as a no-op/dead dependency; only checking out the branch, installing, and probing `node_modules/.bin/tsc` corrected the reading. A well-meaning "simplification" (collapsing the aliases, or repointing `typecheck` at a nonexistent `tsgo` bin) would silently revert type checking to TS6 or break it outright.
3. **Manual lockstep upgrades.** The two pins must be advanced deliberately and together. Dependabot version-update jobs ignore `npm:`-aliased specifiers (see the implementation evidence in the observed outcome), so TypeScript upgrades are a manual chore that no automation will nag about. An unchanged weekly PR is not evidence by itself unless a newer eligible alias target existed during that run.

### Part 2 — Clerk `createRouteMatcher` deprecation (surfaced by #678)

PR `#678` moved `@clerk/nextjs` 7.5.13 → 7.5.17 in the lockfile (an in-range bump; `package.json` was untouched for Clerk). The installed 7.5.17 marks the API deprecated at `node_modules/@clerk/nextjs/dist/types/server/routeMatcher.d.ts:16`:

> `@deprecated This function will be removed in the next major version. Use resource-based auth checks instead.`

Production call site: [`proxy.ts:192-196`](../../../proxy.ts#L192-L196) — `createRouteMatcher(PUBLIC_ROUTE_PATTERNS)` inside the dynamically imported `clerkMiddleware` wiring. `proxy.test.ts` injects `createRouteMatcher` as a dependency in twelve test blocks, so the DI seam contract is part of the migration surface, not just the one production line.

Behavior is unchanged today. Clerk's migration guide (verified live 2026-07-20: <https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher>) recommends protecting each server-side resource individually (pages, Route Handlers, Server Functions) with `auth.protect()`-style checks instead of centralized middleware matching.

### Part 3 — Biome schema pin drift (from #679)

`biome.json:2` pins `"$schema": "https://biomejs.dev/schemas/2.5.0/schema.json"` while the installed CLI is 2.5.3 (#679). Biome reports this as an informational diagnostic only; lint results are unaffected. The cause is structural: Dependabot bumps the CLI in `package.json`/`pnpm-lock.yaml` but never edits `biome.json`, so the pin re-drifts on every Biome bump.

## Impact

- Part 1: future TS upgrades and any package-json refactor carry a silent-regression risk (type checking downgraded or split) that generic review will not catch without this context; editor diagnostics may not match `pnpm typecheck`.
- Part 2: a future `@clerk/nextjs` major bump (which the `npm-minor-and-patch` group excludes by update-type, so it will arrive as a standalone visible PR) will remove the API and break `proxy.ts` at build time. The failure mode is loud, but the migration is auth-touching and should be done deliberately, not under upgrade pressure.
- Part 3: cosmetic noise only; risk is that the informational diagnostic trains reviewers to ignore Biome output.

## Resolution

1. **Part 1 (standing rule, no code change now):** treat the two TypeScript aliases as one unit — advance both pins together, keep `typecheck` on bare `tsc`, and never collapse the aliases while the three compiler-API consumers remain on the TS6 surface. Exit criterion: when those consumers (and peer-dep tooling) can run on the TS7-era API, collapse back to a single `typescript` dependency. Dependabot's updater behavior is confirmed from its implementation record above; do not use an unchanged PR as evidence unless a newer eligible alias target existed during that run.
2. **Part 2 (gated migration):** before accepting any `@clerk/nextjs` major bump, migrate `proxy.ts` off `createRouteMatcher` per Clerk's guide, updating the `proxy.test.ts` DI seam in the same change. This is the binding trigger; no action needed until then.
3. **Part 3 (fold into next Biome PR):** when reviewing the next Biome group PR, update the `$schema` URL in `biome.json` to the new version in the same PR (or run `biome migrate`). Optionally make that a standing checklist step for the `biome` Dependabot group.

## Verification

- Part 1: `node_modules/.bin/tsc --version` → 7.x; `node_modules/.bin/tsc6 --version` → 6.x; all three TS-API consumer paths green; `pnpm typecheck` and `pnpm build` green on the same tree. After any future TS bump, re-run all four probe groups.
- Part 2: `git grep createRouteMatcher` returns no production hits (only historical docs); Clerk major bump builds green.
- Part 3: `biome.json` `$schema` version equals `biome --version`; Biome emits no schema-mismatch informational.

## Related

- PRs: [#677](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/677), [#678](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/678), [#679](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/679), [#680](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/680), [#682](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/682) (train), [#685](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/685) (promotion, merge `b5fd6880`)
- Current bundle and upstream regression: [PR #805](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/805), [Next #96589](https://github.com/vercel/next.js/issues/96589), [Next #97015](https://github.com/vercel/next.js/issues/97015), [Next PR #97334](https://github.com/vercel/next.js/pull/97334)
- Dependabot alias evidence: [dependabot-core PR #15070](https://github.com/dependabot/dependabot-core/pull/15070), [dependabot-core issue #15847](https://github.com/dependabot/dependabot-core/issues/15847)
- Precedent for grouped residue docs: [DEBT-457](./debt-457-wave2-determinacy-and-test-hygiene-residues.md); for Stripe-group isolation rationale: DEBT-393 (see `.github/dependabot.yml` comment)
- TS7/TS6 split announcement: <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
