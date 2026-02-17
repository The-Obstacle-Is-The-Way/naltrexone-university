# DEBT-225: Vitest Cold-Import Timeout Flakes

**Status:** Open
**Priority:** P2
**Date:** 2026-02-17
**Component:** Test Infrastructure

---

## Description

Three test files intermittently fail with `Error: Test timed out in 5000ms` on their **first `it()` block only**. They pass on immediate re-run. This is not a behavioral flake (race condition, timing dependency, or non-deterministic logic). It is a **deterministic cost problem**: the first test in each file pays the full ESM module resolution + transpilation + tree-shaking cost for a heavy import chain, and that cost intermittently exceeds Vitest's default 5000ms timeout.

The deeper problem: **29 magic-number timeout overrides** are scattered across **17 test files** — all working around the same root cause. None protect genuinely long-running operations. These are unprincipled values (`10_000`, `15_000`, `20_000`, `40000`) with no documented rationale, written by different people at different times (note the inconsistent formatting: `40000` vs `20_000` vs `{ timeout: 15_000 }`). This is textbook scattered technical debt.

Beyond the files with overrides, **~39 additional test files** use `await import()` inside `it()` with **no timeout protection at all** — silently relying on the 5s default. These are equally vulnerable to cold-import flakes but haven't hit the wall yet (or have, and developers simply re-ran).

### Actively Flaking Tests (no override, hit the 5s default)

