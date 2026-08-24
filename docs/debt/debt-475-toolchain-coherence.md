# DEBT-475: Toolchain Coherence — Scars, Scaffolding, and the Ruling That Went Stale

**Status:** Open
**Priority:** P2
**Date:** 2026-08-24
**Source:** Owner question while [DEBT-473](./debt-473-green-without-evidence.md) was under review: is the dev toolchain "battle scars" that fix real incidents, or "ad hoc patchwork" that an agent fleet built around problems instead of removing them — and how would we tell the difference before deleting something load-bearing? Answered by a four-slice read-only census at `dev` `5a095f12` that traced 66 mechanisms (scripts, wrappers, policy scans, ratchets, hooks, configs) to their introducing commit and the debt or bug document that motivated each, then asked of every one: is that problem still real, what depends on it, and what simpler primitive would do the same job. Every number below that the census produced was re-executed by the filer at `5a095f12` before filing; four census file paths were wrong and are corrected here.

**The answer, in one line:** ~70% earned, ~30% scaffolding — and the scaffolding has three traceable causes, none of which is "agents invent nonsense."

## Description

### What is earned (and must not be deleted)

These trace to incidents the current tree still permits. They are listed first because the owner's fear — deleting a scar — is the correct fear, and the census's first job was to name what stays:

| Mechanism | Incident it fixes | Still reachable today because |
| --- | --- | --- |
| DB target guard + `DB_TARGET_ACK` (`scripts/database-target.ts`, `database-command.ts`) | [DEBT-240](../_archive/debt/debt-240-local-dev-database-url-points-to-production.md): `.env.local` pointed at production Neon; [DEBT-446](../_archive/debt/debt-446-local-db-script-target-guards.md) | `drizzle.config.ts:6-7` still falls back to `.env.local`; drizzle-kit 0.31.8 has no target guard |
| Per-clone test target resolver (`scripts/resolve-local-test-target.ts`) | [DEBT-417](../_archive/debt/debt-417-multi-clone-local-test-infrastructure-isolation.md): a fixed port made `lsof … kill -9` kill a foreign server; duplicate container names risked cross-clone data corruption | `docker-compose.yml:13` still maps `${DB_TEST_PORT:-5434}`; the owner runs multiple clones |
| Migration ledger verifier (`scripts/migration-ledger.ts`, `verify-migration-ledger.ts`) | BUG-240/241 production outage (migrations never applied); DEBT-391, DEBT-442, DEBT-445 | `vercel.json` migrates at build; drizzle-kit has no drift command |
| Seed answer-key guard (`scripts/seed/question-syncer.ts:73-100`), wrong-answer-heading rejection (`question-parser.ts:57-61`), choice-reference guard (`seed-helpers.ts:63-67`) | BUG-281 (production-verified: re-import rewrote `is_correct` under graded history); DEBT-338 (verified live corruption); DEBT-111 | 948 imported MDX files are re-seeded on every environment |
| E2E credential health check (`tests/e2e/helpers/credential-health-check.ts`) | DEBT-243 (credential drift), DEBT-391/442 (schema drift behind `.env.local`) | one shared E2E user, one shared Stripe test account |
| Owner namespace (`E2E_STRIPE_OWNER`, `seed-test-user.ts`) | DEBT-384 (46% webhook error rate), [DEBT-386](../_archive/debt/debt-386-e2e-stripe-customer-ownership-drift-webhook-500s.md) (cross-database rebind → 500 → retry loop) | every lane shares one Stripe test account |
| Deterministic E2E state reset (`reset-e2e-user-state.ts`, `e2e-reset-shared.ts`) | DEBT-244, DEBT-293 (CI run `22852148955`), DEBT-411 | `workers: 1`, shared user |
| Fixture UUID integrity test (`tests/shared/fixture-uuid-integrity.test.ts`) | [DEBT-400](../_archive/debt/debt-400-test-fixture-integrity-zod-boundary.md): Zod 4 changed UUID validation and broke boundary fixtures | ids are strings; TypeScript cannot check them |
| Theme-token **render** tests (`components/theme-token-regression.test.tsx:352-697`) | DEBT-108 (shipped unreadable dark-mode buttons), BUG-151/DEBT-279 (WCAG), DEBT-313 | tokens are strings in class attributes |
| Chromium installer bound (`scripts/ci/install-playwright-chromium.sh`, `ci.yml:121`) | DEBT-471 F2: a 56-minute silent install hang on run `32298458967` | runner-image mirror behavior is outside the repo |
| Playwright lane pins (`tests/playwright-lane-policy.test.ts:72-135`) | DEBT-471 F1 (Stripe hosted-DOM change reddened a docs PR), DEBT-205 (same, February) | Stripe documents Checkout as un-automatable |
| Vitest timeouts, `fileParallelism: false`, `optimizeDeps` list | DEBT-225 (cold-import flakes), DEBT-333, taxonomy-census race (`vitest.integration.config.mts:10-13`), DEBT-368 (Vite reloads mid-suite) | same runtime |
| Supply-chain policy (`pnpm-workspace.yaml`: `strictDepBuilds`, `allowBuilds`, overrides, cooldown) | [DEBT-394](../_archive/debt/debt-394-supply-chain-hardening.md) | pnpm 11.3.0 |
| Node-version hook (`.husky/check-node-version.sh`) | DEBT-394 PR1: a stale global husky init loaded nvm without `nvm use` | machine-local, still true |
| Draft-question importer, feedback exporter, seed environment fence | DEBT-102, DEBT-338, BUG-250 (formula injection), DEBT-446 | live content pipeline |

