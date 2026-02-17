# DEBT-225: Vitest Cold-Import Timeout Flakes

**Status:** Open
**Priority:** P2
**Date:** 2026-02-17
**Component:** Test Infrastructure

---

## Description

Three test files intermittently fail with `Error: Test timed out in 5000ms` on their **first `it()` block only**. They pass on immediate re-run. This is not a behavioral flake (race condition, timing dependency, or non-deterministic logic). It is a **deterministic cost problem**: the first test in each file pays the full ESM module resolution + transpilation + tree-shaking cost for a heavy import chain, and that cost intermittently exceeds Vitest's default 5000ms timeout.

Additionally, **28 ad-hoc timeout overrides** are scattered across **16 test files** — all working around the same root cause. Zero of these overrides protect genuinely long-running operations.

### Actively Flaking Tests (no override, default 5s)

| File | First Test | Import Pattern | Transitive Weight |
|------|-----------|----------------|-------------------|
| `lib/container-modules.test.ts:4` | "exposes modular container builders by bounded context" | `await Promise.all([4 container imports])` | All 10 repositories + `db/schema.ts` (549 lines) + Drizzle |
| `app/(app)/app/practice/components/practice-view.test.tsx:12` | "renders Back to Dashboard link with correct href" | `await import('./practice-view')` | UI component tree + `practice-page-logic` (321 lines) |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx:55` | "renders a Back to Dashboard utility link" | `await import('./question-page-client')` | Controller hooks + question-page-logic + route utils |

### Ad-Hoc Override Inventory (28 instances, 16 files)

| Timeout | Count | Files | Pattern |
|---------|-------|-------|---------|
| 40,000ms | 4 | `lib/container.test.ts` | Container factory integration — heaviest import chain |
| 20,000ms | 17 | `practice/page.test.tsx` (2), `practice/quick/page.test.tsx` (1), `practice/[sessionId]/page.test.tsx` (2), `questions/[slug]/page.test.tsx` (6), `container.skip-clerk.test.ts` (2), 4 others | `renderToStaticMarkup` + `await import()` in `it()` |
| 10,000ms | 7 | `dashboard/error.test.tsx`, `practice/quick/error.test.tsx`, `practice/[sessionId]/error.test.tsx`, `practice/error.test.tsx`, `layout-shell.test.tsx`, `billing/error.test.tsx`, `app/error.test.tsx`, `global-error.test.tsx`, `pricing/page.test.tsx` | Error boundary / page-level render tests |

### Evidence It's Cold-Import, Not Behavioral

1. **Always the first `it()` in the file** — second and subsequent tests in the same file pass instantly because modules are cached
2. **Always exactly 5000ms** — the timeout message is `Test timed out in 5000ms`, which is Vitest's default `testTimeout`
3. **Always passes on re-run** — Vitest's module cache is warm on the second run
4. **No async behavior** — these are `renderToStaticMarkup` tests that execute synchronously once the import resolves; the timeout is spent in module loading, not test execution

## Root Cause

**No `testTimeout` is configured in any of the 3 Vitest config files.** All rely on Vitest's 5000ms default. The codebase uses heavy `await import()` patterns inside test bodies (not at module top-level or in `beforeAll`), so the import cost is counted against the test's timeout budget.

```typescript
// vitest.config.ts — NO testTimeout specified
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // testTimeout: ???  ← missing (defaults to 5000ms)
    // hookTimeout: ???  ← missing (defaults to 10000ms)
  },
});
```

**Affected configs:** `vitest.config.ts`, `vitest.browser.config.ts`, `vitest.integration.config.ts` — none specify `testTimeout` or `hookTimeout`.

### Why Some Tests Already Work

16 test files (28 individual tests) already use inline timeout overrides like `it('...', async () => { ... }, 10_000)`. These were added ad hoc as developers encountered the same cold-import problem. This is the anti-pattern that every Vitest guide warns against — it works but doesn't address the systemic issue, and it will silently repeat as new test files are added.

### Connection to DEBT-224

DEBT-224 tracks file sizes exceeding guidelines. The heaviest import chains (`db/schema.ts` at 549 lines, `drizzle-attempt-repository.ts` at 438 lines, `practice-page-logic.ts` at 321 lines) directly contribute to cold-import time. Reducing file sizes would reduce import time, but wouldn't fully eliminate the problem — even modest import chains can hit 5s on a cold run under load.

### Community Context

- [Vitest issue #6441](https://github.com/vitest-dev/vitest/issues/6441) confirms cold-start module loading is a known community pain point. A contributor proved persistent module caching drops startup from 8s to 200ms — but it's not shipped yet.
- [Vitest timing breakdown analysis](https://sordyl.dev/dev-bites/vitest-timing-breakdown/) confirms "transform" and "setup" are the dominant time sinks, not test execution.
- [Vitest discussion #7890](https://github.com/vitest-dev/vitest/discussions/7890) shows dynamic per-suite timeout is a recurring request — confirming ad-hoc overrides are a common coping mechanism, not a solution.
- No community guide recommends per-test ad-hoc overrides. Every source says: configure globally or restructure the import pattern.

## Impact

- **CI flakes** — 3 tests fail intermittently in CI and on developer machines, requiring re-runs
- **False confidence** — Developers learn to dismiss timeout failures as "just flakes," which could mask real test failures
- **Wasted time** — Each flake requires a re-run (~55s for the full suite)
- **Perception of instability** — Intermittent failures erode trust in the test suite
- **Scattered complexity** — 28 ad-hoc overrides across 16 files add noise and obscure test intent

## Resolution Options

### Option A: Set global `testTimeout` + remove ad-hoc overrides (Recommended — immediate)

Add `testTimeout: 15_000` to all 3 Vitest config files. This gives all tests 15s instead of 5s, accommodating cold imports without being so generous that genuinely hanging tests take forever to fail. Then remove all 28 ad-hoc timeout overrides.

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15_000,
    // ...
  },
});
```

