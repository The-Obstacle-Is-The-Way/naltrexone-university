# DEBT-333: Browser Test Flakiness — Deferred-Pattern Audit and Hardening Plan

**Priority:** P2  
**Created:** 2026-03-21  
**Source:** Transient failure in `use-practice-session-page-controller.browser.spec.tsx` during the DEBT-330 pre-PR gate; the same "fails in full suite, passes in isolation/rerun" pattern has been observed across sessions  
**Related:** [vitest.browser.config.ts](../../vitest.browser.config.ts), [vitest.browser.setup.ts](../../vitest.browser.setup.ts)  
**External references:** [Vitest browser config](https://vitest.dev/config/browser), [Vitest Playwright/browser guide](https://vitest.dev/guide/browser/playwright.html), [Vite dep optimization](https://vite.dev/config/dep-optimization-options)

---

## Executive Summary

This document was re-audited from production code, not from the earlier draft. The earlier analysis correctly identified the **class** of bug but overstated the number of confirmed offenders.

### Verified facts

- `tests/test-helpers/create-deferred.ts` is a minimal `{ promise, resolve, reject }` wrapper. Calling `resolve` / `reject` only settles the promise; it does **not** wait for React or hook state to settle.
- Repo-wide audit coverage: **19 test files** using `createDeferred` (or an equivalent local helper), **69** `resolve` / `reject` call sites total.
- Safety classification across all audited call sites:
  - **SAFE:** 68
  - **HIGH:** 0
  - **CRITICAL:** 1
- The **one confirmed browser-spec offender** is:
  - `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx:761`
  - Test: `does not set transition pending state when toggling bookmarks`
  - Problem: `deferred.resolve(...)` is the last statement before the test ends
- No `*.browser.spec.tsx` file in the repo is missing `await render(...)` or `await renderHook(...)`.
- No browser spec uses `vi.useFakeTimers()` / `vi.useRealTimers()`.
- No browser spec performs direct DOM mutation that persists across tests. A few files do read-only `document.querySelector(...)` / `document.getElementById(...)`.
- Running `pnpm test:browser 2>&1 | head -200` produced **no** `Vite unexpectedly reloaded a test` warning and no dependency-optimization warning.

### Bottom line

The confirmed flakiness root cause is **narrower** than the first draft claimed:

1. One browser test ends immediately after resolving a deferred promise.
2. Synchronous `afterEach` mock reset amplifies that bug because shared mocks are reset before late microtasks finish.
3. Large same-file browser specs and our tighter-than-default browser timeouts are pressure multipliers, not the primary correctness bug.

The Phase 1 fix scope should **contract**, not expand: fix the one CRITICAL call site first, then optionally add a defensive microtask flush to the same file's `afterEach`.

---

## The Problem

Browser-mode Vitest tests (`*.browser.spec.tsx`) intermittently fail on full-suite runs while passing in isolation and on rerun. The most recent occurrence was:

- **Failed test file:** `use-practice-session-page-controller.browser.spec.tsx`
- **Passed in isolation:** Yes
- **Passed on full-suite rerun:** Yes
- **Overlap with DEBT-330 implementation:** None

This is a classic cross-test contamination symptom: the test that fails is not necessarily the test that contains the bug.

---

## Verified Root Causes

### RC-1: One confirmed unawaited deferred resolution in browser mode (CRITICAL)

The helper in `tests/test-helpers/create-deferred.ts` is:

```ts
export function createDeferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred promise resolved before initialization');
  };
  let reject: (reason?: unknown) => void = () => {
    throw new Error('Deferred promise rejected before initialization');
  };

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
```

The only audited browser call site that resolves a deferred and then exits immediately is:

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx:761`

Why this is the real bug:

1. `deferred.resolve(...)` settles the promise.
2. The hook schedules follow-up state work asynchronously.
3. The test ends before that work is proven to have landed.
4. `afterEach` runs and resets shared controller mocks.
5. The late state update can then observe a reset/mock-reconfigured environment and contaminate the next test.

This is the confirmed cross-test contamination vector behind the observed "next test fails" pattern.

### RC-2: Synchronous `afterEach` reset is a force multiplier, not a standalone root cause (HIGH)

The key affected file uses:

```ts
afterEach(() => {
  resetPracticeSessionPageControllerBrowserMocks();
});
```

That hook is synchronous and resets **11 shared hoisted controller mocks**. On its own, that is not a bug. It becomes risky only when a prior test leaves async work in flight.

The same pattern exists in other browser specs, but after auditing every deferred site, only `use-practice-session-page-controller.browser.spec.tsx:761` is currently confirmed to end with unresolved post-resolution state work.

Conclusion:

- **Keep the root cause attached to the bad test.**
- Treat async `afterEach` flushes as **defense in depth**, not as proof that every deferred-heavy file is currently broken.

### RC-3: Browser timeouts are tighter than Vitest's defaults (MEDIUM)

`vitest.browser.config.ts` currently sets:

- `testTimeout: 10_000`
- `hookTimeout: 15_000`

Vitest's current browser config docs list higher defaults when browser mode is enabled:

- `testTimeout`: **15_000**
- `hookTimeout`: **30_000**

So our config is stricter than the current Vitest browser defaults. That does not explain the deferred contamination bug, but it does reduce margin in large browser specs.

Observed suite evidence:

- In the sampled `pnpm test:browser 2>&1 | head -200` run, the slowest file shown was `use-practice-session-page-controller.browser.spec.tsx` at **4470ms**.
- That means timeout pressure is real but was **not** close to tripping in the sampled run.

Conclusion:

- Raising `testTimeout` back to 15s is reasonable hardening.
- It is **not** the primary fix for the confirmed transient contamination bug.

### RC-4: Large same-file browser specs amplify risk (MEDIUM)

Vitest's Playwright browser docs explicitly state:

- Vitest opens **a single page for all tests in the same file**
- Vitest creates **a new browser context per test file, not per individual test**

That matches the risk model here exactly: same-file tests share page/DOM/runtime state, so one test ending with pending async work can affect the next test in the same file.

Largest files audited:

| File | Lines | Tests | Deferred call sites | Risk summary |
|------|-------|-------|---------------------|--------------|
| `use-question-page-controller.browser.spec.tsx` | 1,837 | 22 | 12 | Large, deferred-heavy, sync reset hook, but all audited call sites are SAFE |
| `use-practice-session-page-controller.browser.spec.tsx` | 1,606 | 20 | 7 | Large, deferred-heavy, 11 shared mocks, contains the one CRITICAL site |
| `practice-session-page-view.browser.spec.tsx` | 1,321 | 20 | 0 | Large but render-only; no deferred pattern, no reset hooks, read-only DOM queries only |

### RC-5: Browser setup omits global motion reduction and cleanup helpers (LOW)

`vitest.browser.setup.ts` currently:

- imports `vitest-browser-react`
- mocks `@sentry/nextjs`
- mocks `next/link`

It does **not**:

- disable CSS animations/transitions
- inject reduced-motion styles
- perform any global browser cleanup

This is a low-priority hardening gap. Current evidence does **not** show animation-driven flakes, and most audited browser assertions are text/content based rather than animation-sensitive.

### RC-6: `optimizeDeps` churn is theoretical right now, not observed (LOW)

`vitest.browser.config.ts` includes:

```ts
optimizeDeps: {
  include: ['server-only', 'zod', 'pino'],
},
```

Vite's dep-optimization docs say warnings will point you at packages that should be added to `optimizeDeps.include` or related dep options. In our sampled run:

- `pnpm test:browser 2>&1 | head -200` showed **no** reload warning
- No dependency name was emitted

Conclusion:

- Keep monitoring for the warning.
- Do **not** add speculative packages to `optimizeDeps.include` without an observed warning.

---

## Browser Hook Audit

### `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

- `beforeAll`: dynamically imports probe components
- `beforeEach` (`99-124`): seeds default summary/bookmark/draft mocks
- `afterEach` (`136-138`): synchronous `resetPracticeSessionPageControllerBrowserMocks()`; no flush
- Collision surface: **highest in repo**
  - 11 shared hoisted controller mocks
  - 20 tests
  - 7 deferred resolve/reject sites

### `app/(app)/app/questions/[slug]/use-question-page-controller.browser.spec.tsx`

- `beforeEach` (`184-187`): seeds default bookmark mocks
- `afterEach` (`189-197`): synchronous mock reset of 7 shared controller mocks; no flush
- Collision surface: high, but all deferred call sites audited SAFE

### `app/(app)/app/questions/[slug]/use-question-page-previous-attempt.browser.spec.tsx`

- No `beforeEach`
- `afterEach` (`113-116`): synchronous reset of 2 mocks; no flush
- Low deferred count; both call sites SAFE

### `app/(app)/app/history/hooks/use-history-sessions.browser.spec.tsx`

- No `beforeEach`
- `afterEach` (`87-90`): synchronous `vi.restoreAllMocks()` plus 2 mock resets; no flush
- Deferred race coverage present, but all call sites SAFE

### `app/(app)/app/practice/hooks/use-practice-question-answer-flow.browser.spec.tsx`

- No `beforeEach`
- `afterEach` (`57-60`): synchronous resets and `vi.restoreAllMocks()`
- Single deferred submit call site; SAFE

### `app/(app)/app/practice/hooks/use-practice-question-flow.browser.spec.tsx`

- No `beforeEach`
- `afterEach` (`98-100`): synchronous `vi.restoreAllMocks()`
- Single deferred submit call site; SAFE

### `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.browser.spec.tsx`

- No `beforeEach`
- `afterEach` (`50-54`): synchronous restore/reset of 2 mocks
- Single deferred review-load call site; SAFE

### `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.browser.spec.tsx`

- No `beforeEach`
- `afterEach` (`23-25`): synchronous `vi.restoreAllMocks()`
- Single deferred mark-for-review call site; SAFE

### `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx`

- No `beforeEach`
- No `afterEach`
- Single deferred finalize call site; SAFE

---

## Complete Deferred Call-Site Inventory

### Status Legend

- **SAFE:** The call is followed by `await deferred.promise`, `await expect.element(...)`, `await expect.poll(...)`, or another awaited async flush/assertion before test end.
- **HIGH:** The call is followed only by synchronous work/assertions and does not explicitly wait for settlement before test end.
- **CRITICAL:** The call is effectively the last statement before the test ends.

### Browser Specs

#### `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

- `266` `deferredSummary.resolve(...)` — **SAFE**. Followed by awaited DOM assertions on `active-view` / `question-id`.
- `591` `deferredRetrySummary.resolve(...)` — **SAFE**. Followed by awaited DOM assertions and `expect.poll`.
- `761` `deferred.resolve(...)` — **CRITICAL**. Last statement before the test ends.
- `809` `deferred.resolve(...)` — **SAFE**. Followed by awaited DOM assertion on `is-pending=false`.
- `1404` `deferred.resolve(...)` — **SAFE**. Followed by awaited DOM assertions and `expect.poll`.
- `1507` `deferred.resolve(...)` — **SAFE**. Followed by awaited DOM assertions on `question-id`, `is-marking`, and `marked-for-review`.
- `1594` `deferred.reject(...)` — **SAFE**. Followed by awaited DOM assertions on `is-marking`, `load-status`, and `question-id`.

#### `app/(app)/app/questions/[slug]/use-question-page-controller.browser.spec.tsx`

- `284` `deferred.resolve(...)` — **SAFE**. Followed by `await deferred.promise`.
- `384` `deferred.resolve(...)` — **SAFE**. Followed by `await deferred.promise`.
- `670` `deferred.resolve(...)` — **SAFE**. Followed by `await deferred.promise` plus awaited DOM assertions.
- `784` `deferred.resolve(...)` — **SAFE**. Followed by `await deferred.promise` plus awaited DOM assertion.
- `1243` `deferred2.resolve(...)` — **SAFE**. Followed by awaited DOM assertion on `session-nav-index`.
- `1249` `deferred1.resolve(...)` — **SAFE**. Followed by `await deferred1.promise`, `await Promise.resolve()`, and awaited DOM assertion.
- `1310` `deferredSecond.resolve(...)` — **SAFE**. Followed by awaited DOM assertion on `question-slug`.
- `1323` `deferredFirst.resolve(...)` — **SAFE**. Followed by `await deferredFirst.promise` and awaited DOM assertion.
- `1411` `deferredSecond.resolve(...)` — **SAFE**. Followed by awaited DOM assertions on `attempt-id` / `selected-choice`.
- `1431` `deferredFirst.resolve(...)` — **SAFE**. Followed by `await deferredFirst.promise` and awaited DOM assertions.
- `1516` `deferredPrevious.resolve(...)` — **SAFE**. Followed by `await deferredPrevious.promise` and awaited DOM assertion.
- `1596` `deferredSubmit.resolve(...)` — **SAFE**. Followed by `await deferredSubmit.promise` and awaited DOM assertion.

#### `app/(app)/app/history/hooks/use-history-sessions.browser.spec.tsx`

- `212` `deferredB.resolve(...)` — **SAFE**. Followed by awaited DOM assertions on `load-status` / `review-session-id`.
- `221` `deferredA.reject(...)` — **SAFE**. Followed by `await expect(deferredA.promise).rejects...` and awaited DOM assertions.
- `258` `deferred1.resolve(...)` — **SAFE**. Covered by later awaited DOM assertions after both race branches settle.
- `261` `deferred2.resolve(...)` — **SAFE**. Followed by awaited DOM assertions on winner state.

#### `app/(app)/app/questions/[slug]/use-question-page-previous-attempt.browser.spec.tsx`

- `214` `deferred.resolve(...)` — **SAFE**. Followed by `await deferred.promise`.
- `262` `deferred.resolve(...)` — **SAFE**. Followed by `await deferred.promise`, an awaited timer flush, and awaited DOM assertions.

#### `app/(app)/app/practice/hooks/use-practice-question-answer-flow.browser.spec.tsx`

- `120` `submitDeferred.resolve(...)` — **SAFE**. Followed by awaited DOM assertions on `is-pending=false` and next-question state.

#### `app/(app)/app/practice/hooks/use-practice-question-flow.browser.spec.tsx`

- `194` `deferred.resolve(...)` — **SAFE**. Followed by awaited DOM assertion on `is-pending=false`.

#### `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.browser.spec.tsx`

- `176` `deferred.resolve(...)` — **SAFE**. Followed by awaited `expect.poll(...)` on `finalizeSession`.

#### `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.browser.spec.tsx`

- `74` `deferred.resolve(...)` — **SAFE**. Followed by awaiting the pending promise and `expect.poll(...)`.

#### `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx`

- `236` `finalizeDeferred.resolve()` — **SAFE**. Followed by `await finalizeDeferred.promise` and awaited DOM assertions.

### Non-Browser Tests

#### `src/adapters/controllers/clerk-webhook-controller.test.ts`

- `901` `updateReachedUpsert.resolve()` — **SAFE**. Followed by `await updateMayContinue.promise`.
- `973` `updateMayContinue.resolve()` — **SAFE**. Followed by `await updatePromise`.
- `975` `deleteMayWriteTombstone.resolve()` — **SAFE**. Followed by `await deletePromise`.

#### `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts`

- `345` `deferred.resolve(fixture)` — **SAFE**. Followed by `await flushUntil(...)`.
- `356` `deferred.resolve(fixture)` — **SAFE**. Followed by `await expect(promise).resolves...`.

#### `src/adapters/shared/concurrency.test.ts`

- `36` `deferredByItem.get(1)?.resolve()` — **SAFE**. Followed by `await flushUntil(...)`.
- `40` `deferredByItem.get(2)?.resolve()` — **SAFE**. Followed by `await flushUntil(...)`.
- `44` `deferredByItem.get(3)?.resolve()` — **SAFE**. Covered by final `await expect(promise).resolves...`.
- `45` `deferredByItem.get(4)?.resolve()` — **SAFE**. Covered by final `await expect(promise).resolves...`.

#### `app/(app)/app/questions/[slug]/question-page-logic.test.ts`

- `293` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `327` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `642` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `679` `deferred.reject(...)` — **SAFE**. Followed by `await promise`.
- `1005` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `1041` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.

#### `app/(app)/app/practice/practice-page-logic.test.ts`

- `160` `second.resolve(...)` — **SAFE**. Followed by `await loadSecond`.
- `170` `first.resolve(...)` — **SAFE**. Followed by `await loadFirst`.
- `329` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `750` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `784` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `1081` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `1109` `deferred.reject(...)` — **SAFE**. Followed by `await promise`.
- `1140` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `1514` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `1559` `deferred.reject(...)` — **SAFE**. Followed by `await promise`.

#### `app/(app)/app/practice/practice-page-available-count.test.ts`

- `141` `deferred.resolve(...)` — **SAFE**. Followed by awaited timer flush and assertions.

#### `app/(app)/app/practice/practice-page-incomplete-session.test.ts`

- `121` `deferred.resolve(...)` — **SAFE**. Followed by awaited timer flush and assertions.

#### `app/(app)/app/practice/practice-page-tags.test.ts`

- `127` `deferred.resolve(...)` — **SAFE**. Followed by awaited timer flush and assertions.

#### `app/(app)/app/practice/shared/question-flow-actions.test.ts`

- `492` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `696` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `742` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.

#### `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts`

- `94` `second.resolve(...)` — **SAFE**. Followed by `await loadSecond`.
- `110` `first.resolve(...)` — **SAFE**. Followed by `await loadFirst`.
- `336` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `544` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `581` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `842` `deferred.resolve(...)` — **SAFE**. Followed by `await promise`.
- `945` `deferred.resolve(...)` — **SAFE**. Followed by awaited timer flush and assertions.
- `1072` `deferred.resolve(...)` — **SAFE**. Followed by awaited timer flush and assertions.

---

## Other Async Cleanup Hazard Audit

### `render()` / `renderHook()` awaits

Repo-wide browser audit result:

- Every `render(...)` call in `*.browser.spec.tsx` is awaited.
- Every `renderHook(...)` call in `*.browser.spec.tsx` is awaited.
- No missing-await render bug was found.

### Direct DOM access and mutation

Found in browser specs:

- Read-only queries such as `document.querySelector(...)` / `document.getElementById(...)`
- Examples:
  - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx:495`
  - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.browser.spec.tsx:507`

Not found:

- `document.body.innerHTML = ...`
- `appendChild(...)` / `removeChild(...)`
- attribute/class mutations that persist across tests

Conclusion: read-only DOM inspection exists, but no direct DOM mutation hazard was found.

### Timers

Browser-suite audit result:

- No `vi.useFakeTimers()` / `vi.useRealTimers()` in any `*.browser.spec.tsx`
- A few awaited timer flushes exist:
  - `use-question-page-previous-attempt.browser.spec.tsx:276`
  - `practice-view.browser.spec.tsx:364`

Those are awaited inline and do not introduce timer cleanup leakage.

### Promise-returning mocks beyond `createDeferred`

One notable pattern:

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx:183`
  - `onFinalizeReview` returns `new Promise<void>(() => {})`
  - This is intentional for a double-click guard test
  - It does **not** create the same contamination pattern because nothing resolves after test end

No second confirmed async cleanup bug class was found in the browser suite.

---

## Config Audit

### `vitest.browser.config.ts`

Current config:

```ts
test: {
  testTimeout: 10_000,
  hookTimeout: 15_000,
  setupFiles: ['./vitest.setup.ts', './vitest.browser.setup.ts'],
  browser: {
    enabled: true,
    provider: playwright(),
    instances: [{ browser: 'chromium' }],
  },
}
```

Assessment:

- `testTimeout: 10_000` is **tighter** than Vitest's documented browser default of `15_000`
- `hookTimeout: 15_000` is **tighter** than Vitest's documented browser default of `30_000`
- `browser.isolate` is not explicitly set, but isolation is still active via Vitest defaults
- `fileParallelism` is not explicitly set; Vitest's browser docs/CLI document the default as `true`

Should `fileParallelism` be explicitly configured?

- Not for the confirmed bug.
- The contamination pattern here is **within a single file**.
- `fileParallelism` changes how files run relative to each other; it does not change the "same file shares one page" model.
- Explicitly disabling it may reduce resource contention, but it does not fix the confirmed deferred-settlement bug.

### `vitest.browser.setup.ts`

Current setup does:

- import `vitest-browser-react`
- mock `@sentry/nextjs`
- mock `next/link`

Current setup does **not**:

- reduce motion / disable transitions
- install global cleanup hooks
- flush pending work between tests

Conclusion:

- Accurate to call this a hardening opportunity
- Not accurate to present it as the confirmed root cause of the observed flake

---

## Alignment With External Guidance

### Where the suite aligns

- Browser tests consistently `await render(...)` / `await renderHook(...)`
- Browser mode is isolated at the **file** level, matching Vitest's documented model
- Large-file shared-page risk is real and already reflected in how the suite behaves
- `optimizeDeps.include` is already being used for known packages

### Where the suite diverges

- Our browser timeouts are below Vitest's current defaults
- Deferred-heavy browser files use synchronous `afterEach` resets
- `vitest.browser.setup.ts` has no motion reduction / browser cleanup hardening
- One browser test still resolves a deferred and exits immediately

---

## Revised Hardening Plan

### Phase 1: Fix the confirmed correctness bug (Small, do first)

1. Fix `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx:761`
2. After `deferred.resolve(...)`, explicitly wait for settlement before the test ends
3. Preferred pattern:

```ts
deferred.resolve(ok({ bookmarked: true }));
await deferred.promise;
await expect
  .element(screen.getByTestId('bookmark-status'))
  .toHaveTextContent('idle');
```

If that exact assertion is not appropriate, any awaited async assertion or explicit flush that proves the resulting state landed is acceptable.

### Phase 1A: Defense in depth for the same file (Optional but reasonable)

Make the `afterEach` in `use-practice-session-page-controller.browser.spec.tsx` async:

```ts
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  resetPracticeSessionPageControllerBrowserMocks();
});
```

Rationale:

- This is justified in the file that already demonstrated the bug
- It is not yet justified repo-wide from the audited evidence

### Phase 2: Config hardening (Defense in depth)

1. Raise `testTimeout` from `10_000` to `15_000`
2. Consider raising `hookTimeout` from `15_000` to `30_000` to match current browser defaults
3. Optionally disable CSS motion in `vitest.browser.setup.ts` if future flakes implicate visibility/timing transitions
4. Keep `optimizeDeps.include` unchanged unless a reload warning names a missing dependency

### Phase 3: File splitting (Maintainability / long-term containment)

Split the two biggest deferred-heavy browser files only if Phase 1 does not fully stabilize the suite or if they continue to grow:

- `use-question-page-controller.browser.spec.tsx`
- `use-practice-session-page-controller.browser.spec.tsx`

`practice-session-page-view.browser.spec.tsx` is large, but it is currently render-only and lower risk.

---

## Scope

### Primary implementation target

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`

