# DEBT-395: Test Environment Isolation Hardening

**Priority:** P2 (active bug class — same shape as PR #342's pre-existing test-isolation leak. Eight or more test sites currently mutate `process.env` without proper restoration; any of them can fire flaky failures, mask production bugs, or surface during the next Dependabot CI cycle where the no-secrets environment differs from local. The fix is mechanical and the rule is already partially implemented in `tests/shared/process-env.ts` but undocumented.)
**Created:** 2026-05-26
**Source:** Deep adversarial test-suite audit conducted alongside DEBT-394 archival. The proximate trigger is PR #342 (`Fix GetStartedCta test env isolation`) where `components/get-started-cta.test.tsx` was leaking `NEXT_PUBLIC_SKIP_CLERK=true` env state into the "entitled user → /app/dashboard" assertion — a pre-existing bug that fired only when Dependabot's secret-less CI ran and exposed the latent ordering dependency. The audit found the same bug class still alive in other test files.
**Related:** [.claude/rules/testing.md](../../.claude/rules/testing.md) (testing rules; currently silent on env isolation), [docs/dev/testing-infrastructure.md](../dev/testing-infrastructure.md), [DEBT-394 (archived)](../_archive/debt/debt-394-supply-chain-hardening.md)

**Status:** Active

---

## Problem

`process.env` mutations are global. When a test sets `process.env.FOO = 'true'` and the test runner moves on without restoring, every subsequent test in the same Vitest worker observes the leaked value. This causes:

1. **Order-dependent test failures** — test B passes when run after test A but fails when run in isolation, or vice versa.
2. **Silent contamination of unrelated suites** — a stripe webhook test mutates `process.env.STRIPE_WEBHOOK_SECRET` and the practice-controller tests three files later read the wrong value.
3. **Bugs that only surface in specific CI configurations** — PR #342 was invisible until Dependabot's `NEXT_PUBLIC_SKIP_CLERK=true` fallback hit a test that assumed the variable was unset.

The repo already has a helper that solves this: `tests/shared/process-env.ts` exports `snapshotProcessEnv()` and `restoreProcessEnv()`. PR #342 wired those into `components/get-started-cta.test.tsx`. But **the pattern is not documented anywhere** (`.claude/rules/testing.md` does not mention it, `AGENTS.md` does not mention it), so most other test files that mutate `process.env` either don't restore at all or use ad-hoc patterns that miss `vi.stubEnv` specifically.

---

## Findings

Eight concrete bug sites surfaced during the audit. Each is HIGH-severity because each can fire intermittently under any of: random test ordering (Vitest's default), parallel worker assignment, or future test additions to the same file.

### A. `lib/container.test.ts:49-56` — module-scope `process.env.X ??= ...` without cleanup

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

Eight environment variables get mutated at module scope. The file does not call `snapshotProcessEnv()` or restore in `afterAll`. Every subsequent test in the worker observes whatever this file left behind. Verify with:

```sh
grep -n 'process\.env\.' lib/container.test.ts
```

The `??=` operator only sets if the variable is undefined, which masks the leak under most local conditions but means CI worker scheduling order can produce different observed state across runs.

### B. `proxy.test.ts:119-121, 585-592, 633-635, 686-692, 710` — `vi.stubEnv()` calls without `vi.unstubAllEnvs()` cleanup

Five distinct test blocks call `vi.stubEnv()` for `NEXT_PUBLIC_SKIP_CLERK`, `VERCEL_ENV`, `NODE_ENV` and never call `vi.unstubAllEnvs()` in an `afterEach` to clear the stubs. Example from line 119:

```typescript
it('ignores NEXT_PUBLIC_SKIP_CLERK=true in production...', () => {
  vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'true');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('NODE_ENV', 'development');
  // ... assertions ...
  // No cleanup: stubs survive to the next test
});
```

The file's `afterEach` at line 72-76 calls `restoreProcessEnv()` and `vi.resetModules()`, but `restoreProcessEnv()` only restores `process.env` direct assignments — it does NOT undo `vi.stubEnv()` mutations because Vitest manages stubs in a separate internal state layer. The two patterns are not interchangeable.

### C. `proxy.test.ts:663-667` — Mixed `vi.stubEnv` + direct `process.env` manipulation

```typescript
vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
vi.unstubAllEnvs();
process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
delete process.env.VERCEL_ENV;
vi.stubEnv('NODE_ENV', 'production');
```

The unstub at line 664 clears the stubs set at line 663, then re-stubs on line 667. Between lines 664 and 667 the test briefly observes the un-stubbed value, which can produce different behavior depending on what the surrounding code reads in that window. Confusing intent at minimum, race condition at worst.

### D. Pattern across the suite — undocumented and inconsistent

A grep of `vi\.stubEnv` across all test files surfaces additional sites that need the same cleanup pattern. The audit captured the high-severity ones; a full sweep should catalog every site and either:
- Add `vi.unstubAllEnvs()` to `afterEach` in the same file, OR
- Migrate to the `snapshotProcessEnv` / `restoreProcessEnv` pattern from `tests/shared/process-env.ts`.

Either is acceptable; the choice depends on whether the test uses Vitest's stub API (use `vi.unstubAllEnvs`) or direct `process.env` assignment (use snapshot/restore).

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

### PR 1 — Fix the eight high-severity sites

Branch: `fix/debt-395-process-env-isolation-leaks`

Edits, with explicit `afterEach` cleanup:

1. **`lib/container.test.ts`** — wrap module-scope env mutations in `beforeAll` + `afterAll` snapshot/restore using `snapshotProcessEnv()` / `restoreProcessEnv()`. Verify with `pnpm test --run lib/container.test.ts` then with `--shuffle` to confirm no order dependency.

2. **`proxy.test.ts`** — add `vi.unstubAllEnvs()` to the top-level `afterEach` so every `vi.stubEnv()` call in the file (not just the documented ones) gets cleared. Verify the existing `restoreProcessEnv()` call stays in place for the direct `process.env` mutations elsewhere in the file.

3. **Audit-sweep**: run `grep -rn 'vi\.stubEnv\|process\.env\.[A-Z_]* *=' --include='*.test.ts' --include='*.test.tsx'` across `app/`, `src/`, `components/`, `lib/`, `tests/`. For every file with mutation calls, verify the `afterEach` (or `afterAll`) has the matching cleanup. Add cleanup where missing.

Full local gate after fixes:

```sh
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
```

Then run unit tests in random order to catch any remaining leaks:

```sh
pnpm test --run --sequence.shuffle
```

If a shuffled run reveals a new failure, that's a hidden order dependency — surface it as an additional fix in the same PR.

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

- All eight listed sites have matching cleanup (`vi.unstubAllEnvs()` or `snapshotProcessEnv`/`restoreProcessEnv`).
- A grep sweep across `app/`, `src/`, `components/`, `lib/`, `tests/` for `vi\.stubEnv|process\.env\.[A-Z_]* *=` returns zero unfixed sites OR each site has a documented justification.
- Full local gate green.
- `pnpm test --run --sequence.shuffle` passes (no order-dependent failures).
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
