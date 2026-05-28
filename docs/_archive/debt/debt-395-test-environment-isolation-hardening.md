# DEBT-395: Test Environment Isolation Hardening

**Priority:** P2 (active documentation hardening. PR 1 fixed the high-confidence `process.env` isolation leaks in `lib/container.test.ts`, `proxy.test.ts`, and `tests/shared/load-dotenv-file.test.ts`; the remaining work is to document the pattern in the Claude test-rule system without duplicating rule bodies. A repo-wide grep shows many additional env-mutation sites that are already correctly restored and should not be churned.)
**Created:** 2026-05-26
**Source:** Deep adversarial test-suite audit conducted alongside DEBT-394 archival. The proximate trigger is PR #342 (`Fix GetStartedCta test env isolation`) where `components/get-started-cta.test.tsx` was leaking `NEXT_PUBLIC_SKIP_CLERK=true` env state into the "entitled user → /app/dashboard" assertion — a pre-existing bug that fired only when Dependabot's secret-less CI ran and exposed the latent ordering dependency. The audit found the same bug class still alive in other test files.
**Related:** [.claude/rules/testing.md](../../../.claude/rules/testing.md) (testing rules; now carries a pointer to the canonical isolation rule), [.claude/rules/test-isolation.md](../../../.claude/rules/test-isolation.md) (the canonical isolation rule shipped by PR 2/3), [docs/dev/testing-infrastructure.md](../../dev/testing-infrastructure.md), [DEBT-394 (archived)](./debt-394-supply-chain-hardening.md)

