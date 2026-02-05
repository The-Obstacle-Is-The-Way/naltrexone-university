# React 19 + Vitest Testing Guide

**Last Updated:** 2026-02-04

This document exists because we got burned. Every claim is validated against official sources.

---

## The Problem

Tests pass locally but fail in git hooks / CI with:

```text
TypeError: React.act is not a function
```

---

## Root Cause (Validated)

### React 19 Breaking Change

React 19 moved `act()` from `react-dom/test-utils` to the `react` package ([official upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)).

```typescript
// React 18 (old)
import { act } from 'react-dom/test-utils';  // ❌ DEPRECATED

// React 19 (new)
import { act } from 'react';  // ✅ CORRECT
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

## Our Solution: renderToStaticMarkup

For tests that only verify render output (HTML content), we use `renderToStaticMarkup` from `react-dom/server`:

```typescript
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('MyComponent', () => {
  it('renders expected content', async () => {
    const MyComponent = (await import('./MyComponent')).default;
    const html = renderToStaticMarkup(<MyComponent />);
    expect(html).toContain('Expected text');
  });
});
```

**Why this works:**
- First-party React API from `react-dom/server`
- NOT deprecated, NOT experimental
- Does NOT depend on `act()` at all
- Works reliably in all environments (node, jsdom, CI, git hooks)

**Limitation:** Does not support interactive testing (clicks, form input, state changes). `useEffect` does not run during server-side rendering.

---

## Required Setup

### 1. Install jsdom

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

---

## When You Need Interactive Tests

### Preferred: Vitest Browser Mode + `vitest-browser-react`

For unit-level **interactive** UI tests (clicks, form input, state changes), use Vitest Browser Mode (Chromium via Playwright) with `vitest-browser-react`.

This repo is configured for it:

- Config: `vitest.browser.config.ts`
- Setup: `vitest.browser.setup.ts`
- Script: `pnpm test:browser`
- Naming convention: `*.browser.spec.tsx` (kept separate from render-output `.test.tsx` files)

Example:

```tsx
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

test('fires onClick when clicked', async () => {
  const onClick = vi.fn();
  const screen = await render(<button onClick={onClick}>Click</button>);
  await screen.getByRole('button', { name: 'Click' }).click();
  expect(onClick).toHaveBeenCalledTimes(1);
});
```

### Alternative: Playwright E2E

For full user journeys (auth, Stripe checkout, navigation), prefer Playwright (`pnpm test:e2e`). E2E tests are slower but validate real integrations end-to-end.

---

## The Ecosystem Reality

**@testing-library/react is in zombie maintenance mode:**
- The creator moved on and considers it "graduated"
- One part-time maintainer, no bandwidth for React 19 fixes
- 63 open issues, 14 open PRs, core bugs sitting for almost a year
- No timeline for fixes, no assigned developers

**Our stance (2026-02-04):**
- Avoid `@testing-library/react` in this repo (Vitest + React 19 + production resolution issues in hooks/CI).
- Use `vitest-browser-react` **only in Browser Mode** (`pnpm test:browser`) for interactive tests.

The goal is pragmatic stability: keep CI green, and still have a path to verify user interactions.

---

## Deprecated Packages (DO NOT USE)

| Package | Status | Source |
|---------|--------|--------|
| `react-test-renderer` | **Deprecated in React 19** | [Official deprecation notice](https://react.dev/warnings/react-test-renderer) |
| `react-dom/test-utils` | **Deprecated in React 19** | [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide) |
| `environmentMatchGlobs` | **Removed in Vitest 4** | [Vitest Migration Guide](https://vitest.dev/guide/migration.html) |

### react-test-renderer Deprecation (Official Statement)

From [react.dev](https://react.dev/warnings/react-test-renderer):

> react-test-renderer is deprecated. A warning will fire whenever calling ReactTestRenderer.create() or ReactShallowRender.render().
>
> react-test-renderer is deprecated and no longer maintained. It will be removed in a future version.

The React team recommends migrating to `@testing-library/react`. In this repo we route around the Vitest compatibility issue by using render-only tests for `.test.tsx` and Browser Mode for interactions.

---

## Fakes Over Mocks

**NEVER use `vi.mock()` for our own code.**

| Pattern | When to Use |
|---------|-------------|
| Fake via DI | Our own repos, gateways, services |
| vi.mock() | External SDKs only (Clerk, Next.js, Stripe) |

```typescript
// ✅ CORRECT
const fakeRepo = new FakeUserRepository();
const useCase = new CreateUserUseCase(fakeRepo);

// ❌ WRONG
vi.mock('./user-repository');
```

---

## Test File Locations

| Type | Location | Pattern |
|------|----------|---------|
| Unit | Colocated | `*.test.ts` next to source |
| Component | Colocated | `*.test.tsx` next to source |
| Integration | Separate | `tests/integration/*.integration.test.ts` |
| E2E | Separate | `tests/e2e/*.spec.ts` |

---

## Checklist for New .test.tsx Files

- [ ] First line: `// @vitest-environment jsdom`
- [ ] Use `renderToStaticMarkup` for render-output tests
- [ ] Use dynamic imports: `const Component = (await import('./Component')).default`
- [ ] Assert on HTML content: `expect(html).toContain('text')`
- [ ] Use fakes for DI, not vi.mock() for our code
- [ ] **Do NOT use @testing-library/react** — zombie maintenance, no fix coming
- [ ] For interactive tests: create `*.browser.spec.tsx` and run `pnpm test:browser`

---

## History

| Date | Change |
|------|--------|
| 2026-02-01 | Created after intermittent act() failures in pre-push hooks |
| 2026-02-01 | Removed react-test-renderer (deprecated in React 19) |
| 2026-02-01 | Standardized on renderToStaticMarkup for render-output tests |
| 2026-02-01 | Validated all claims against official sources |
| 2026-02-01 | Confirmed vitest-browser-react has same act() bug — not a fix |
| 2026-02-04 | Added Vitest Browser Mode + vitest-browser-react (`pnpm test:browser`) |
| 2026-02-01 | Documented ecosystem debt reality (Testing Library in zombie state) |

---

## Sources

All claims in this document are validated against these sources:

- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [React act() Documentation](https://react.dev/reference/react/act)
- [react-test-renderer Deprecation Notice](https://react.dev/warnings/react-test-renderer)
- [Vitest Migration Guide](https://vitest.dev/guide/migration.html)
- [testing-library/react-testing-library Issue #1392](https://github.com/testing-library/react-testing-library/issues/1392)
- [testing-library/react-testing-library Issue #1061](https://github.com/testing-library/react-testing-library/issues/1061)
- [testing-library/react-testing-library Issue #1413](https://github.com/testing-library/react-testing-library/issues/1413)