Everything in the rest of this document is judged against that list: a change that weakens any row above is out of scope.

### F1 — A correct June ruling became the cause of ~1,400 LOC of hand-written lint rules

[AUDIT-012](../_archive/audits/audit-012-repo-org-devx.md) (2026-06-13) locked a principle at `:57`: "the primary contributor is an AI-agent fleet, and the repo's revealed strategy is executable, no-new-dependency guardrails over convention," and at `:59` ruled for ARCH-1: "custom Vitest import-boundary test. Do NOT add `dependency-cruiser`." That was right for June. It was never re-asked when the tool the repository already depends on caught up. Biome 2.5.8 (installed; `node_modules/@biomejs/biome/configuration_schema.json`) ships `noRestrictedImports` with path patterns and per-directory overrides, `useFilenamingConvention`, `noRestrictedElements`, `noExcessiveLinesPerFile`, and `noImportCycles`. Five hand-written scanners re-implement them:

| Scanner | LOC | Property | Biome equivalent | Bypass the census found |
| --- | --- | --- | --- | --- |
| `tests/architecture-boundary-source-scan.ts` + test | 604 | layer import bans; kebab-case filenames; hook placement | `noRestrictedImports` overrides; `useFilenamingConvention` (hook placement has no lint equivalent — 20 lines) | `import(\`zod\`)` template literal (`:287` requires `isStringLiteral`); `require()` never parsed; `lib/` and `db/` not importer-scanned (`:17-23`) |
| `tests/server-span-family-boundary.test.ts` | 469 (own glob + `createProgram` + type checker) | six `Sentry.startSpan` sites use projected attributes | a typed `startServerSpan()` wrapper + `noRestrictedImports` on `@sentry/nextjs#startSpan`; DEBT-462 recorded **zero** spans existed when the guard was written | `startInactiveSpan`, `startSpanManual`, `withActiveSpan`, `setContext/setTag/setExtra` all escape (`:384-387` pre-filters on the substring `startSpan`) |
| `components/theme-token-regression-source-scan.ts`, raw-`<button>` half | ~150 | no raw `<button>` outside `components/ui/` | `noRestrictedElements` | `React.createElement('button')`; template-literal class strings (`:37-38` line regex) |
| `scripts/check-file-size.sh` + test | 194 | production files ≤ 350 lines, 14 exemptions | `noExcessiveLinesPerFile` production override (already used for tests at 800) | **it cannot fail**: unconditional `exit 0` at `:133`; ten non-exempt production files exceed 350 today (`stripe-webhook-controller.ts` 827, `use-practice-session-page-model.ts` 576, `stripe-webhook-processor.ts` 500, `question-flow-actions.ts` 426, `lib/container/use-cases.ts` 420, `finalize-exam-answers.ts` 403, `drizzle-renewal-notice-delivery-repository.ts` 399, `reconcile-stripe-subscriptions.ts` 392, `practice-session-page-model.browser.probes.tsx` 361, `with-idempotency.ts` 351); its own test proves only that two exempt files print nothing |
| Biome `noExcessiveLinesPerFile` test override at 800 (`biome.json:41-53`) | 12 + 28 suppressions | test files ≤ 800 lines | it *is* the primitive | 28 of 28 over-limit files (34,090 LOC, 21.5% of the test estate) carry a `biome-ignore … DEBT-469`; a rule with a 100% suppression rate fails only on the 29th file |