**Exception:** `container.test.ts` uses 40,000ms overrides. These 4 tests load the entire DI container with all 10 repositories + Drizzle. After setting the global to 15s, we should verify whether 15s is sufficient for container tests or if they genuinely need a higher override (this is the one case where an override might be warranted for a legitimately heavy operation).

**Pros:** Eliminates the entire class of flakes. Removes 28 scattered overrides (24–28 depending on container tests). One config change per config file.
**Cons:** Genuinely hanging tests take 15s instead of 5s to fail. Acceptable trade-off given a 55s total suite runtime.

### Option B: Add `10_000` to the 3 failing tests (Band-aid — NOT recommended)

Add timeout overrides to just the 3 actively flaking tests. This is what 16 other files already do.

**Pros:** Minimal change, low risk.
**Cons:** Doesn't address the systemic issue. New test files with heavy imports will hit the same problem. The 28 existing overrides remain scattered across the codebase. Contra community best practice.

### Option C: Move `await import()` into `beforeAll` (Structural fix — future)

Vitest has separate timeout configs: `testTimeout` (default 5s) for `it()` blocks and `hookTimeout` (default 10s) for lifecycle hooks. Moving `await import()` from inside `it()` into `beforeAll()` means the import cost is:

- Paid **once** per `describe` block (not per-test)
- Charged against `hookTimeout` (10s by default) instead of `testTimeout` (5s)
- Completely decoupled from test execution time

```typescript
// Before (anti-pattern — import inside test):
it('renders...', async () => {
  const { PracticeView } = await import('./practice-view');
  const html = renderToStaticMarkup(<PracticeView />);
  expect(html).toContain('...');
}, 20_000);

// After (best practice — import in beforeAll):
let PracticeView: typeof import('./practice-view')['PracticeView'];
beforeAll(async () => {
  ({ PracticeView } = await import('./practice-view'));
});

it('renders...', () => {
  const html = renderToStaticMarkup(<PracticeView />);
  expect(html).toContain('...');
});
```

**Why this is safe:** `vi.mock()` calls are hoisted by Vitest above all imports and hooks. The mock is already in place before `beforeAll()` runs, so the dynamic import resolves the mocked module correctly.

**Pros:** Eliminates the root cause entirely. Tests become synchronous. Import cost paid once. No timeout overrides needed at all. Aligns with Vitest's `hookTimeout` architecture.
**Cons:** Requires updating the `testing-react19.md` rule and migrating ~50 test files. Higher effort but straightforward — each migration is mechanical.

### Recommendation

**Do Option A now** (global `testTimeout: 15_000` + remove ad-hoc overrides). This is a 30-minute fix that eliminates the entire class of flakes immediately.

**Evaluate Option C** as a follow-up. It's the best-practice structural fix, but requires updating project conventions and migrating test files. Can be done incrementally, file by file.

## Acceptance Criteria

- [ ] All 3 Vitest config files have an explicit `testTimeout` value
- [ ] The 3 actively flaking tests pass reliably without re-runs (verify with 5 consecutive `pnpm test --run`)
- [ ] All 28 ad-hoc timeout overrides are evaluated — remove where the global timeout is sufficient, document any that must remain
- [ ] No new timeout flakes in the next 10 CI runs
- [ ] `container.test.ts` verified: can its 40s overrides be reduced to 15s, or does it need a justified override?

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) — File size audit (heavy import chains are the root cause)
- [DEBT-204](../_archive/debt/debt-204-stripe-payment-gateway-test-god-file.md) — Previous test god file (resolved, reduced from 2,468 lines)
- [DEBT-110](../_archive/debt/debt-110-e2e-helper-anti-patterns.md) — E2E helper `isVisible` timeout anti-pattern (resolved, different symptom, same theme)
- [Vitest #6441](https://github.com/vitest-dev/vitest/issues/6441) — Persistent module cache feature request (upstream)
- [Vitest timing breakdown](https://sordyl.dev/dev-bites/vitest-timing-breakdown/) — Analysis of where Vitest spends time
