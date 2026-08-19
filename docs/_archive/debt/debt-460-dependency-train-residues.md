# DEBT-460: Dependency Upgrade Train Residues (TS7 Dual-Compiler Seam, Clerk `createRouteMatcher` Deprecation, Biome Schema Pin Drift)

**Status:** Deferred / Parked (standing rules and one-dependency consolidation; de-alias candidate tracked in issue #813) — 2026-08-19
**Priority:** P4
**Date:** 2026-07-20
**Baseline confirmed:** 2026-07-20 (each part verified against the installed packages and checked-in config on `dev`/`main` at `9f11e674`, promoted via PR #685 merge `b5fd6880`)
**Latest update confirmed:** 2026-08-19 (PR #811 audit against `dev` at `4e05cca4` — de-alias experiment, enumerated consolidation blockers, and correction receipts; see "One-dependency consolidation checklist" below)

## Register final-wave disposition (2026-07-23)

This was the 2026-07-23 final-wave disposition: the three residues were durable
upgrade rules rather than current executable work, so this record was archived
for filing and represented by one Deferred/Parked register row. The 2026-08-19
audit subsequently separated a viable **de-alias candidate** from the still
blocked one-dependency consolidation; that candidate is tracked in issue #813. This
record remains parked and is not resolved:

1. advance both TypeScript pins together; consolidate to one TypeScript
   dependency only when the enumerated triggers in "One-dependency
   consolidation checklist" clear (third-party peer ranges are not among them);
   treat both aliases as a manual update surface because updater jobs skip aliases;
2. migrate `proxy.ts` off `createRouteMatcher` **before** accepting any
   `@clerk/nextjs` major bump; and
3. fold the `biome.json` `$schema` bump into every Biome Dependabot PR.

---

## Observed outcome (2026-08-17/18, PR #805 bundling PRs #799 + #800)

Merged PR #805 directly exercised Part 3 and exposed a new Part 1
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
that `ignoreBuildErrors` is not enabled. Changing either package topology will
therefore force the pin and its contract assertions to be reconsidered together.

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
verified to support the alias topology in CLI mode or the packages stop being
aliases through Cleanup A or the full one-dependency consolidation.
Re-enable/default to CLI mode and revise the compiler-mode regression test in
that same verified change; retain its no-build-bypass assertion.

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

## One-dependency consolidation checklist (2026-08-19)

This checklist defines what actually gates removing the dual-compiler seam.

Part 1's exit criterion ("when those consumers and peer-dep tooling can run on
the TS7-era API") is not evaluable as written: nobody reading it can tell
whether the day has arrived. It is enumerated here, measured against the
installed `typescript@7.0.2` (aliased `@typescript/native`) and
`@typescript/typescript6@6.0.2`. Re-measure with the probes given; do not
re-derive from memory.

### Not a blocker: third-party TypeScript peer ranges

The lockfile `packages` section carries **45 `typescript` peer declarations
across 42 distinct package names**. Exactly three names occur at two versions:
`@solana/codecs-core`, `@solana/codecs-numbers`, and `@solana/errors`. Every
name is an `@solana/*` package reaching the root transitively through
`@clerk/ui` (crypto-wallet auth support); an all-42-name `pnpm why --json` sweep
found no other root parent. There are no non-Solana `typescript` peers.

42 declarations ask for `>=5.4.0` and mark the peer **optional**
(`peerDependenciesMeta.typescript.optional: true`). The three required
declarations — `@solana/codecs-core@2.3.0`,
`@solana/codecs-numbers@2.3.0`, and `@solana/errors@2.3.0` — ask for
`>=5.3.3`. **`typescript@7.0.2` satisfies all 45 declared ranges.** A sweep of
the installed Solana JavaScript, TypeScript, and declaration sources also found
no quoted `typescript` module specifier. Finally, the current-`dev` Cleanup A
experiment below installed this graph, passed native typecheck and all targeted
tests, and built under Next's TS7 CLI.

**No current third-party TypeScript peer range blocks installing TypeScript 7
under its canonical name.** This is a peer-resolution finding, not blanket
proof that every third-party code path can consume the TS7 compiler API. Any
tool that loads that API still needs TypeScript 6 until it supports the new API;
Cleanup A must identify such tools and keep or configure their API dependency
accordingly. The current source sweep and executable experiment are supporting
evidence for this tree, not a substitute for that check or the full gate.

The original `grep "typescript: '>="` probe was range- and section-sensitive,
so use this section-aware census instead; inspect the emitted rows as well as
the three summary counts:

```bash
ts_peer_rows() {
  awk '
    function emit() {
      if (has_ts) print package_key "\t" range "\t" (optional ? "optional" : "required")
    }
    /^packages:$/ { in_packages = 1; next }
    /^snapshots:$/ { emit(); exit }
    in_packages && /^  [^ ]/ {
      emit(); package_key = $0; sub(/^  /, "", package_key); sub(/:$/, "", package_key)
      gsub(/^\047|\047$/, "", package_key)
      section = ""; meta_ts = 0; has_ts = 0; optional = 0; range = ""; next
    }
    in_packages && /^    peerDependencies:$/ { section = "peers"; next }
    in_packages && /^    peerDependenciesMeta:$/ { section = "meta"; next }
    in_packages && /^    [^ ]/ { section = ""; meta_ts = 0; next }
    section == "peers" && /^      typescript:/ { has_ts = 1; range = $2; next }
    section == "meta" && /^      typescript:$/ { meta_ts = 1; next }
    section == "meta" && /^      [^ ]/ { meta_ts = 0 }
    section == "meta" && meta_ts && /^        optional: true$/ { optional = 1 }
  ' pnpm-lock.yaml
}
ts_peer_rows                                                   # inspect every row/range/status
ts_peer_rows | wc -l                                           # 45 declarations
ts_peer_rows | cut -f1 | \
  sed -E -e 's/^(@[^@]+\/[^@]+)@.*/\1/' -e 's/^([^@]+)@.*/\1/' | \
  sort -u | wc -l                                         # 42 names
ts_peer_rows | awk -F '\t' '$3 == "optional" { n++ } END { print n + 0 }'  # 42 optional
```

### Blocker 1 (upstream, not ours): TS7 ships no stable compiler API

`typescript@7.0.2` maps its package-root export `"."` to
`"./lib/version.cjs"`. Evaluating that root returns the metadata object
`{ version: "7.0.2", versionMajorMinor: "7.0" }`, **not** a compiler API (the
earlier draft incorrectly called it a version string). Microsoft's TypeScript
7.0 announcement states that 7.0 does not ship with an API and expects a new,
different API in 7.1.

The installed package does expose implementation surfaces under deliberately
`unstable` subpaths, but they are neither stable nor classic-API-compatible:

- `./unstable/ast` exports AST types, enums, guards, scanner utilities, and
  visitor/factory machinery. It does **not** export the classic source-text
  parser `createSourceFile` or the free `forEachChild` helper. The same-named
  factory function in `./unstable/ast/factory` constructs a `SourceFile` from
  already-built nodes; it is not a text parser.
- `./unstable/sync` and `./unstable/async` export the new snapshot/project
  model (`API`, `Program`, `Checker`, `Symbol`, `Project`, `Emitter`). The new
  AST `Node` shape uses an instance `forEachChild` method.

Porting onto these surfaces means betting on an API upstream explicitly says
is not ready, and even the two parser-only consumers need more than an import
rewrite.

**Trigger:** TypeScript 7 publishes a stable, non-`unstable/` compiler-API entry
point. Probe — note it must target `@typescript/native`, **not** `typescript`,
because while the aliases stand the name `typescript` resolves to the TS6 shim
(which has no `exports` field at all, so probing it returns `undefined` and
tells you nothing):

```bash
node -e "console.log(require('@typescript/native'))"
node -e "console.log(JSON.stringify(require('@typescript/native/package.json').exports,null,1))"
```

After Cleanup A this probe targets `typescript` instead.

### Blocker 2 (ours): three files use the classic compiler API

| File | Surface used | Port difficulty |
| --- | --- | --- |
| `tests/architecture-boundary-source-scan.ts` | source-text parsing and AST traversal — `createSourceFile`, free `forEachChild`, `is*` guards, `SyntaxKind`, `ScriptTarget`, `ScriptKind` | medium — guards/enums map to `unstable/ast`, but parsing and free traversal do not; it likely needs a project/program-backed `SourceFile` and node-instance traversal |
| `src/adapters/controllers/controller-output-datetime-contract.test.ts` | source-text parsing and AST traversal — the same classic parser/traversal family plus type-node guards | medium — same missing parser/traversal seam; not a direct `unstable/ast` import swap |
| `tests/server-span-family-boundary.test.ts` | **full program/type layer** plus classic parsing — `createProgram`, `createCompilerHost`, `TypeChecker`, `CompilerOptions`, `ModuleKind`, `createSourceFile` | hard — needs the new snapshot/project `API`/`Program`/`Checker` model and a replacement for the custom compiler-host path |

The 2026-08-19 export probe that corrected the first two classifications:

```bash
node -e "const a=require('@typescript/native/unstable/ast'); console.log({createSourceFile:typeof a.createSourceFile,forEachChild:typeof a.forEachChild})"
# { createSourceFile: 'undefined', forEachChild: 'undefined' }
```

**Trigger:** all three run on a supported TS7-era API. A green behavior suite is
not sufficient by itself: today it runs against the TS6 shim. First census all
three TypeScript package names, including subpaths, and inspect every hit:

```bash
rg -n \
  -e "['\"](?:typescript|@typescript/typescript6|@typescript/native)(?:/[^'\"]*)?['\"]" \
  -e '`(?:typescript|@typescript/typescript6|@typescript/native)(?:/[^`]*)?`' \
  src tests
```

The expected topology distinguishes the two cleanups:

- current aliases: exactly three bare `typescript` imports, resolving to
  `@typescript/typescript6@6.0.2`; Blocker 2 remains;
- Cleanup A: exactly three `@typescript/typescript6` imports; Blocker 2 still
  remains; and
- Cleanup B: no `@typescript/typescript6`, `@typescript/native`, or
  `unstable/` import remains. Each consumer targets a published stable entry
  point in the canonical `typescript` package.

For Cleanup B, make package identity part of the gate before running the actual
three-path behavior suite. This assertion intentionally fails on today's alias
topology; after consolidation it must print a canonical TypeScript 7-or-newer
manifest path and version. The source-scan helper is exercised by
`architecture-boundaries.test.ts` and is not itself a test file:

```bash
node - <<'NODE' &&
const manifest = 'typescript/package.json';
const resolved = require.resolve(manifest);
const { name, version } = require(manifest);
if (name !== 'typescript' || Number.parseInt(version, 10) < 7) {
  throw new Error(
    `Expected canonical TypeScript 7+ API, got ${name}@${version} at ${resolved}`,
  );
}
console.log({ resolved, name, version });
NODE
pnpm test --run tests/architecture-boundaries.test.ts \
  src/adapters/controllers/controller-output-datetime-contract.test.ts \
  tests/server-span-family-boundary.test.ts                         # 18 tests
```

### Blocker 3 (independent of TS6-vs-TS7): the Next config pin

`next.config.ts`'s `experimental.useTypeScriptCli: false` is gated on the
**name** `typescript` resolving to a package whose bin is not `tsc` — not on
which TypeScript major is in use. It therefore clears by *either* route below,
and does not have to wait for Blockers 1 and 2.

**Trigger:** Next ships [PR #97334](https://github.com/vercel/next.js/pull/97334)
in a released version (re-verified open and still draft on 2026-08-19), **or**
the aliases stop being aliases. For the Next-release route, install that
released version and temporarily set `useTypeScriptCli: true` while retaining
the current alias topology; every supported production build mode must pass
before the config pin is removed. For the de-alias route, run the same gate with
the real package names and no pin. The current checked-in production path is
`pnpm build` (Turbopack by default). If Webpack is a supported build/deployment
path at implementation time, also require `pnpm exec next build --webpack`
because #97015 is Webpack-specific. In either route, revise rather than delete
the config test: remove the obsolete alias/pin assertions while retaining the
`ignoreBuildErrors !== true` guard and the unrelated security-header test.

Release status was tested rather than inferred from the PR alone. Next 16.3.1
was npm-latest on 2026-08-19 but still inside this repo's seven-day
`minimumReleaseAge` window. A detached diagnostic install that temporarily
lifted only that maturity policy, retained the aliases, and enabled CLI mode
reproduced the same false missing-`typescript` failure under 16.3.1. No released
fix was available on the audit date.

The 2026-08-19 audit also tried the full app with
`pnpm exec next build --webpack`. With the current pin, Webpack compiled the
bundles and entered type checking, then failed for an unrelated existing Page
contract: `app/(app)/app/billing/page.tsx` exports `loadBillingData`. No
checked-in build or CI command selects Webpack. An unconditional Webpack gate
would therefore conflate an unsupported-mode defect with this alias decision;
keep it conditional on Webpack becoming an intentional project mode.

### The two cleanups are not the same change

- **Cleanup A — de-alias.** A viable current-`dev` candidate, tracked in
  [issue #813](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/813).
  Install both packages under their real published names: `typescript` → real
  `typescript@7`, `@typescript/typescript6` → real `@typescript/typescript6`.
  Rewrite the three imports above to `from '@typescript/typescript6'`, drop the
  Next pin, and replace the alias-specific config assertions with a real-name
  topology plus no-build-bypass contract. This clears Blocker 3 and removes the
  npm-alias booby-trap while still shipping two TypeScript packages.

  The 2026-08-19 audit reproduced this topology against current
  `origin/dev@4e05cca4`: `pnpm install`, native `pnpm typecheck`, `pnpm lint`
  (1,148 files, zero warnings), all 18 targeted API-consumer tests against the
  explicit TS6 package, and the Next 16.3.0 production build in default CLI
  mode passed. That receipt covers the checked-in Turbopack path, not Webpack.
  `pnpm peers check` showed
  only the same pre-existing `ws@7.5.13` / `utf-8-validate@6.0.6` mismatch as
  the aliased tree, with no TypeScript peer failure. The mechanical footprint
  was seven files total, including 702 changed lockfile lines.

  Before implementation, repeat the dependency-source/API-loading census and
  route any third-party compiler-API consumer to TypeScript 6 where the tool
  supports it; if a required tool can only load the canonical `typescript`
  package, the aliases must remain. A frozen install and the full repository
  gate are acceptance criteria, not optional follow-up evidence.

  It was **not** adopted in PR #805 because Microsoft's published TS7 migration
  guidance uses the current alias shape so legacy API consumers can keep
  resolving `typescript`, and because the change touches peer resolution,
  three source imports, config tests, and the lockfile surface — too wide for a
  dependency-bundle PR.
- **Cleanup B — consolidate to one TypeScript dependency (blocked).** Requires
  Blocker 1 *and* Blocker 2 to clear. This is the Part 1 exit criterion proper.

Choosing Cleanup A is a standalone decision that does not require waiting for
anything upstream.

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
2. **Booby-trapped config.** The aliasing looks wrong to a reader who has not seen this doc (a dependency named `typescript` that is not TypeScript 7; a TS7 package hidden under `@typescript/native`). JSON forbids comments, so nothing at the definition site explains it. During the 2026-07-20 pre-merge review this was initially misread as a no-op/dead dependency; only checking out the branch, installing, and probing `node_modules/.bin/tsc` corrected the reading. A well-meaning "simplification" (consolidating to one package before the API consumers are ready, or repointing `typecheck` at a nonexistent `tsgo` bin) would silently revert type checking to TS6 or break it outright.
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

1. **Part 1 (standing rule plus tracked cleanup):** while the aliases remain,
   treat them as one unit — advance both pins together, keep `typecheck` on bare
   `tsc`, and do not mistake a package-root version object for a compiler API.
   Cleanup A is a viable candidate tracked in issue #813. Consolidation to one
   dependency still uses the enumerated triggers in "One-dependency
   consolidation checklist" above; do not restate it as the unevaluable "when
   consumers can run on the TS7-era API". Third-party TypeScript peer ranges
   are **not** part of that consolidation criterion; the 2026-08-19 census
   clears the ranges, while the source sweep, current-`dev` de-alias experiment,
   and required full gate check actual compatibility. Dependabot's updater
   behavior is confirmed from its implementation record above; do not use an
   unchanged PR as evidence unless a newer eligible alias target existed during
   that run.
2. **Part 2 (gated migration):** before accepting any `@clerk/nextjs` major bump, migrate `proxy.ts` off `createRouteMatcher` per Clerk's guide, updating the `proxy.test.ts` DI seam in the same change. This is the binding trigger; no action needed until then.
3. **Part 3 (fold into next Biome PR):** when reviewing the next Biome group PR, update the `$schema` URL in `biome.json` to the new version in the same PR (or run `biome migrate`). Optionally make that a standing checklist step for the `biome` Dependabot group.

## Verification

- Part 1: `node_modules/.bin/tsc --version` → 7.x;
  `node_modules/.bin/tsc6 --version` → 6.x; run the all-three-package import
  census from "Blocker 2" and verify its expected topology. For Cleanup B, the
  canonical package identity/version assertion must pass *before* the exact
  18-test three-path command. Also run the package-root/exports probes, the
  section-aware peer census, `pnpm typecheck`, and every supported production
  build mode on the same tree (`pnpm build` today; add
  `pnpm exec next build --webpack` only if Webpack is intentionally supported).
  After any future TS bump, re-run every probe group rather than inferring
  readiness from a package version.
- Part 2: `git grep createRouteMatcher` returns no production hits (only historical docs); Clerk major bump builds green.
- Part 3: `biome.json` `$schema` version equals `biome --version`; Biome emits no schema-mismatch informational.

## Related

- PRs: [#677](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/677), [#678](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/678), [#679](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/679), [#680](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/680), [#682](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/682) (train), [#685](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/685) (promotion, merge `b5fd6880`)
- Current bundle, audited checklist, and de-alias candidate: [PR #805](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/805), [PR #811](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/811), [issue #813](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/813)
- Upstream regression: [Next #96589](https://github.com/vercel/next.js/issues/96589), [Next #97015](https://github.com/vercel/next.js/issues/97015), [Next PR #97334](https://github.com/vercel/next.js/pull/97334)
- Dependabot alias evidence: [dependabot-core PR #15070](https://github.com/dependabot/dependabot-core/pull/15070), [dependabot-core issue #15847](https://github.com/dependabot/dependabot-core/issues/15847)
- Precedent for grouped residue docs: [DEBT-457](./debt-457-wave2-determinacy-and-test-hygiene-residues.md); for Stripe-group isolation rationale: DEBT-393 (see `.github/dependabot.yml` comment)
- TS7/TS6 split announcement: <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