**Status:** Resolved 2026-05-28 — shipped across two PRs. PR 1 ([#363](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/363)) fixed the high-confidence `process.env` isolation leaks: `lib/container.test.ts` (module-scope env defaults snapshot/restored via `afterAll`), `proxy.test.ts` (suite-level `afterEach` now runs `vi.unstubAllEnvs()` before `restoreProcessEnv(ORIGINAL_ENV)`), and `tests/shared/load-dotenv-file.test.ts` (snapshot/restore replacing delete-only cleanup); proof-of-fix was the full local gate plus shuffled full-suite seeds `1`, `42`, `9999`, `1779972928761`, and `7777777` all passing 2524/2524. The audit also discovered and filed DEBT-401 (a separate auth-nav module-cache ordering bug), resolved independently in [#362](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/362). Consolidated PR 2/3 ([#364](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/364)) documented the pattern as the single-source-of-truth rule file `.claude/rules/test-isolation.md` (auto-loads on test files), with a pointer from `.claude/rules/testing.md` and a row in the `CLAUDE.md` Path-Scoped Rules table — no duplicated rule bodies (Option A). The `tests/shared/process-env.ts` helper was the existing solution; the gap was documentation + adoption, now closed.

---

## Pre-Execution Audit — 2026-05-28

Audit branch: `feat/debt-395-pr-1-process-env-isolation-leaks`, cut from `dev` at `c8c06066b96252d686af45a1c84e685a532f3311` after `git pull --ff-only origin dev` returned "Already up to date." The earlier PR 1 branch name in this doc (`fix/debt-395-process-env-isolation-leaks`) was stale; use the audit/execution branch above for PR 1.

Current helper contract in `tests/shared/process-env.ts`:

```typescript
export type ProcessEnvSnapshot = Record<string, string | undefined>;
export function snapshotProcessEnv(): ProcessEnvSnapshot;
export function restoreProcessEnv(snapshot: ProcessEnvSnapshot): void;
```

The canonical direct-env pattern remains the one shipped in `components/get-started-cta.test.tsx`: capture `const ORIGINAL_ENV = snapshotProcessEnv()` at module scope, mutate env inside hooks/tests, then call `restoreProcessEnv(ORIGINAL_ENV)` in cleanup before `vi.resetModules()` when modules read env at import time. If a suite also uses `vi.stubEnv()`, `vi.unstubAllEnvs()` must run first and `restoreProcessEnv(ORIGINAL_ENV)` second so the snapshot remains the authoritative final state.

Current sweep commands used for this audit:

```sh
rg -n 'vi\.stubEnv' . --glob '*.test.*' --glob '*.spec.*'
rg -n 'process\.env\.[A-Z_][A-Z_0-9]*\s*(\?\?=|=)|delete\s+process\.env\.' . --glob '*.test.*' --glob '*.spec.*'
rg -n 'Object\.assign\(process\.env|process\.env\s*=|delete\s+process\.env\.' . --glob '*.test.*' --glob '*.spec.*'
```

Read-only integration guard constants such as `const allowNonLocal = process.env.ALLOW_NON_LOCAL_DATABASE_URL === 'true'` are not mutations and are excluded from the remediation catalog.

The required shuffled verification also exposed a separate module-cache/mock-order dependency in `components/auth-nav.test.tsx` with seed `1779972928761`. That failure was not a `process.env` leak, so it was tracked separately as [DEBT-401](./debt-401-auth-nav-test-module-cache-order-dependency.md) and resolved by PR #362 before PR 1 execution. Because PR 1's acceptance requires `pnpm test --run --sequence.shuffle` to pass, DEBT-401 had to land first so the shuffled suite could be used as a clean process-env isolation signal.

## Problem

`process.env` mutations are global. When a test sets `process.env.FOO = 'true'` and the test runner moves on without restoring, every subsequent test in the same Vitest worker observes the leaked value. This causes:

1. **Order-dependent test failures** — test B passes when run after test A but fails when run in isolation, or vice versa.
2. **Silent contamination of unrelated suites** — a stripe webhook test mutates `process.env.STRIPE_WEBHOOK_SECRET` and the practice-controller tests three files later read the wrong value.
3. **Bugs that only surface in specific CI configurations** — PR #342 was invisible until Dependabot's `NEXT_PUBLIC_SKIP_CLERK=true` fallback hit a test that assumed the variable was unset.

The repo already has a helper that solves this: `tests/shared/process-env.ts` exports `snapshotProcessEnv()` and `restoreProcessEnv()`. PR #342 wired those into `components/get-started-cta.test.tsx`. At creation, **the pattern was not documented anywhere** (`.claude/rules/testing.md` did not mention it, `AGENTS.md` did not mention it), so test files that mutated `process.env` used a mix of good snapshot/restore, local ad-hoc cleanup, and missing `vi.stubEnv` cleanup.

---

## Findings

Three high-confidence bug clusters surfaced during the original audit. PR #363 fixed them in DEBT-395 PR 1; they remain here as provenance and as concrete examples for the documentation rule. Each was HIGH-severity because each could fire intermittently under any of: random test ordering, parallel worker assignment, or future test additions to the same file.

### A. `lib/container.test.ts:49-57` — module-scope `process.env.X ??= ...` without cleanup before PR 1

```typescript
process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/addiction_boards_test';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= 'pk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ??= 'price_dummy_monthly';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL ??= 'price_dummy_annual';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.NEXT_PUBLIC_SKIP_CLERK ??= 'true';
```

Before PR 1, eight environment variables were mutated at module scope with no cleanup. The eighth line (`NEXT_PUBLIC_SKIP_CLERK`) sat on line 57, so the old `49-56` citation under-counted the block by one line. Current `main` at `47b7d376` captures `const ORIGINAL_ENV = snapshotProcessEnv()` immediately before the shared defaults, then restores it in `afterAll`; the env-default writes currently sit at lines 55-63 and the restore is at lines 76-78. Verify with:

```sh
rg -n 'process\.env\.' lib/container.test.ts
```

The `??=` operator only sets if the variable is undefined, which masked the leak under most local conditions but meant CI worker scheduling order could produce different observed state across runs. Capturing the snapshot before the default writes and restoring it after the suite closes the cross-file leak while preserving the intentionally shared defaults inside this file.

### B. `proxy.test.ts:119-122, 585-588, 633-636, 664/668, 686-693, 711` — `vi.stubEnv()` calls without top-level `vi.unstubAllEnvs()` cleanup before PR 1

Before PR 1, six distinct test blocks called `vi.stubEnv()` for `NEXT_PUBLIC_SKIP_CLERK`, `VERCEL_ENV`, `NODE_ENV`, or `NEXT_PUBLIC_SENTRY_DSN` and the suite-level `afterEach` never called `vi.unstubAllEnvs()` to clear Vitest's env-stub registry. Current `main` at `47b7d376` fixes this with a suite-level `afterEach` at lines 72-77 that calls `vi.unstubAllEnvs()` before `restoreProcessEnv(ORIGINAL_ENV)`, then `vi.resetModules()` and `vi.restoreAllMocks()`. Example from the first stub block:

```typescript
it('ignores NEXT_PUBLIC_SKIP_CLERK=true in production...', () => {
  vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'true');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('NODE_ENV', 'development');
  // ... assertions ...
  // Suite-level afterEach now clears the stubs.
});
```

`restoreProcessEnv()` only rewrites `process.env` from the captured snapshot. It does not clear Vitest's internal `_stubsEnv` registry; `node_modules/vitest/dist/chunks/test.DNmyFkvJ.js` shows `stubEnv()` records originals in `_stubsEnv` and `unstubAllEnvs()` both restores those originals and clears that map. The two patterns are related but not interchangeable.

### C. `proxy.test.ts:663-667` — Mixed `vi.stubEnv` + direct `process.env` manipulation

```typescript
vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
vi.unstubAllEnvs();
process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
delete process.env.VERCEL_ENV;
vi.stubEnv('NODE_ENV', 'production');
```

The local unstub now sits at line 665. It clears the stub set at line 664, then direct-mutates `process.env` at lines 666-667 and re-stubs `NODE_ENV` at line 668. This is not an async race in the current test, and the PR 1 suite-level cleanup makes it harmless redundancy. Leave it alone unless a future focused cleanup rewrites the mixed-pattern test for clarity.

### D. Pattern across the suite — undocumented and inconsistent

A grep of `vi\.stubEnv` across all test files surfaced additional sites. Many already included cleanup (`app/(app)/app/request-boundary.test.ts`, `lib/logger.test.ts`, `lib/request-ip.test.ts`, `lib/report-client-error.test.ts`, and `tests/e2e/helpers/seed-test-user.test.ts` all call `vi.unstubAllEnvs()` in `beforeEach` or `afterEach`), while `app/pricing/*-action.test.ts` performs local cleanup in individual tests. The documentation rule should teach future changes to either:
- Add `vi.unstubAllEnvs()` to `afterEach` in the same file, OR
- Migrate to the `snapshotProcessEnv` / `restoreProcessEnv` pattern from `tests/shared/process-env.ts`.

Either is acceptable; the choice depends on whether the test uses Vitest's stub API (use `vi.unstubAllEnvs`) or direct `process.env` assignment (use snapshot/restore).

### E. `tests/shared/load-dotenv-file.test.ts:17, 23, 33, 39` — direct env mutation with delete-only cleanup before PR 1

The 2026-05-28 sweep found one additional PR 1 scope item. Before PR 1, the shape was:

```typescript
delete process.env.TEST_ENV_LOADED;
// ...
process.env.TEST_ENV_LOADED = '2';
// ...
delete process.env.TEST_ENV_LOADED;
```

The local `finally` blocks deleted `TEST_ENV_LOADED`, but they did not restore a pre-existing value. If a developer, CI worker, or previous suite had `TEST_ENV_LOADED` set before this file ran, this test permanently removed it for the rest of the worker. Current `main` at `47b7d376` captures `const ORIGINAL_ENV = snapshotProcessEnv()` at line 8, restores it in `afterEach` at lines 11-13, and keeps `delete process.env.TEST_ENV_LOADED` only as an arrange step where the test requires the variable to start unset.

### F. 2026-05-28 sweep catalog

PR 1 fixed these HIGH sites in PR #363:

| File | Pre-PR1 evidence | Shipped PR 1 action |
| --- | --- | --- |
| `lib/container.test.ts` | Lines 49-57 mutated eight env vars at module scope with no `snapshotProcessEnv` / `restoreProcessEnv` cleanup. | Added module-scope snapshot before the shared defaults and `afterAll` restore. |
| `proxy.test.ts` | `vi.stubEnv()` at lines 119-121, 585-587, 633-635, 663, 667, 686-692, and 710. Suite `afterEach` called `restoreProcessEnv()`, `vi.resetModules()`, and `vi.restoreAllMocks()`, but not `vi.unstubAllEnvs()`. | Added `vi.unstubAllEnvs()` before `restoreProcessEnv(ORIGINAL_ENV)` in the existing suite `afterEach`. |
| `tests/shared/load-dotenv-file.test.ts` | Lines 17, 23, 33, and 39 deleted/set `TEST_ENV_LOADED`; cleanup deleted instead of restoring any original value. | Added module-scope snapshot + `afterEach` restore, and removed delete-only cleanup from `finally` blocks. |

Known-OK reference patterns from the sweep:

| File | Why it is OK |
| --- | --- |
| `app/(app)/app/request-boundary.test.ts` | `vi.stubEnv()` is paired with suite `afterEach` `vi.unstubAllEnvs()`. |
| `lib/logger.test.ts` | `vi.stubEnv()` is paired with suite `afterEach` `vi.unstubAllEnvs()`. |
| `lib/request-ip.test.ts` | Default and per-test `vi.stubEnv()` calls are paired with suite `afterEach` `vi.unstubAllEnvs()`. |
| `lib/report-client-error.test.ts` | `vi.stubEnv()` is paired with suite `afterEach` `vi.unstubAllEnvs()`. |
| `tests/e2e/helpers/seed-test-user.test.ts` | `beforeEach` clears stale stubs, then `afterEach` calls `vi.unstubAllEnvs()`. |
| `app/pricing/manage-billing-action.test.ts` | Single `vi.stubEnv()` is wrapped in `try/finally` with `vi.unstubAllEnvs()`. This is locally safe; prefer suite `afterEach` if more env-stub tests are added. |
| `app/pricing/subscribe-actions.test.ts` | Single `vi.stubEnv()` is wrapped in `try/finally` with `vi.unstubAllEnvs()`. This is locally safe; prefer suite `afterEach` if more env-stub tests are added. |
| `components/get-started-cta.test.tsx` | Canonical PR #342 direct-env pattern: module-scope snapshot, `afterEach` restore, `vi.resetModules()`, `vi.restoreAllMocks()`. |
| `components/auth-nav.test.tsx`, `components/providers.test.tsx`, `components/theme-token-regression.test.tsx`, `lib/env.test.ts`, `lib/stripe.test.ts`, `lib/container.skip-clerk.test.ts` | Direct `process.env` mutations are covered by `snapshotProcessEnv()` / `restoreProcessEnv()`. |
| `app/sign-in/[[...sign-in]]/page.test.tsx`, `app/sign-in/[[...sign-in]]/sign-in-page-client.test.tsx`, `app/sign-up/[[...sign-up]]/page.test.tsx` | Single-test files use module-scope snapshot with `afterAll` restore. Safe today; switch to `afterEach` if additional tests with different env states are added. |
| `components/marketing/marketing-layout.test.tsx` | `TZ` mutation is wrapped in `try/finally` and restores the original value or original absence. |
| `sentry-config.test.ts` | Direct env mutations are covered by `beforeEach`/`afterEach` process-env object resets. This is non-canonical because it reassigns `process.env`; prefer migrating to `tests/shared/process-env.ts` when touched, but no active leak was found. |

---

## Why Existing Docs Were Not Enough

At creation, `AGENTS.md` and `.claude/rules/testing.md` covered Vitest, fakes, TDD, and test quality, but neither mentioned:

- That `process.env` mutations leak across tests by default.
- That `vi.stubEnv()` needs explicit `vi.unstubAllEnvs()` cleanup.
- That `snapshotProcessEnv` / `restoreProcessEnv` helpers exist in `tests/shared/process-env.ts` and are the canonical pattern.
- The interaction with `vi.stubEnv()` cleanup ordering (`vi.unstubAllEnvs()` before `restoreProcessEnv(ORIGINAL_ENV)`) and `vi.resetModules()` (must come AFTER env restoration when the module reads env at import time).

The helper file at `tests/shared/process-env.ts` is the existing solution. The gap is documentation + adoption.

---

## Required Remediation

PR 1 is complete. The remaining DEBT-395 implementation is one consolidated documentation PR, followed by a small archive PR after the documentation lands.

### PR 1 — Fix the high-confidence env-isolation misses

Status: **shipped in PR #363 at `47b7d376`**.

Branch used: `feat/debt-395-pr-1-process-env-isolation-leaks`

Shipped cleanup:

1. **`lib/container.test.ts`** — imports `snapshotProcessEnv()` / `restoreProcessEnv()` from `@/tests/shared/process-env`, captures `const ORIGINAL_ENV = snapshotProcessEnv()` before the shared module-scope env defaults, and restores in `afterAll`.
2. **`proxy.test.ts`** — adds `vi.unstubAllEnvs()` to the suite-level `afterEach`, before `restoreProcessEnv(ORIGINAL_ENV)`, so Vitest env stubs are cleared and the snapshot is the final visible env state.
3. **`tests/shared/load-dotenv-file.test.ts`** — captures the original env once and restores it in `afterEach`; temp directory cleanup stays in `finally`, while delete-only env cleanup no longer owns restoration.

The PR 1 proof-of-fix was the full local gate plus shuffled full-suite seeds `1`, `42`, `9999`, `1779972928761`, and `7777777` all passing.

### Consolidated PR 2/3 — Document test environment isolation

Branch: `feat/debt-395-test-isolation-docs`

Status: **implemented on this branch; PR number to be filled during stop-and-grade.**

Decision: **Option A — single source of truth in `.claude/rules/test-isolation.md`, with a pointer from `.claude/rules/testing.md`.**

Rationale:

- `.claude/rules/testing.md` is listed in `CLAUDE.md` as activating on any file, so a scoped `test-isolation.md` does not expand auto-load reach by itself.
- The separate file still has real value: it matches the existing scoped-rule-file pattern used by `testing-react19.md` and `testing-browser.md`, keeps `testing.md` concise, and gives future agents a discoverable, focused isolation rule.
- Duplicating the full body in both files is rejected. It would create a documentation drift trap and was the main defect in the original PR 2/PR 3 plan.
- Option B is acceptable in principle but weaker here because test isolation is a focused subtopic with enough detail and examples to justify a dedicated file.

Exact execution file list:

1. **`.claude/rules/test-isolation.md`** — new canonical rule file with the full process-env isolation rule.
2. **`.claude/rules/testing.md`** — add only a short "Test Environment Isolation" pointer after "Fakes Over Mocks"; do not duplicate the full rule body.
3. **`CLAUDE.md`** — add `test-isolation.md` to the Path-Scoped Rules table.
4. **`docs/debt/debt-395-test-environment-isolation-hardening.md`** — mark the consolidated documentation PR complete after execution.

Do not edit test/source files in the consolidated docs PR. Do not reproduce the full rule body in `AGENTS.md` or `testing.md`; if universal-agent guidance is later desired, use a pointer-only follow-up so `.claude/rules/test-isolation.md` remains the canonical home.

The new rule file should use the existing frontmatter convention:

```markdown
---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "tests/**"
---
```

Rule content contract:

1. **Module-scope `process.env.X = ...` / `process.env.X ??= ...`** — capture the snapshot at module scope before any env writes, then restore after the suite. Use `afterAll` only for shared defaults that intentionally stay constant for every test in the file; use `afterEach` when tests mutate env differently.

   ```typescript
   import { afterAll } from 'vitest';
   import {
     restoreProcessEnv,
     snapshotProcessEnv,
   } from '@/tests/shared/process-env';

   const ORIGINAL_ENV = snapshotProcessEnv();

   process.env.DATABASE_URL ??=
     'postgresql://user:pass@localhost:5432/addiction_boards_test';

   afterAll(() => {
     restoreProcessEnv(ORIGINAL_ENV);
   });
   ```

2. **`vi.stubEnv()`** — pair all stubs with `vi.unstubAllEnvs()`, normally in suite-level `afterEach`.

   ```typescript
   afterEach(() => {
     vi.unstubAllEnvs();
   });
   ```

3. **Direct `process.env.X = ...` / `delete process.env.X` inside tests** — use `snapshotProcessEnv()` / `restoreProcessEnv()` in `afterEach`. Avoid delete-only `finally` cleanup because it destroys pre-existing values instead of restoring them. A per-test `delete process.env.X` is acceptable as an arrange step when the test explicitly needs the variable absent.

   ```typescript
   import { afterEach } from 'vitest';
   import {
     restoreProcessEnv,
     snapshotProcessEnv,
   } from '@/tests/shared/process-env';

   const ORIGINAL_ENV = snapshotProcessEnv();

   afterEach(() => {
     restoreProcessEnv(ORIGINAL_ENV);
   });
   ```

4. **Combined cleanup ordering** — when `vi.stubEnv()` and direct env snapshot cleanup appear in the same suite, `vi.unstubAllEnvs()` must run first, then `restoreProcessEnv(ORIGINAL_ENV)`. The snapshot is authoritative and must be the last env writer. `vi.resetModules()` comes after env restoration when modules read env at import time.

   ```typescript
   afterEach(() => {
     vi.unstubAllEnvs();
     restoreProcessEnv(ORIGINAL_ENV);
     vi.resetModules();
     vi.restoreAllMocks();
   });
   ```

5. **Helper semantics** — document the exact helper API from `tests/shared/process-env.ts`:

   ```typescript
   export type ProcessEnvSnapshot = Record<string, string | undefined>;
   export function snapshotProcessEnv(): ProcessEnvSnapshot;
   export function restoreProcessEnv(snapshot: ProcessEnvSnapshot): void;
   ```

   `restoreProcessEnv()` deletes keys added after the snapshot and restores keys that existed before the snapshot, so newly set variables such as `TEST_ENV_LOADED` or `DATABASE_URL` are truly cleaned instead of merely overwritten.

6. **Canonical examples** — cite `components/get-started-cta.test.tsx` as the PR #342 direct-env reference pattern, plus the PR 1 examples: `lib/container.test.ts`, `proxy.test.ts`, and `tests/shared/load-dotenv-file.test.ts`.

7. **Do-not-churn guidance** — many env-mutation sites are already clean. The rule governs new or changed tests; do not rewrite known-OK files only to make style uniform.

Do not carry forward the old PR 3 outline's unverified broad claims about module-cache ordering, database isolation, or generic mutable state. DEBT-395 is specifically about process-env isolation. Broader test-isolation topics can get their own debt if a concrete bug or rule gap is found.

### Follow-up archive PR

After the consolidated documentation PR merges, close DEBT-395 with a separate archive PR:

1. Move this file to `docs/_archive/debt/`.
2. Update the active and archived debt indexes consistently with recent DEBT-398/DEBT-399 archival style.
3. Add a resolution paragraph naming PR #363 and the consolidated documentation PR.

---

## Acceptance Criteria

PR 1 done when:

- The `lib/container.test.ts` module-scope env defaults are snapshot/restored.
- Every `vi.stubEnv()` call in `proxy.test.ts` is covered by suite-level `vi.unstubAllEnvs()` plus the existing `restoreProcessEnv()` snapshot restoration.
- `tests/shared/load-dotenv-file.test.ts` restores any pre-existing `TEST_ENV_LOADED` value instead of deleting it permanently.
- A root-level sweep with the pre-execution audit `rg` commands returns zero unfixed sites OR each site appears in the known-OK catalog above.
- Full local gate green.
- `pnpm test --run --sequence.shuffle` passes (no order-dependent failures).
- `pnpm test --run components/theme-token-regression.test.tsx` remains 16/16 green for DEBT-398 PR 3.
- Pre-push hook green.

Status: **complete in PR #363 at `47b7d376`**.

Consolidated PR 2/3 done when:

- [x] `.claude/rules/test-isolation.md` exists with the frontmatter and rule contract above.
- [x] `.claude/rules/testing.md` cross-references `test-isolation.md` with a pointer only.
- [x] `CLAUDE.md` table is updated to list the new rule and its activation scope.
- [x] No source files or test files change.
- [x] `pnpm test --run components/theme-token-regression.test.tsx` remains 16/16 green for DEBT-398 PR 3.
- [x] Full local gate is green before push, even though the PR is doc-only.
- [x] The DEBT-395 doc marks the consolidated documentation PR complete.

Archive PR done when:

- This debt doc is moved to `docs/_archive/debt/`.
- Debt indexes are updated.
- The archive text names PR #363 and the consolidated documentation PR as the completed resolution chain.

---

## Risk and Reversibility

- **PR 1 (test fixes)** — shipped. Low risk; failure mode was "test that previously passed now fails because the leak is gone." That is a discovery, not a regression.
- **Consolidated PR 2/3 (rule docs)** — zero production risk. Doc-only. If the rule is wrong, edit the single canonical rule file.
- **Archive PR** — zero production risk. Doc-only bookkeeping.

All remaining PRs are independently revertable.

---

## Done When

PR #363, the consolidated documentation PR, and the archive PR have merged to `dev` and synced to `main`. `pnpm test --run --sequence.shuffle` is green on the final state. The `vi.stubEnv` and module-scope `process.env` audit returns clean. DEBT-395 doc is moved to `docs/_archive/debt/` with a resolution paragraph naming the completed PR chain.

A future agent who triggers `vi.stubEnv` in a new test will be reminded (via the auto-loaded rule) to add the matching cleanup, and the bug class behind PR #342 stops recurring.
