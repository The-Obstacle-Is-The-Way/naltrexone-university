# DEBT-333: Browser Test Flakiness — Root Cause Analysis and Hardening Plan

**Priority:** P2
**Created:** 2026-03-21
**Source:** Transient failure in `use-practice-session-page-controller.browser.spec.tsx` during DEBT-330 pre-PR gate; pattern has been observed repeatedly across sessions
**Related:** [vitest.browser.config.ts](../../vitest.browser.config.ts), [vitest.browser.setup.ts](../../vitest.browser.setup.ts)

---

## The Problem

Browser-mode Vitest tests (`*.browser.spec.tsx`) intermittently fail on full-suite runs. The test passes in isolation and on rerun. This has been observed multiple times across different sessions and is not tied to any specific code change.

The most recent occurrence was during the DEBT-330 pre-PR gate:
- **Failed test file:** `use-practice-session-page-controller.browser.spec.tsx`
- **Passed in isolation:** Yes
- **Passed on full-suite rerun:** Yes
- **Related to DEBT-330 changes:** No — the changed files (`post-exam-review-view.tsx`, `post-exam-review-view.test.tsx`, `design-principles.md`) have zero overlap with the failing test

This is not a one-off. Transient browser test failures have been dismissed as "just flaky" multiple times. This document establishes the root causes and a hardening plan.

---

## Root Cause Analysis

### RC-1: Missing `await` After Deferred Promise Resolution (CRITICAL)

**The primary root cause.** Four tests in `use-practice-session-page-controller.browser.spec.tsx` resolve or reject a `createDeferred()` promise but do not wait for React's resulting state updates to propagate before the test ends.

**Affected tests:**

| Line | Test Name | Issue |
|------|-----------|-------|
| 716-762 | `does not set transition pending state when toggling bookmarks` | `deferred.resolve()` is the last line — test ends immediately, cleanup races with React state update |
| 764-823 | `uses transition pending state for session answer submit` | `deferred.resolve()` followed by assertion, but no guarantee the microtask has flushed |
| 1333-1422 | `does not auto-advance after submit when review becomes active` | `deferred.resolve()` followed by `await expect.element()` — works most of the time, but can race on slow runners |
| 1424-1518 | `does not update mark-for-review UI state for wrong question` | `deferred.resolve()` after navigation, test assumes stale resolution is ignored |

**Why this causes flakiness:** When a deferred resolves, React schedules a state update via microtask. If the test ends before that microtask completes:
1. The `afterEach` mock reset fires
2. React's state update from the deferred is still in flight
3. The next test's `beforeEach` sets up new mocks
4. The stale state update lands in the next test's environment
5. The next test sees unexpected state and fails

This is a **cross-test contamination** bug, which is why the failing test is often *not* the test with the missing `await` — it's the *next* test that inherits the stale state.

**Fix:** After every `deferred.resolve()` or `deferred.reject()`, either:
- Add an `await expect.element()` or `await expect.poll()` assertion that confirms the state change landed
- Or add `await vi.waitFor(() => { /* verify settled state */ })` if no visible assertion applies

### RC-2: Synchronous `afterEach` Mock Reset Races with Async Cleanup (HIGH)

The `afterEach` at line 136-138 resets all 11 mock controllers synchronously:

```typescript
afterEach(() => {
  resetPracticeSessionPageControllerBrowserMocks();
});
```

This does not wait for in-flight promises to settle. If a test resolved a deferred but didn't `await` the React update, the mock reset and the React state update race against each other.

**Fix:** Make `afterEach` async and add a microtask flush before resetting mocks:

```typescript
afterEach(async () => {
  // Let any in-flight React state updates from deferred resolutions settle
  await new Promise((resolve) => setTimeout(resolve, 0));
  resetPracticeSessionPageControllerBrowserMocks();
});
```

### RC-3: 10-Second Test Timeout Is Tight for Complex Browser Tests (MEDIUM)

`vitest.browser.config.ts` sets `testTimeout: 10_000`. The largest browser spec (`use-question-page-controller.browser.spec.tsx`, 1,837 lines, 18+ tests) runs close to this edge under resource pressure.

In Vitest browser mode, `expect.element()` computes its timeout dynamically as `testTimeout - elapsedTime - 100ms`. A test that spends 6 seconds on setup and rendering leaves only 3.9 seconds for all remaining assertions. On CI or under load, this causes spurious timeouts.

**Fix:** Increase `testTimeout` to 15,000ms to match `hookTimeout`. The 5-second increase costs nothing on fast runs (tests still take their normal wall time) but prevents edge-case timeouts.

### RC-4: Large Test Files Amplify Shared-State Risk (MEDIUM)

Tests within the same file share a browser iframe (DOM, `window`, `document`, event listeners). The largest browser specs:

| File | Lines | Tests | Risk |
|------|-------|-------|------|
| `use-question-page-controller.browser.spec.tsx` | 1,837 | 18+ | High |
| `use-practice-session-page-controller.browser.spec.tsx` | 1,606 | 20 | High |
| `practice-session-page-view.browser.spec.tsx` | 1,321 | ~15 | Medium |

More tests per file = more chances for DOM state leakage, mock collision, and cumulative timing pressure.

**Fix (future):** Split files with 15+ tests into focused groups (e.g., `*-bootstrap.browser.spec.tsx`, `*-navigation.browser.spec.tsx`, `*-bookmarks.browser.spec.tsx`). Each file gets its own iframe, eliminating cross-test DOM contamination.

### RC-5: Missing CSS Animation/Transition Disabling (LOW)

CSS animations and transitions cause elements to be in intermediate visual states during assertions. While most tests use `toHaveTextContent` (unaffected by animations), any test checking visibility or computed styles can be affected.

**Fix:** Add to `vitest.browser.setup.ts`:

```css
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
```

### RC-6: Vite `optimizeDeps` Churn Can Trigger Mid-Run Reloads (LOW)

`vitest.browser.config.ts` pre-bundles `server-only`, `zod`, and `pino`. If any other dependency is discovered at runtime, Vite triggers a hot-reload with the warning: *"Vite unexpectedly reloaded a test. This may cause tests to fail, lead to flaky behaviour or duplicated test runs."*

**Fix:** Monitor for the reload warning during test runs. When it appears, add the named dependency to `optimizeDeps.include`.

---

## Upstream Context (Vitest Known Issues)

These are documented Vitest issues that affect browser mode stability. They are not bugs in our code, but they inform our hardening strategy.

| Vitest Issue | Description | Status | Impact on Us |
|-------------|-------------|--------|-------------|
| [#9509](https://github.com/vitest-dev/vitest/issues/9509) | Flaky "Failed to fetch dynamically imported module" in CI | Open | Could cause random module-load failures |
| [#5706](https://github.com/vitest-dev/vitest/issues/5706) | Browser mode shared DOM state between tests | Open | Why large test files are riskier |
| [#7871](https://github.com/vitest-dev/vitest/issues/7871) | Dynamic timeout computation causes spurious timeouts | Open | Why our 10s timeout is tight |
| [#9499](https://github.com/vitest-dev/vitest/issues/9499) | Mock state leaks between files in same worker | Open | Why mock reset timing matters |
| [#7834](https://github.com/vitest-dev/vitest/issues/7834) | Proposal: `--retry-isolated` for clean-environment retries | Open (not implemented) | Would be the ideal upstream fix |
| [#7822](https://github.com/vitest-dev/vitest/issues/7822) | React unmount race condition during cleanup | Open | Can cause "Cannot finish unmounting" errors |

---

## Hardening Plan

### Phase 1: Fix the Root Cause (RC-1 + RC-2) — Estimated: Small

This is the fix that will eliminate the observed flakiness:

1. Audit all `deferred.resolve()` / `deferred.reject()` calls across all `*.browser.spec.tsx` files
2. Ensure every deferred resolution is followed by an assertion that confirms the state change landed (or an explicit microtask flush if no visible state change is expected)
3. Make `afterEach` async in test files that use deferred patterns, adding a microtask flush before mock reset
4. Run the full browser suite 5x consecutively to verify stability

**Files to audit (all files with `deferred.resolve()` / `deferred.reject()` calls):**

| File | Deferred Calls | Known Issue |
|------|---------------|-------------|
| `use-practice-session-page-controller.browser.spec.tsx` | 6 (4 resolve, 1 resolve, 1 reject) | 4 confirmed missing-await instances |
| `use-question-page-controller.browser.spec.tsx` | 4 | Line 784 uses `await deferred.promise` (correct pattern!), others need audit |
| `use-question-page-previous-attempt.browser.spec.tsx` | 2 | Needs audit |
| `use-practice-question-flow.browser.spec.tsx` | 1 | Needs audit |
| `use-practice-session-mark-for-review.browser.spec.tsx` | 1 | Needs audit |
| `use-practice-session-review-stage-state.browser.spec.tsx` | 1 | Needs audit |

**Correct pattern already exists at `use-question-page-controller.browser.spec.tsx:784-785`:**
```typescript
deferred.resolve(ok({ bookmarked: true }));
await deferred.promise;  // ← THIS is the correct approach
```
This proves the right approach is known — it just wasn't applied consistently.

### Phase 2: Config Hardening (RC-3 + RC-5 + RC-6) — Estimated: Trivial

1. Increase `testTimeout` from 10,000 to 15,000 in `vitest.browser.config.ts`
2. Add CSS animation/transition disabling to `vitest.browser.setup.ts`
3. Audit `optimizeDeps.include` for missing entries

### Phase 3: File Splitting (RC-4) — Estimated: Medium, Defer

Split the two largest browser spec files (1,800+ and 1,600+ lines) into focused sub-files. This is optional if Phase 1 eliminates the flakiness, but recommended for long-term maintainability.

---

## Scope

**Primary target:**
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx` (1,606 lines, 20 tests, 4 confirmed deferred race conditions)
- `vitest.browser.config.ts` (timeout adjustment)
- `vitest.browser.setup.ts` (animation disabling)

**Secondary audit:**
- All `*.browser.spec.tsx` files that use `createDeferred` — check for the same missing-await pattern

**Config files:**
- `vitest.browser.config.ts`
- `vitest.browser.setup.ts`

## Acceptance Criteria

- [ ] Every `deferred.resolve()` / `deferred.reject()` in browser specs is followed by an assertion or explicit flush that confirms the state change settled
- [ ] `afterEach` in deferred-heavy test files includes a microtask flush before mock reset
- [ ] `testTimeout` increased to 15,000ms in `vitest.browser.config.ts`
- [ ] CSS animation/transition disabling added to `vitest.browser.setup.ts`
- [ ] Full browser suite (`pnpm test:browser`) passes 5 consecutive runs without failure
- [ ] No regressions in unit tests (`pnpm test --run`)

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Created DEBT-333 | Transient browser test failures have been observed repeatedly. Root cause analysis identified 4 missing-await instances in the most commonly failing spec file, plus config-level hardening opportunities. |
| 2026-03-21 | Priority P2 | Flaky tests erode trust in the test suite and slow down every PR. The root cause (missing `await` after deferred resolution) is a correctness bug in the tests, not just a cosmetic annoyance. |
| 2026-03-21 | Phase 1 is the priority | The deferred race condition (RC-1 + RC-2) is the confirmed root cause of the observed failures. Config hardening (Phase 2) is defense-in-depth. File splitting (Phase 3) is optional. |