The opacity-scale half of the theme scan (`:42-87`) has no lint equivalent and stays.

### F2 — Build-around instead of fix, with the receipts that show the primitive arrived and the workaround stayed

- `scripts/local-test-db.ts` + `scripts/ensure-local-test-db.ts` + test (**575 LOC**, one caller: `e2e-local-orchestrator.ts:73`). Both branches of `ensureLocalTestDatabase` (`:50-64`, `:66-78`) run `docker compose … up -d --wait db` and then a 60×1 s `docker inspect` poll (`:100-130`). The poll predates `--wait` (`06671f7b`, DEBT-411 PR-B); `be50dda7` (DEBT-417) added `--wait` and kept the poll. `scripts/run-local-test-db.ts:41,68` already issues the identical `--wait` command with the same resolver-scoped project name. Compose v5.4.0: `--wait  Wait for services to be running|healthy`.
- `scripts/run-trial-clock-smoke.ts` process management (~125 prod + 254 test LOC, 16 of 44 cases): DEBT-473 step 4 owns the slimming; recorded here as the pattern's clearest instance.
- `ci.yml:143-195` "Validate E2E credential inputs" (53 lines of bash): a second copy of `credential-health-check.ts:80-123`'s required-variable and dummy checks; the Playwright `setup` project already fails closed on every listed condition (DEBT-473 F8); the step runs after `Build`, so it saves only `pnpm start` and a Playwright boot.
- `credential-health-check.ts:185-215` `verifyIdempotencySchema` checks one column of one table immediately after `verifyMigrationLedger` (`:450-451`) has verified the entire ledger with content hashes.
- `tests/shared/subscription-repository-contract-coverage.test.ts` (14 LOC) asserts that a five-element const equals its own literal; the compile-time check at `subscription-observation-version-contract.ts:21-24` already fails on an omitted method.
- `scripts/seed-all-environments.sh` (8 lines) is `exec pnpm exec tsx scripts/seed-all-environments.ts "$@"`; it survives because `seed-all-environments.test.ts:133-137` pins the bash path. `scripts/seed-production.ts` and `scripts/seed-all-environments.ts` are 33-line twins differing only in which runner they import.
- `scripts/crap-report.ts:588-662` (~75 LOC) re-validates Istanbul JSON shape that `istanbul-lib-coverage.createCoverageMap` already rejects; `:500-517` hand-rolls `--k=v` parsing.

### F3 — Orphans kept alive by their own guards

- `tests/e2e/helpers/reset-bookmarks-for-e2e-user.ts` + two test files: **882 LOC, zero non-test importers.** Every reference in the tree is its own tests, three archived debt docs, and one line in `tests/architecture-boundary-source-scan.ts:83` — the filename allowlist of a scanner. Its job is a strict subset of `reset-e2e-user-state.ts:488-503,548-552`, which every bookmark spec already calls. Origin `108edadc` (DEBT-281, CI run `22782151850`); superseded when the reset helper absorbed it.
- `scripts/resolve-local-test-target.ts:18,82-86` `lockPath`: computed for every target; consumed only by its own test (`:70`). DEBT-417:112 records that the lock was rejected and never built.
- `tests/shared/resolve-integration-database-url.ts` (133 LOC with test): one consumer; `tests/integration/setup.ts:61` already refuses non-local hosts for every integration file.

### F4 — Five places decide "which database," and they disagree

URL-producing sources: `scripts/resolve-local-test-target.ts:47-88` (cwd-hash → `127.0.0.1:55400+offset`); `scripts/seed-environment-runtime.ts:42-64` (`.env.local` + `npx vercel env pull`); `scripts/export-question-feedback.ts:8-9,194` (dotenv `.env.local`, no guard); `drizzle.config.ts:6-12` (dotenv fallback for raw `db:generate`); `.env.test` + `docker-compose.yml:13` (raw `localhost:5434`). Guards and deciders on top of them: `database-target.ts:20-28,104-110`, `internal/database-target-managed.ts`, `run-local-integration.ts:26-31`, `e2e-local-orchestrator.ts:36-42`, `tests/integration/setup.ts:16-20,44-65` (duplicated in `helpers.ts:15-27`), `tests/shared/resolve-integration-database-url.ts:12-13,35-39`.