| File | First Test | Import Pattern | Transitive Weight |
|------|-----------|----------------|-------------------|
| `lib/container-modules.test.ts:4` | "exposes modular container builders by bounded context" | `await Promise.all([4 container imports])` | All 10 repositories + `db/schema.ts` (549 lines) + Drizzle |
| `app/(app)/app/practice/components/practice-view.test.tsx:12` | "renders Back to Dashboard link with correct href" | `await import('./practice-view')` | UI component tree + `practice-page-logic` (321 lines) |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx:55` | "renders a Back to Dashboard utility link" | `await import('./question-page-client')` | Controller hooks + question-page-logic + route utils |

### Magic-Number Override Inventory (29 instances, 17 files)

Most overrides use the positional trailing-number syntax (`}, 10_000)`). Two use the object syntax (`{ timeout: 15_000 }`).

| Timeout | Syntax | Count | Files |
|---------|--------|-------|-------|
| `40000` | positional | 4 | `lib/container.test.ts` |
| `20_000` | positional | 13 | `lib/container.skip-clerk.test.ts` (2), `questions/[slug]/page.test.tsx` (6), `practice/page.test.tsx` (2), `practice/quick/page.test.tsx` (1), `practice/[sessionId]/page.test.tsx` (2) |
| `15_000` | `{ timeout }` | 2 | `components/ui/dropdown-menu.test.tsx` (1), `components/marketing/marketing-home.test.tsx` (1) |
| `10_000` | positional | 10 | `questions/[slug]/page.test.tsx` (1), `pricing/page.test.tsx` (1), `global-error.test.tsx` (1), `error.test.tsx` (1), `dashboard/error.test.tsx` (1), `layout-shell.test.tsx` (1), `billing/error.test.tsx` (1), `practice/quick/error.test.tsx` (1), `practice/[sessionId]/error.test.tsx` (1), `practice/error.test.tsx` (1) |

> Note: `questions/[slug]/page.test.tsx` has both 20_000 and 10_000 overrides (7 total in one file).

### Unprotected Vulnerable Files (~39 files)

An additional ~39 test files use `await import()` inside `it()` with **no timeout override**, silently relying on the 5s default. These include the 3 actively flaking tests above plus files like `components/auth-nav.test.tsx` (10 `await import()` calls), `app/(app)/app/billing/page.test.tsx` (8 calls), and many others. The `beforeAll` migration (Part 1 of the fix) must cover all files with this pattern, not just the 17 with overrides.

### Evidence It's Cold-Import, Not Behavioral

1. **Always the first `it()` in the file** — second and subsequent tests in the same file pass instantly because modules are cached
2. **Always exactly 5000ms** — the timeout message is `Test timed out in 5000ms`, which is Vitest's default `testTimeout`
3. **Always passes on re-run** — Vitest's module cache is warm on the second run
4. **No async behavior** — these are `renderToStaticMarkup` tests that execute synchronously once the import resolves; the timeout is spent in module loading, not test execution

## Root Cause

Two compounding problems:

### 1. No global timeout configured

None of the 3 Vitest config files specify `testTimeout` or `hookTimeout`. All rely on Vitest defaults:

| Config File | `testTimeout` | `hookTimeout` |
|------------|---------------|---------------|
| `vitest.config.ts` | 5000ms (default) | 10000ms (default) |
| `vitest.browser.config.ts` | 5000ms (default) | 10000ms (default) |
| `vitest.integration.config.ts` | 5000ms (default) | 10000ms (default) |

### 2. The `testing-react19.md` rule codifies imports inside `it()`

The project rule `.claude/rules/testing-react19.md` mandates:

```typescript
it('renders correctly', async () => {
  const MyComponent = (await import('./MyComponent')).default;
  const html = renderToStaticMarkup(<MyComponent />);
  expect(html).toContain('Expected text');
});
```

This was the right call when it was written — React 19 broke `@testing-library/react`, and dynamic imports avoid module initialization side effects. But it places the **entire ESM resolution + transpilation cost inside the test's timeout budget** (`testTimeout`, 5s). When import chains are heavy, this intermittently exceeds 5s.

Vitest has a separate `hookTimeout` (default 10s) for lifecycle hooks. The `testing-react19.md` rule should be updated to recommend moving shared imports into `beforeAll()`, where the import cost is charged against `hookTimeout` instead — a budget that's already double `testTimeout`.

### Connection to DEBT-224

DEBT-224 tracks file sizes exceeding guidelines. The heaviest import chains (`db/schema.ts` at 549 lines, `drizzle-attempt-repository.ts` at 438 lines, `practice-page-logic.ts` at 321 lines) directly contribute to cold-import time. Reducing file sizes would reduce import time, but wouldn't fully eliminate the problem — even modest import chains can hit 5s on a cold run under load.

### Community Context

- [Vitest issue #6441](https://github.com/vitest-dev/vitest/issues/6441) — Cold-start module loading is a known community pain point. A contributor proved persistent module caching drops startup from 8s to 200ms — not shipped yet.
- [Vitest timing breakdown](https://sordyl.dev/dev-bites/vitest-timing-breakdown/) — "Transform" and "setup" are the dominant time sinks, not test execution.
- [Vitest discussion #7890](https://github.com/vitest-dev/vitest/discussions/7890) — Dynamic per-suite timeout is a recurring community request, confirming ad-hoc overrides are a common coping mechanism.
- No community guide recommends per-test ad-hoc overrides. Every source says: configure globally or restructure the import pattern.

## Impact

- **CI flakes** — 3 tests fail intermittently, requiring re-runs
- **Magic numbers** — 29 arbitrary timeout values scattered across 17 files with no principled basis
- **False confidence** — Developers learn to dismiss timeout failures as "just flakes"
- **Wasted time** — Each flake requires a re-run (~55s for the full suite)
- **Invisible coupling** — New test files silently inherit the 5s default and will flake when import chains are heavy, prompting yet another ad-hoc override
- **Eroded test suite trust** — Intermittent failures undermine confidence in the entire suite

## Resolution

### The Fix: `beforeAll` imports + global timeout safety net

This is a two-part fix, done in the same PR.

#### Part 1: Migrate `await import()` from `it()` into `beforeAll()` (root cause fix)

For **all files** with `await import()` inside `it()` (~56 total: 17 with overrides + ~39 unprotected), move the repeated `await import()` into a `beforeAll()` hook. This:

- Charges import cost against `hookTimeout` (10s default) instead of `testTimeout` (5s default)
- Pays the import cost **once** per `describe` block instead of per-test
- Makes test bodies synchronous — faster, cleaner, more deterministic
- Eliminates the need for any timeout overrides

```typescript
// BEFORE (anti-pattern — import inside test, charged against 5s testTimeout):
it('renders a contextual error boundary', async () => {
  const DashboardError = (await import('./error')).default;
  const html = renderToStaticMarkup(
    <DashboardError error={new Error('boom')} reset={() => {}} />,
  );
  expect(html).toContain('Dashboard');
}, 10_000);  // ← magic number band-aid

// AFTER (import in beforeAll, charged against 10s hookTimeout):
let DashboardError: typeof import('./error')['default'];

beforeAll(async () => {
  DashboardError = (await import('./error')).default;
});

