# React 19 + Vitest Testing Guide

**Last Updated:** 2026-02-07

This document exists because we got burned. Every claim is validated against official sources.

---

## Testing Decision Matrix

**Use this to pick the right tool for every test you write.**

| What you're testing | Tool | File pattern | Command | act() warnings? |
|---------------------|------|-------------|---------|-----------------|
| Render output (HTML content) | `renderToStaticMarkup` | `*.test.tsx` | `pnpm test` | No |
| Pure logic (no React) | Direct function calls | `*.test.ts` | `pnpm test` | No |
| Synchronous hook capture | `renderHook` (our helper) | `*.test.tsx` | `pnpm test` | No |
| Hooks with async state (`useEffect`, `useState` transitions) | `vitest-browser-react` | `*.browser.spec.tsx` | `pnpm test:browser` | No |
| Interactive UI (clicks, forms) | `vitest-browser-react` | `*.browser.spec.tsx` | `pnpm test:browser` | No |
| Full user journeys (auth, payments) | Playwright | `*.spec.ts` | `pnpm test:e2e` | No |

### The Three Harnesses

**1. `renderToStaticMarkup`** — Render-output tests (jsdom, fast)

```typescript
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
const html = renderToStaticMarkup(<MyComponent />);
expect(html).toContain('Expected text');
```

- First-party React API, works everywhere, no act() dependency
- Limitation: `useEffect` does not run, no interactivity

**2. `renderHook`** — Synchronous hook capture (jsdom, fast)

```typescript
import { renderHook } from '@/src/application/test-helpers/render-hook';
const output = renderHook(() => useMyHook());
expect(output.someValue).toBe(42);
```

- Built on `renderToStaticMarkup` internally
- Captures the hook's initial return value in a single render pass
- Limitation: Cannot observe async state transitions (useEffect, setState after await)

**3. `vitest-browser-react`** — Async hooks and interactive UI (real Chromium, slower)

```tsx
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

test('hook updates state after async operation', async () => {
  const screen = await render(<ComponentThatUsesMyHook />);
  await expect.element(screen.getByText('Loaded')).toBeVisible();
});
```

- Runs in real Chromium via Playwright — no jsdom simulation
- `render()` does not expose `act()` to test code
- `renderHook()` does expose `act()` for explicit state transitions
- Has built-in retry-ability via `expect.element` (no manual polling)
- CDP events + locator retries reduce manual sync/polling work

---

## The Problem (Historical Context)

Tests pass locally but fail in git hooks / CI with:

```text
TypeError: React.act is not a function
```

### React 19 Breaking Change

React 19 moved `act()` from `react-dom/test-utils` to the `react` package ([official upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)).

```typescript
// React 18 (old)
import { act } from 'react-dom/test-utils';  // DEPRECATED

// React 19 (new)
import { act } from 'react';  // CORRECT
```

### @testing-library/react Compatibility Issue

`@testing-library/react` internally still references the deprecated `react-dom/test-utils.act` for backwards compatibility. When Vitest loads the **production build** of `react-dom` (which can happen when `NODE_ENV=production` leaks into the test process), that deprecated export is `undefined`.