They disagree in four ways: three port conventions (5432 CI, 5434 raw fallback, 55400+hash resolver); two definitions of loopback (`127.0.0.2` is LOCAL at `database-target.ts:108` and REMOTE at `setup.ts:18`); `DATABASE_URL=<.env.test URL> pnpm test:integration` passes the wrapper and `setup.ts` but fails `db-connection-session.integration.test.ts` via the byte-equality resolver check; and the DEBT-446 fence — "the implicit dotenv fallback is refused" (`database-target.ts:24`) — is bypassed by `export:feedback` (which can export user IDs and comments from whatever `.env.local` names) and by raw `db:generate`. `seed-environment-runtime.ts:58-63` additionally shells `npx vercel env pull`; `vercel` is not in `package.json`, so `db:seed:all` and `db:seed:prod` fetch an unpinned CLI at run time, outside every gate DEBT-394 built. The two `CI`-inference fail-opens in this family are DEBT-473 F10.

### F5 — Two guards from DEBT-472, this week, are over-built and one has a live blind spot

Filed by the same author; recorded without softening.

- `tests/test-double-fidelity-*.ts` (eight files, **2,446 LOC**) runs as a `globalSetup` subprocess on every `vitest` invocation (`vitest.config.mts:17`; `LIVE_SCAN_PROCESS_TIMEOUT_MS = 30_000` because CI run `32659858531` exceeded the former 14 s bound). Measured at `5a095f12`: 8.65 s wall / 13.55 s CPU per `pnpm test`, and again on every `pre-push` hook. Its walk (`source-scan.ts:49-54`) covers only `*.test.*` / `*.spec.*`, so **`app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.setup.ts:32-43` holds three own-code factory-form `vi.mock` calls the 22/13 floor never counted.** Further escapes: `vi.mock(import('@/x'), …)` (`:314` requires a string literal), `import { vi as v }` (`:563` requires the identifier `vi`), angle-bracket casts (`:344` only `isAsExpression`); floors never shrink (`:393`). 396 of its lines test the scanner itself.
- `tests/fake-contract-register*.ts` (377 LOC) checks that 24 markdown rows have non-blank Verification and Known-divergences cells and that waiver rows contain a calendar date — a date that is **never compared to anything**, so the register's own rule ("any change to a waived fake's behavior … invalidates its dated waiver," `docs/dev/test-double-contract-register.md:78`) is unenforced. A fake named `InMemoryX` escapes (`:43` `startsWith('Fake')`).

### F6 — Guards that fight the tools, or the calendar

- `tests/playwright-lane-policy.test.ts:102` pins `@stripe/cli` to an exact version; the Dependabot patch bump 1.50.0→1.50.1 made run `32731488344` red ("expected '1.50.1' to be '1.50.0'") and had to be fixed by hand in #829. A guard whose only trigger is the dependency bot doing its job.
- `tests/security-txt.test.ts:24` asserts `Expires` is in the future; `public/.well-known/security.txt:4` is `2027-06-13`. The whole unit lane fails on that date.
- `tests/ci-workflow.test.ts:135-143` pins the hosted workflow's action SHAs and postgres digest but not required CI's (DEBT-474 F2).
- `.husky/pre-push` now pays the F5 subprocess on every push.

### F7 — Six TypeScript-compiler walkers, four different definitions of "production source"

`tests/architecture-boundary-source-scan.ts`, `tests/server-span-family-boundary.test.ts`, `tests/test-double-fidelity-source-scan.ts`, `tests/test-double-fidelity-port-double-scan.ts`, `tests/fake-contract-register-source-scan.ts`, `scripts/crap-report.ts` (plus `controller-output-datetime-contract.test.ts`) each build their own `createSourceFile`/`createProgram` walk with their own glob and ignore lists (`arch:17-37`, `span:8-20`, `theme:29-35`, `fidelity:49-62`). The blind spots are the difference between those lists: `lib/` in one, `.setup.ts` in another, `components/` in a third. One `tests/shared/source-walk.ts` exporting `readSources(kind)` and `forEachNode()` would replace ~250 LOC and, more importantly, give the exclusion list one owner.

### F8 — Misplaced and redundant checks on the CI path

