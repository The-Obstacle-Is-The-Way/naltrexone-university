# DEBT-395: Test Environment Isolation Hardening

**Priority:** P2 (active bug class — same shape as PR #342's pre-existing test-isolation leak. The current high-confidence misses are the module-scope env defaults in `lib/container.test.ts`, the `vi.stubEnv()` cleanup gap in `proxy.test.ts`, and the direct env cleanup gap in `tests/shared/load-dotenv-file.test.ts`; a repo-wide grep shows many additional env-mutation sites that are already correctly restored and should not be churned. The fix is mechanical and the rule is already partially implemented in `tests/shared/process-env.ts` but undocumented.)
**Created:** 2026-05-26
**Source:** Deep adversarial test-suite audit conducted alongside DEBT-394 archival. The proximate trigger is PR #342 (`Fix GetStartedCta test env isolation`) where `components/get-started-cta.test.tsx` was leaking `NEXT_PUBLIC_SKIP_CLERK=true` env state into the "entitled user → /app/dashboard" assertion — a pre-existing bug that fired only when Dependabot's secret-less CI ran and exposed the latent ordering dependency. The audit found the same bug class still alive in other test files.
**Related:** [.claude/rules/testing.md](../../.claude/rules/testing.md) (testing rules; currently silent on env isolation), [docs/dev/testing-infrastructure.md](../dev/testing-infrastructure.md), [DEBT-394 (archived)](../_archive/debt/debt-394-supply-chain-hardening.md)

**Status:** Active

---

## Pre-Execution Audit — 2026-05-28

Audit branch: `feat/debt-395-pr-1-process-env-isolation-leaks`, cut from `dev` at `c8c06066b96252d686af45a1c84e685a532f3311` after `git pull --ff-only origin dev` returned "Already up to date." The earlier PR 1 branch name in this doc (`fix/debt-395-process-env-isolation-leaks`) was stale; use the audit/execution branch above for PR 1.

Current helper contract in `tests/shared/process-env.ts`:

```typescript
export type ProcessEnvSnapshot = Record<string, string | undefined>;
export function snapshotProcessEnv(): ProcessEnvSnapshot;
export function restoreProcessEnv(snapshot: ProcessEnvSnapshot): void;
```

The canonical pattern remains the one shipped in `components/get-started-cta.test.tsx`: capture `const ORIGINAL_ENV = snapshotProcessEnv()` at module scope, mutate env inside hooks/tests, then call `restoreProcessEnv(ORIGINAL_ENV)` in cleanup before `vi.resetModules()` when modules read env at import time.

Current sweep commands used for this audit:

```sh
rg -n 'vi\.stubEnv' . --glob '*.test.*' --glob '*.spec.*'
rg -n 'process\.env\.[A-Z_][A-Z_0-9]*\s*(\?\?=|=)|delete\s+process\.env\.' . --glob '*.test.*' --glob '*.spec.*'
rg -n 'Object\.assign\(process\.env|process\.env\s*=|delete\s+process\.env\.' . --glob '*.test.*' --glob '*.spec.*'
```

Read-only integration guard constants such as `const allowNonLocal = process.env.ALLOW_NON_LOCAL_DATABASE_URL === 'true'` are not mutations and are excluded from the remediation catalog.

The required shuffled verification also exposed a separate module-cache/mock-order dependency in `components/auth-nav.test.tsx` with seed `1779972928761`. That failure is not a `process.env` leak, so it is tracked separately as [DEBT-401](./debt-401-auth-nav-test-module-cache-order-dependency.md). Because PR 1's acceptance requires `pnpm test --run --sequence.shuffle` to pass, execution must either fix DEBT-401 as a clearly separated companion commit before claiming PR 1 acceptance, or explicitly revise the PR 1 acceptance criteria before opening the PR.

## Problem

`process.env` mutations are global. When a test sets `process.env.FOO = 'true'` and the test runner moves on without restoring, every subsequent test in the same Vitest worker observes the leaked value. This causes:

1. **Order-dependent test failures** — test B passes when run after test A but fails when run in isolation, or vice versa.
2. **Silent contamination of unrelated suites** — a stripe webhook test mutates `process.env.STRIPE_WEBHOOK_SECRET` and the practice-controller tests three files later read the wrong value.
3. **Bugs that only surface in specific CI configurations** — PR #342 was invisible until Dependabot's `NEXT_PUBLIC_SKIP_CLERK=true` fallback hit a test that assumed the variable was unset.

The repo already has a helper that solves this: `tests/shared/process-env.ts` exports `snapshotProcessEnv()` and `restoreProcessEnv()`. PR #342 wired those into `components/get-started-cta.test.tsx`. But **the pattern is not documented anywhere** (`.claude/rules/testing.md` does not mention it, `AGENTS.md` does not mention it), so test files that mutate `process.env` use a mix of good snapshot/restore, local ad-hoc cleanup, and missing `vi.stubEnv` cleanup.

---

## Findings

Three high-confidence bug clusters surfaced during the audit. Each is HIGH-severity because each can fire intermittently under any of: random test ordering, parallel worker assignment, or future test additions to the same file.

### A. `lib/container.test.ts:49-57` — module-scope `process.env.X ??= ...` without cleanup

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

Eight environment variables get mutated at module scope. The eighth line (`NEXT_PUBLIC_SKIP_CLERK`) currently sits on line 57, so the old `49-56` citation under-counted the block by one line. The file does not call `snapshotProcessEnv()` or restore in `afterAll`. Every subsequent test in the worker observes whatever this file left behind. Verify with:

```sh
rg -n 'process\.env\.' lib/container.test.ts
```

The `??=` operator only sets if the variable is undefined, which masks the leak under most local conditions but means CI worker scheduling order can produce different observed state across runs.

### B. `proxy.test.ts:119-121, 585-587, 633-635, 663/667, 686-692, 710` — `vi.stubEnv()` calls without top-level `vi.unstubAllEnvs()` cleanup

Six distinct test blocks call `vi.stubEnv()` for `NEXT_PUBLIC_SKIP_CLERK`, `VERCEL_ENV`, `NODE_ENV`, or `NEXT_PUBLIC_SENTRY_DSN` and the suite-level `afterEach` never calls `vi.unstubAllEnvs()` to clear Vitest's env-stub registry. Example from line 119:

```typescript
it('ignores NEXT_PUBLIC_SKIP_CLERK=true in production...', () => {
  vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'true');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('NODE_ENV', 'development');
  // ... assertions ...
  // No cleanup: stubs survive to the next test
});
```

The file's `afterEach` at line 72-76 calls `restoreProcessEnv()` and `vi.resetModules()`, but `restoreProcessEnv()` only rewrites `process.env` from the captured snapshot. It does not clear Vitest's internal `_stubsEnv` registry; `node_modules/vitest/dist/chunks/test.DNmyFkvJ.js` shows `stubEnv()` records originals in `_stubsEnv` and `unstubAllEnvs()` both restores those originals and clears that map. The two patterns are related but not interchangeable.

### C. `proxy.test.ts:663-667` — Mixed `vi.stubEnv` + direct `process.env` manipulation

```typescript
vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
vi.unstubAllEnvs();
process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
delete process.env.VERCEL_ENV;
vi.stubEnv('NODE_ENV', 'production');
```

The unstub at line 664 clears the stub set at line 663, then direct-mutates `process.env` at lines 665-666 and re-stubs `NODE_ENV` at line 667. This is not an async race in the current test, but it is confusing intent and masks the larger problem: cleanup is happening locally inside one test instead of uniformly in suite-level `afterEach`.

### D. Pattern across the suite — undocumented and inconsistent

A grep of `vi\.stubEnv` across all test files surfaces additional sites. Many already include cleanup (`app/(app)/app/request-boundary.test.ts`, `lib/logger.test.ts`, `lib/request-ip.test.ts`, `lib/report-client-error.test.ts`, and `tests/e2e/helpers/seed-test-user.test.ts` all call `vi.unstubAllEnvs()` in `beforeEach` or `afterEach`), while `app/pricing/*-action.test.ts` performs local cleanup in individual tests. A full sweep should catalog every site and either:
- Add `vi.unstubAllEnvs()` to `afterEach` in the same file, OR
- Migrate to the `snapshotProcessEnv` / `restoreProcessEnv` pattern from `tests/shared/process-env.ts`.

Either is acceptable; the choice depends on whether the test uses Vitest's stub API (use `vi.unstubAllEnvs`) or direct `process.env` assignment (use snapshot/restore).

### E. `tests/shared/load-dotenv-file.test.ts:17, 23, 33, 39` — direct env mutation with delete-only cleanup

The 2026-05-28 sweep found one additional PR 1 scope item:

```typescript
delete process.env.TEST_ENV_LOADED;
// ...
process.env.TEST_ENV_LOADED = '2';
// ...
delete process.env.TEST_ENV_LOADED;
```

The local `finally` blocks delete `TEST_ENV_LOADED`, but they do not restore a pre-existing value. If a developer, CI worker, or previous suite has `TEST_ENV_LOADED` set before this file runs, this test permanently removes it for the rest of the worker. Fix this with the canonical `snapshotProcessEnv()` / `restoreProcessEnv()` helper and keep the per-test `delete process.env.TEST_ENV_LOADED` only where the arrange step requires the variable to start unset.

### F. 2026-05-28 sweep catalog

PR 1 must fix these HIGH sites:

| File | Current evidence | Required PR 1 action |
| --- | --- | --- |
| `lib/container.test.ts` | Lines 49-57 mutate eight env vars at module scope with no `snapshotProcessEnv` / `restoreProcessEnv` cleanup. | Move mutations behind a hook that runs after the snapshot is captured and restore in `afterAll`. |
| `proxy.test.ts` | `vi.stubEnv()` at lines 119-121, 585-587, 633-635, 663, 667, 686-692, and 710. Suite `afterEach` at lines 72-76 calls `restoreProcessEnv()`, `vi.resetModules()`, and `vi.restoreAllMocks()`, but not `vi.unstubAllEnvs()`. | Add `vi.unstubAllEnvs()` to the existing suite `afterEach`. |
| `tests/shared/load-dotenv-file.test.ts` | Lines 17, 23, 33, and 39 delete/set `TEST_ENV_LOADED`; cleanup deletes instead of restoring any original value. | Add module-scope snapshot + `afterEach` restore. |

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

`AGENTS.md` and `.claude/rules/testing.md` cover Vitest, fakes, TDD, and test quality, but neither mentions:

- That `process.env` mutations leak across tests by default.
- That `vi.stubEnv()` needs explicit `vi.unstubAllEnvs()` cleanup.
- That `snapshotProcessEnv` / `restoreProcessEnv` helpers exist in `tests/shared/process-env.ts` and are the canonical pattern.
- The interaction with `vi.resetModules()` (must come AFTER env restoration when the module reads env at import time).

The helper file at `tests/shared/process-env.ts` is the existing solution. The gap is documentation + adoption.

---

## Required Remediation

Ship in three single-concern PRs.

### PR 1 — Fix the high-confidence env-isolation misses

Branch: `feat/debt-395-pr-1-process-env-isolation-leaks`

Edits, with explicit matching cleanup:

1. **`lib/container.test.ts`** — import `snapshotProcessEnv()` / `restoreProcessEnv()` from `@/tests/shared/process-env`; capture `const ORIGINAL_ENV = snapshotProcessEnv()` at module scope; move the eight env-default writes into a helper called from `beforeAll` before `loadContainer()` imports `./container`; restore in `afterAll`.

   Concrete shape:

   ```typescript
   const ORIGINAL_ENV = snapshotProcessEnv();

   function setSharedTestEnv() {
     process.env.DATABASE_URL ??=
       'postgresql://user:pass@localhost:5432/addiction_boards_test';
     // ... seven more current defaults ...
   }

   beforeAll(async () => {
     setSharedTestEnv();
     createContainer = await loadContainer();
   });

   afterAll(() => {
     restoreProcessEnv(ORIGINAL_ENV);
   });
   ```

   Verify with `pnpm test --run lib/container.test.ts` then with `pnpm test --run --sequence.shuffle` to confirm no order dependency.

2. **`proxy.test.ts`** — add `vi.unstubAllEnvs()` to the top-level `afterEach` so every `vi.stubEnv()` call in the file (not just the documented ones) gets cleared. Keep the existing `restoreProcessEnv()` call for direct `process.env` mutations and call `vi.unstubAllEnvs()` before restoring the snapshot so the final visible env state comes from `ORIGINAL_ENV`.

   Concrete shape:

   ```typescript
   afterEach(() => {
     vi.unstubAllEnvs();
     restoreProcessEnv(ORIGINAL_ENV);
     vi.resetModules();
     vi.restoreAllMocks();
   });
   ```

   This one-line cleanup addition covers the cited `vi.stubEnv()` blocks at current lines 119-121, 585-587, 633-635, 663/667, 686-692, and 710. The local `vi.unstubAllEnvs()` at line 664 becomes redundant after the global cleanup exists, but it is harmless. Leave it in PR 1 unless the execution agent chooses to simplify the mixed-pattern test in the same focused edit.

3. **`tests/shared/load-dotenv-file.test.ts`** — add `snapshotProcessEnv()` / `restoreProcessEnv()` from `./process-env`; capture `const ORIGINAL_ENV = snapshotProcessEnv()` at module scope; restore in `afterEach`. Keep temp directory cleanup in each `finally`; remove delete-only cleanup for `TEST_ENV_LOADED` from `finally` once `afterEach` owns env restoration.

   Concrete shape:

   ```typescript
   import { afterEach, describe, expect, it } from 'vitest';
   import { restoreProcessEnv, snapshotProcessEnv } from './process-env';

   const ORIGINAL_ENV = snapshotProcessEnv();

   afterEach(() => {
     restoreProcessEnv(ORIGINAL_ENV);
   });
   ```

4. **Audit-sweep**: re-run the three `rg` commands from the pre-execution audit section across the full repo root, not only `app/ src/ components/ lib/ tests/`, because root-level test files such as `proxy.test.ts` and `sentry-config.test.ts` are otherwise missed. For every file with mutation calls, verify the `afterEach`, `afterAll`, or local `finally` has matching cleanup. Add cleanup where missing.

Full local gate after fixes:

```sh
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

Then run unit tests in random order to catch any remaining leaks:

```sh
pnpm test --run --sequence.shuffle
```

If a shuffled run reveals a new failure, that's a hidden order dependency — surface it as an additional fix in the same PR.

Also keep the DEBT-398 PR 3 regression scan green:

```sh
pnpm test --run components/theme-token-regression.test.tsx
```

Expected current signal: 16 tests pass in `components/theme-token-regression.test.tsx`.

### PR 2 — Document the pattern (no code changes)

Branch: `docs/debt-395-test-env-isolation-rule`

Edit `.claude/rules/testing.md` — add a section after "Fakes Over Mocks":

```markdown
## Test Environment Isolation

`process.env` mutations are global and persist across tests unless explicitly reset. Any test that modifies `process.env` MUST follow this pattern.

### For `vi.stubEnv()` calls

Add to the suite's `afterEach`:

```typescript
afterEach(() => {
  vi.unstubAllEnvs();
});
```

`vi.unstubAllEnvs()` clears all stubs set via `vi.stubEnv()` in the current test. Without it, stubs leak to the next test in the same file.

### For direct `process.env.X = ...` assignments

Use the snapshot helpers from `tests/shared/process-env.ts`:

```typescript
import { snapshotProcessEnv, restoreProcessEnv } from '../../tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

afterEach(() => {
  restoreProcessEnv(ORIGINAL_ENV);
  vi.resetModules();  // purge cached imports that read env at module load
});
```

Snapshot at suite level (not in `beforeEach` — that's too late if module-scope setup runs first). Restore in `afterEach` (not `afterAll` — sibling tests need a clean slate between each test).

### Ordering matters

`vi.resetModules()` MUST come AFTER env restoration when modules read env at import time, because re-importing the module after reset captures the current env.

### Why this matters

Process env leaks cause order-dependent test failures that:
- Pass locally but fail in CI (different worker scheduling)
- Pass in isolation but fail in suite (and vice versa)
- Mask production bugs by accidentally setting the "right" value

See PR #342 for the precedent incident: `components/get-started-cta.test.tsx` was leaking `NEXT_PUBLIC_SKIP_CLERK=true` and the bug only surfaced when Dependabot CI ran without repo secrets.
```

Also add a small section to `AGENTS.md` under the Testing rules pointing at this new section, so universal-context agents see it.

### PR 3 — New rule file `.claude/rules/test-isolation.md`

Branch: `docs/debt-395-test-isolation-rule-file`

Create a dedicated rule file at `.claude/rules/test-isolation.md` so agents working on `**/*.test.ts` / `**/*.test.tsx` auto-load isolation guidance separately from general testing rules. Outline:

```markdown
# Test Isolation Rules

Activates for: `**/*.test.ts`, `**/*.test.tsx`, `tests/**`

## Process.env Isolation

[reproduce the pattern from testing.md update above]

## Module Caching

- `vi.resetModules()` in afterEach when dynamic imports read env at module scope.
- `vi.restoreAllMocks()` / `vi.resetMocks()` in afterEach when mocks were created in the test.
- Order: restore mocks BEFORE resetting modules.

## Database Isolation (Integration Tests)

- Each integration test gets isolated state via transaction rollback or per-test temp schema.
- Never rely on suite-level cleanup that other tests' setup might invalidate.

## Cross-test State Contamination

- Avoid module-scope `let counter = 0`-style mutable state.
- Shared factories (`createX()` from `src/domain/test-helpers/`) are OK ONLY if they return fresh instances per call.
- Shared mock instances MUST be `mockReset()`-ed in `afterEach`.
```

Add `test-isolation.md` to the table in `CLAUDE.md` under Path-Scoped Rules so it's discoverable.

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

PR 2 done when:

- `.claude/rules/testing.md` has the "Test Environment Isolation" section.
- `AGENTS.md` references the new section.
- A future agent editing a test file will see the rule loaded.

PR 3 done when:

- `.claude/rules/test-isolation.md` exists with the documented sections.
- `CLAUDE.md` table is updated to list the new rule.
- Existing `.claude/rules/testing.md` cross-references it.

---

## Risk and Reversibility

- **PR 1 (test fixes)** — low risk. Failure mode is "test that previously passed now fails because the leak is gone." That's a discovery, not a regression — fix the now-exposed dependency.
- **PR 2 (testing.md update)** — zero risk. Doc-only.
- **PR 3 (new rule file)** — zero risk. Doc-only. The rule auto-loads on test files; if it's wrong, edit it.

All three PRs are independently revertable.

---

## Done When

All three PRs merged to `dev` and synced to `main`. `pnpm test --run --sequence.shuffle` is green on the final state. The `vi.stubEnv` and module-scope `process.env` audit returns clean. DEBT-395 doc moved to `docs/_archive/debt/` with resolution paragraph naming all three PRs.

A future agent who triggers `vi.stubEnv` in a new test will be reminded (via the auto-loaded rule) to add the matching cleanup, and the bug class behind PR #342 stops recurring.