it('renders a contextual error boundary', () => {
  const html = renderToStaticMarkup(
    <DashboardError error={new Error('boom')} reset={() => {}} />,
  );
  expect(html).toContain('Dashboard');
});
// No magic number. No override. Test body is synchronous.
```

**Why `vi.mock()` still works:** Vitest hoists `vi.mock()` calls above all imports and hooks. The mock is in place before `beforeAll()` runs, so the dynamic import resolves the mocked module correctly.

#### Part 2: Set global timeouts as safety net

Add explicit timeouts to all 3 Vitest config files:

```typescript
export default defineConfig({
  test: {
    testTimeout: 10_000,
    hookTimeout: 15_000,
    // ...
  },
});
```

- `testTimeout: 10_000` — 2x the default. Catches genuinely hanging tests within 10s (not 15s), preserving fast-fail signal. With a 55s suite, 10s per failure is acceptable.
- `hookTimeout: 15_000` — 1.5x the default. Accommodates the heaviest import chains (`container.ts` with all 10 repos + Drizzle) during `beforeAll()`.

#### Part 3: Remove all 29 magic-number overrides

After Parts 1 and 2, remove every ad-hoc timeout (both positional and `{ timeout }` syntax). The global config is the safety net; the `beforeAll` pattern is the fix.

#### Part 4: Update `testing-react19.md`

Update the project rule to recommend the `beforeAll` pattern for files with multiple tests importing the same module:

```typescript
// Single-test files (simple — keep inline import):
it('renders correctly', async () => {
  const MyComponent = (await import('./MyComponent')).default;
  // ...
});

// Multi-test files (use beforeAll to pay import cost once):
let MyComponent: typeof import('./MyComponent')['default'];

beforeAll(async () => {
  MyComponent = (await import('./MyComponent')).default;
});

it('renders correctly', () => {
  // ...
});
```

### Exception: `container.skip-clerk.test.ts`

This file uses `vi.resetModules()` + `vi.doMock()` per-test with different mock configurations for each test. Each test **must** call `await import('./container')` after its own `vi.doMock()` setup to get a fresh module evaluation. The `beforeAll` pattern does not apply here.

These 2 overrides (currently `20_000`) should be removed only if the global `hookTimeout: 15_000` is sufficient (test with the import in a per-test `beforeEach` if possible), or kept with a comment explaining why.

### Discarded alternatives

**Bumping `testTimeout` to 15s alone (Option A in earlier draft):** This was the original recommendation. It's a valid safety net but it's **not a fix** — it raises the pain threshold without addressing the root cause. Tests that should take <100ms of execution time would get a 15s budget, masking legitimate hangs. The `beforeAll` pattern is the actual fix.

**Adding `10_000` to just the 3 flaking tests (band-aid):** Creates override #28, #29, #30. The codebase already has 27. This is how we got here.

**`server.warmup` for Vite transform cache:** This is for Vite's HTTP dev server, not Vitest worker threads. No evidence it helps in test context. Discarded.

**Static top-level imports (Option C in earlier draft):** Would work — `vi.mock()` hoists above static imports. But requires auditing every file for subtle import-order dependencies and doesn't preserve the lazy-evaluation semantics the `testing-react19.md` rule was designed around. The `beforeAll` dynamic import is safer and achieves the same goal.

## Acceptance Criteria

- [ ] All 3 Vitest config files have explicit `testTimeout` and `hookTimeout` values
- [ ] All ~56 files with `await import()` inside `it()` migrated to `beforeAll` import pattern (except `container.skip-clerk.test.ts` if structurally incompatible, and single-test files where inline import is acceptable)
- [ ] All 29 magic-number timeout overrides removed (or justified with a comment for exceptions)
- [ ] `testing-react19.md` updated with `beforeAll` guidance for multi-test files
- [ ] The 3 actively flaking tests pass reliably without re-runs (verify with 5 consecutive `pnpm test --run`)
- [ ] No new timeout flakes in the next 10 CI runs
- [ ] Zero remaining `await import()` inside `it()` in multi-test files (grep verification)

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — File size audit (heavy import chains are the upstream root cause)
- [DEBT-204](../_archive/debt/debt-204-stripe-payment-gateway-test-god-file.md) — Previous test god file (resolved, reduced from 2,468 lines)
- [DEBT-110](../_archive/debt/debt-110-e2e-helper-anti-patterns.md) — E2E helper `isVisible` timeout anti-pattern (resolved, different symptom, same theme)
- [Vitest #6441](https://github.com/vitest-dev/vitest/issues/6441) — Persistent module cache feature request (upstream)
- [Vitest timing breakdown](https://sordyl.dev/dev-bites/vitest-timing-breakdown/) — Analysis of where Vitest spends time
- [Vitest #7890](https://github.com/vitest-dev/vitest/discussions/7890) — Dynamic per-suite timeout discussion