- `ci.yml:138-141` validates the GitHub Actions copy of `CRON_SECRET` for header safety; no cron reads that copy. [BUG-244](../_archive/bugs/bug-244-reconciliation-cron-never-scheduled.md)'s incident lived in Vercel scopes; `lib/env.ts:79` — where the value is consumed — has no refine. Owned by DEBT-474 step 3.
- Four "is the database up" checks on the local E2E path (Compose `--wait`, the F2 inspect poll, `setup.ts` `SELECT 1`, the health check's connectivity probe); the ledger is verified at Vercel build and again at every E2E start (intentional — different databases).

### What the census did not find

- No mechanism on the earned list has a simpler primitive that covers its incident.
- Zero `package.json` scripts are invoked by nothing; the weakest (`db:seed:prod`, `quality:crap`, `local:test:target`, `export:feedback`) are documented but have no workflow or script caller.
- The seed format migration is complete: zero imported MDX files contain the old "Why other answers are wrong" form; the parser's rejection is now a regression fence and cheap to keep.
- The tj-actions-class exposure (job-scoped secrets, mutable tags) is DEBT-474, not this debt.

## Impact

1. **Trust tax on every run:** 8.65 s of scanner per `pnpm test` and per push, for a scan with a live blind spot (F5).
2. **Dead code kept alive by guards** (F3): 882 + 575 + 133 LOC whose only dependents are their own tests and a scanner allowlist.
3. **A fence with holes** (F4): the DEBT-446 target guard is bypassed by two entry points, one of which exports PII; five resolvers disagree on what "local" means.
4. **Lint rules written by hand** (F1): ~1,400 LOC that Biome config replaces, each with a bypass the config version would not have.
5. **Guards that will red the lane for non-defects** (F6): a version pin and a calendar date.

## Resolution

Ordered so that deletions come first (they carry no design risk), migrations second, and consolidation last. Each step lands with a red test for the property it keeps, per DEBT-473 F9, and the full gate must be green with **no behavior change** — this debt deletes and moves; it does not alter what any lane proves.

1. **[ ] Delete the orphans and the duplicate Docker layer.** Remove `reset-bookmarks-for-e2e-user.ts` + its two tests + the `architecture-boundary-source-scan.ts:83` allowlist line; `local-test-db.ts`, `ensure-local-test-db.ts`, `local-test-db.test.ts` (orchestrator step 1 → `run-local-test-db.ts`'s `up` plan); `resolve-integration-database-url.ts` (inline the five-line check in its one consumer); `lockPath`; `seed-all-environments.sh` and its pin test (`db:seed:all` → `tsx scripts/seed-all-environments.ts`); merge `seed-production.ts` into `seed-all-environments.ts` behind a `--production` flag that preserves DEBT-446 §3a's separate-consent rule; `subscription-repository-contract-coverage.test.ts`; `verifyIdempotencySchema` and its tests; the `ci.yml:143-195` bash validator (DEBT-473 step 3 owns the CI edit). Red-first: a grep test that each deleted path has zero importers before deletion.
2. **[ ] Migrate the hand-written lint rules to Biome.** `noRestrictedImports` overrides per layer (replacing the arch scan's import half; keep a 20-line hook-placement test), `useFilenamingConvention`, `noRestrictedElements` for raw `<button>` (keep the opacity scan), `noExcessiveLinesPerFile` production override at 350 with `biome-ignore-all` on the fourteen recorded exemptions (delete `check-file-size.sh`, its test, and the lint-staged entry). Red-first: each Biome rule must first fail on a scratch file that the corresponding scanner's known bypass (F1 table) let through. Then the ruling: append to AUDIT-012's archived record a dated note that the "no new dependency" principle is satisfied by Biome config, so the next agent does not re-derive a scanner.
3. **[ ] Reduce the DEBT-472 scanners to what they prove.** Move the fidelity scan from `globalSetup` to a CI lint script (`pnpm lint:doubles`, run in `ci.yml` beside Biome) so `pnpm test` and `pre-push` stop paying 8.65 s; widen its walk to `*.setup.ts` and `*-test-helpers.*` and raise the own-code factory floor to include the three `practice-session-page-model.browser.setup.ts` sites (or migrate them — DEBT-472 step 4); close the `vi.mock(import(…))`, aliased-`vi`, and angle-bracket escapes red-first; drop the 289-site unknown-cast ratchet once DEBT-472 step 4 migrates the named sites. Replace the register scan with a 15-line "every barrel export has a row" test; the waiver-date rule becomes prose in the register until something can actually compare it.
4. **[ ] One database-target resolver.** Consolidate F4's five sources behind `scripts/database-target.ts`: `export:feedback` and `db:generate` route through `runHumanDatabaseCommand`; `drizzle.config.ts` loses its dotenv fallback (`:9-11` already throws on a missing URL); one loopback definition; `helpers.ts:15-27` imports `setup.ts`'s. Pin `vercel` as a devDependency or replace `npx vercel env pull` with a documented owner step. DEBT-473 step 5 owns the `CI`-inference fixes; do them in the same PR.
5. **[ ] Share the source walker.** `tests/shared/source-walk.ts` with one production-source glob and one test-source glob; the remaining scanners (fidelity, opacity, hook-placement, span-family if it survives step 2) consume it. Red-first: a fixture tree with a file in each formerly-blind location.
6. **[ ] Retire the guards that fight the tools.** `@stripe/cli` pin → minimum-version assertion (`>= 1.50.0`) or removal (Dependabot's `github-actions`/npm groups already govern the bump); `security.txt` `Expires` → a `::warning::` in CI ninety days out, not a unit assertion; decide the 800-line suppression policy once (raise `maxLines` to the measured p95 and delete 28 comments, or keep 800 and schedule the splits under DEBT-469 — not both).
7. **[ ] Record the standard.** Add to `docs/debt/index.md`'s conventions: before writing a scanner, name the Biome/TypeScript/Vitest/Playwright/Actions primitive that does not cover the case; before writing a wrapper, name the platform bound it replaces; a new mechanism lists its dependents in its own doc.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm db:test:up && pnpm test:integration && pnpm build && pnpm test:e2e` green on the implementation head with test counts unchanged except for deleted self-tests (recorded before/after: 4,144 unit / 398 browser / 258 integration / 42 E2E at filing).
- `pnpm test --run` wall time on the same machine before and after step 3, with the `globalSetup` subprocess gone from `vitest.config.mts`.
- For every deleted file: `grep -rn <basename> --include='*.ts' --include='*.tsx' --include='*.yml' --include='*.json' .` returns nothing outside `docs/_archive`.
- Each migrated Biome rule fails on the scratch bypass its scanner missed (F1 table) and passes on the tree.
- `git grep -n "createSourceFile\|createProgram" tests components scripts` returns only `tests/shared/source-walk.ts` and `scripts/crap-report.ts`.
- `pnpm export:feedback` with `DATABASE_URL` unset and `.env.local` present refuses with the DEBT-446 target message.

## Related

- Parents and siblings: [DEBT-473](./debt-473-green-without-evidence.md) (F9 convention, F10 local-run fail-opens, step 4 wrapper), [DEBT-474](./debt-474-ci-secret-scope-and-action-immutability.md) (secret scope; owns F8's `CRON_SECRET` step), [DEBT-472](./debt-472-test-double-fidelity-and-contract-discipline.md) (owns the doubles the F5 scan counts), [DEBT-469](./debt-469-toolchain-warning-debt.md) (owns the 28 size suppressions), [DEBT-465](./debt-465-test-quality-practices-adoption.md) (owns `crap-report.ts`).
- The ruling: [AUDIT-012](../_archive/audits/audit-012-repo-org-devx.md) §Resolution Decisions (2026-06-13).
- Origins of the earned mechanisms are linked in the table above; origins of the over-builds: [DEBT-411](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md) PR-B (`06671f7b`), [DEBT-417](../_archive/debt/debt-417-multi-clone-local-test-infrastructure-isolation.md) (`be50dda7`), DEBT-281 (`108edadc`), [DEBT-224](../_archive/debt/debt-224-file-size-audit-production-and-test.md)/[DEBT-234](../_archive/debt/debt-234-add-max-lines-lint-rule.md) (`a26c45cb`), [DEBT-370](../_archive/debt/debt-370-oversized-test-files-without-enforced-size-rule.md), [DEBT-462](../_archive/debt/debt-462-observability-instrument-gap-parked-triggers.md) (`2fa6e1a0`).
- Shape of the repository a reviewer sees first (measured at `5a095f12`): 49,628 production LOC; 168,014 test LOC (3.4×); 144,617 lines of `docs/*.md` in 968 files (2.9×); 479 debt documents in seven months. The ratio of process artifacts to product is the tell that an agent fleet wrote this repository; the code itself is not. This debt is about making the tooling match the code's standard.