### Secondary hardening targets

- `vitest.browser.config.ts` for timeout alignment with current Vitest defaults
- optionally `vitest.browser.setup.ts` for motion reduction

### Explicit non-targets for the first fix pass

- Safe deferred call sites in other browser specs
- Non-browser/unit deferred tests (all audited SAFE)
- `optimizeDeps.include` changes without a reproduced reload warning
- speculative repo-wide async `afterEach` rewrites

---

## Acceptance Criteria

- [ ] The CRITICAL call site at `use-practice-session-page-controller.browser.spec.tsx:761` is eliminated
- [ ] Every browser-spec `resolve` / `reject` call site remains either SAFE or is upgraded to SAFE
- [ ] No browser-spec call site remains CRITICAL
- [ ] `pnpm test:browser` passes on repeated runs
- [ ] Any `afterEach` async flush added is justified by a proven same-file contamination risk
- [ ] No speculative `optimizeDeps.include` changes are made without an observed warning

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Created DEBT-333 | Full-suite browser runs showed transient failures that passed in isolation. |
| 2026-03-21 | Re-audited the debt from production code | The first draft overstated the number of confirmed bad deferred sites. |
| 2026-03-21 | Classified the deferred inventory as 68 SAFE / 0 HIGH / 1 CRITICAL | This is the actual repo-wide result after auditing every `createDeferred` resolve/reject site. |
| 2026-03-21 | Contracted Phase 1 scope | The only confirmed browser correctness bug is `use-practice-session-page-controller.browser.spec.tsx:761`; broader config/setup work is defense in depth. |