**This is a known issue with multiple open GitHub tickets:**
- [#1392 - React.act is not a function in vitest](https://github.com/testing-library/react-testing-library/issues/1392)
- [#1413 - act() warning persists with latest versions](https://github.com/testing-library/react-testing-library/issues/1413)
- [#1061 - Testing environment not configured to support act()](https://github.com/testing-library/react-testing-library/issues/1061)
- [#1385 - render does not await act()](https://github.com/testing-library/react-testing-library/issues/1385)

### Jest vs Vitest

Jest users are largely unaffected because Jest has different module resolution behavior. This issue specifically affects **Vitest + React 19** when the test process resolves production builds (commonly due to `NODE_ENV=production` leakage from the parent shell / GUI Git client).

**Repo hardening:** We force `NODE_ENV=test` at Vitest config load time so `pnpm test --run` is deterministic even if the parent environment has `NODE_ENV=production`.

---

## Required Setup

### 1. jsdom (for `pnpm test`)

```bash
pnpm add -D jsdom
```

### 2. vitest.setup.ts

```typescript
// Tell React we're in a test environment
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
```

([React act() documentation](https://react.dev/reference/react/act))

### 3. Per-file Environment Directive

Every `.test.tsx` file must start with:

```typescript
// @vitest-environment jsdom
```

**Why per-file?** Vitest 4 removed `environmentMatchGlobs` ([Vitest migration guide](https://vitest.dev/guide/migration.html)). The per-file directive is now the only way to set environment per test file.

### 4. Browser Mode (for `pnpm test:browser`)

Config: `vitest.browser.config.ts` — already configured with Playwright + Chromium.

```bash
pnpm test:browser   # Runs *.browser.spec.tsx files in real Chromium
```

---

## Hook Test Migration: `renderLiveHook` to Browser Mode

### Background

Before Browser Mode was set up (Feb 4), we built `renderLiveHook` — a custom harness using `createRoot` in jsdom to test hooks with async state transitions. It works, but produces React act() warnings because jsdom's `createRoot` goes through React's concurrent scheduler.

**Browser Mode is the correct solution for these six suites.** `vitest-browser-react` runs in real Chromium and uses CDP + locator retries for synchronization. `renderHook()` still provides `act()` when explicit update boundaries are needed, but this migration removes the current jsdom `createRoot` warning pattern from these tests.

### Files to Migrate (DEBT-141)

These 6 hook test files currently use `renderLiveHook` in jsdom and should be migrated to `*.browser.spec.tsx` using `vitest-browser-react`:

| Current file (jsdom + renderLiveHook) | Migration target |
|---------------------------------------|------------------|
| `app/(app)/app/practice/hooks/use-practice-session-controls.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/hooks/use-practice-session-history.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/hooks/use-practice-question-flow.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.test.tsx` | `*.browser.spec.tsx` |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.test.tsx` | `*.browser.spec.tsx` |

Supporting test infrastructure:
- `src/application/test-helpers/render-live-hook.tsx` — retire after migration
- `src/application/test-helpers/render-live-hook.test.tsx` — retire after migration

### Migration Pattern

**Before** (jsdom + renderLiveHook — produces act() warnings):

```typescript
// @vitest-environment jsdom
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';

const harness = renderLiveHook(() => useMyHook(props));
try {
  await harness.waitFor(() => true);
  harness.getCurrent().doSomething();
  await harness.waitFor((output) => output.status === 'done');
  expect(harness.getCurrent().result).toBe('expected');
} finally {
  harness.unmount();
}
```


**After** (Browser Mode + vitest-browser-react — zero act() warnings):

```tsx
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

test('hook updates state correctly', async () => {
  // Wrap hook in a minimal component
  function HookConsumer() {
    const output = useMyHook(props);
    return <div data-testid="status">{output.status}</div>;
  }

  const screen = await render(<HookConsumer />);
  // Built-in retry-ability — no manual polling needed
  await expect.element(screen.getByTestId('status')).toHaveTextContent('done');
});
```

### What stays in jsdom

The `renderHook` helper (not `renderLiveHook`) stays. It uses `renderToStaticMarkup` for synchronous hook capture and has zero act() warnings. 40+ test files use it correctly.

---

## The Ecosystem Reality

**@testing-library/react is in zombie maintenance mode:**
- The creator (Kent C. Dodds) moved on and considers it "graduated"
- Kent himself endorses [vitest-browser-react as the successor](https://github.com/vitest-community/vitest-browser-react)
- One part-time maintainer, no bandwidth for React 19 fixes
- 63 open issues, 14 open PRs, core bugs sitting for almost a year
- No timeline for fixes, no assigned developers

**Our stance (2026-02-07):**
- Do NOT use `@testing-library/react` (Vitest + React 19 compatibility broken, no fix coming)
- Use `renderToStaticMarkup` for render-output tests (`pnpm test`)
- Use `renderHook` for synchronous hook capture (`pnpm test`)
- Use `vitest-browser-react` in Browser Mode for async hooks and interactive tests (`pnpm test:browser`)
- Use Playwright for E2E user journeys (`pnpm test:e2e`)

---

## Deprecated Packages (DO NOT USE)

| Package | Status | Source |
|---------|--------|--------|
| `react-test-renderer` | **Deprecated in React 19** | [Official deprecation notice](https://react.dev/warnings/react-test-renderer) |
| `react-dom/test-utils` | **Deprecated in React 19** | [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide) |
| `@testing-library/react` | **Avoid** (zombie maintenance, broken with Vitest + React 19) | [Issue #1392](https://github.com/testing-library/react-testing-library/issues/1392) |
| `environmentMatchGlobs` | **Removed in Vitest 4** | [Vitest Migration Guide](https://vitest.dev/guide/migration.html) |

### Legacy: `renderLiveHook` (internal)

`src/application/test-helpers/render-live-hook.tsx` was built on Feb 1 before Browser Mode was set up. It uses `createRoot` in jsdom, which produces act() warnings. It works but is superseded by `vitest-browser-react`'s `renderHook` / `render` in Browser Mode. Retire after migrating the 6 hook test files listed above.

---

## Fakes Over Mocks

**NEVER use `vi.mock()` for our own code.**

| Pattern | When to Use |
|---------|-------------|
| Fake via DI | Our own repos, gateways, services |
| vi.mock() | External SDKs only (Clerk, Next.js, Stripe) |

```typescript
// CORRECT
const fakeRepo = new FakeUserRepository();
const useCase = new CreateUserUseCase(fakeRepo);

// WRONG
vi.mock('./user-repository');
```

---

## Test File Locations

| Type | Location | Pattern | Command |
|------|----------|---------|---------|
| Unit (logic) | Colocated | `*.test.ts` | `pnpm test` |
| Component (render) | Colocated | `*.test.tsx` | `pnpm test` |
| Hook (async/interactive) | Colocated | `*.browser.spec.tsx` | `pnpm test:browser` |
| Integration | Separate | `tests/integration/*.integration.test.ts` | `pnpm test:integration` |
| E2E | Separate | `tests/e2e/*.spec.ts` | `pnpm test:e2e` |

---

## Checklists

### New `.test.tsx` (render-output)

- [ ] First line: `// @vitest-environment jsdom`
- [ ] Use `renderToStaticMarkup` for render-output tests
- [ ] Use dynamic imports: `const Component = (await import('./Component')).default`
- [ ] Assert on HTML content: `expect(html).toContain('text')`
- [ ] Use fakes for DI, not vi.mock() for our code

### New `.browser.spec.tsx` (async hooks / interactive)

- [ ] Use `import { render } from 'vitest-browser-react'`
- [ ] Use `await expect.element(locator)` for assertions (built-in retry)
- [ ] Run with `pnpm test:browser`
- [ ] Use fakes for DI, not vi.mock() for our code

---

## History

| Date | Change |
|------|--------|
| 2026-02-01 | Created after intermittent act() failures in pre-push hooks |
| 2026-02-01 | Removed react-test-renderer (deprecated in React 19) |
| 2026-02-01 | Standardized on renderToStaticMarkup for render-output tests |
| 2026-02-01 | Validated all claims against official sources |
| 2026-02-01 | Built renderLiveHook workaround for async hook testing in jsdom |
| 2026-02-04 | Added Vitest Browser Mode + vitest-browser-react (`pnpm test:browser`) |
| 2026-02-07 | Clarified 3-tier testing strategy; renderLiveHook superseded by Browser Mode |
| 2026-02-07 | Added hook test migration guide (DEBT-141) |

---

## Sources

All claims in this document are validated against these sources:

- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [React act() Documentation](https://react.dev/reference/react/act)
- [react-test-renderer Deprecation Notice](https://react.dev/warnings/react-test-renderer)
- [Vitest Migration Guide](https://vitest.dev/guide/migration.html)
- [Vitest Browser Mode — Component Testing](https://vitest.dev/guide/browser/component-testing)
- [vitest-browser-react (GitHub)](https://github.com/vitest-community/vitest-browser-react)
- [testing-library/react-testing-library Issue #1392](https://github.com/testing-library/react-testing-library/issues/1392)
- [testing-library/react-testing-library Issue #1061](https://github.com/testing-library/react-testing-library/issues/1061)
- [testing-library/react-testing-library Issue #1413](https://github.com/testing-library/react-testing-library/issues/1413)
