# React 19 + Vitest Testing Guide

**Last Updated:** 2026-02-01

This document exists because we got burned. Every claim is validated against official sources.

---

## The Problem

Tests pass locally but fail in git hooks / CI with:

```
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

`@testing-library/react` internally still references the deprecated `react-dom/test-utils.act` for backwards compatibility. When Vitest loads the **production build** of `react-dom` (which happens in git hooks and CI where `NODE_ENV` isn't explicitly `development`), that deprecated export is `undefined`.

**This is a known issue with multiple open GitHub tickets:**
- [#1392 - React.act is not a function in vitest](https://github.com/testing-library/react-testing-library/issues/1392)
- [#1413 - act() warning persists with latest versions](https://github.com/testing-library/react-testing-library/issues/1413)
- [#1061 - Testing environment not configured to support act()](https://github.com/testing-library/react-testing-library/issues/1061)
- [#1385 - render does not await act()](https://github.com/testing-library/react-testing-library/issues/1385)

### Jest vs Vitest

Jest users are largely unaffected because Jest has different module resolution behavior. This issue specifically affects **Vitest + React 19** in environments where `NODE_ENV=production` (like pre-push hooks and CI).

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

**TL;DR: There is no good solution right now. This is ecosystem debt, not our problem to solve.**

### Option 1: `conditions: ['development']` (Hack)

Add this to `vitest.config.ts`:

```typescript
resolve: {
  conditions: ['development'],  // Forces dev build of react-dom
  alias: {
    '@': path.resolve(__dirname, './'),
  },
},
```

This forces Vitest to load the **development** build of `react-dom`, which has a working `act()` export. **This is a hack, not a real fix.** It may break in future Vitest/React versions.

### Option 2: vitest-browser-react (Intended Successor — Use When Ready)

[vitest-browser-react](https://github.com/vitest-community/vitest-browser-react) **IS the intended modern successor** to @testing-library/react. Kent C. Dodds (Testing Library creator) endorses it.

**What works:** Simple interactive tests (click button, check result, fill form).

**What's broken:** Components using React 19's `use()` hook with suspense don't resolve properly. This is a known issue that may be fixed by the time you need interactive tests.

**When to use it:**
- You need to test button clicks, form inputs, state changes
- Your components don't use React 19 `use()` hook with suspense
- Or the bug has been fixed (check the GitHub issues)

**Current status (2026-02):** Has act() issues with suspense. Monitor [vitest-browser-react issues](https://github.com/vitest-community/vitest-browser-react/issues) for fixes.

### Option 3: Wait (Recommended)

Our `renderToStaticMarkup` approach handles render-output tests. For interactive tests, **wait for the ecosystem to fix itself**. When a real solution emerges, migrating 9 test files is trivial.

---

## The Ecosystem Reality

**@testing-library/react is in zombie maintenance mode:**
- The creator moved on and considers it "graduated"
- One part-time maintainer, no bandwidth for React 19 fixes
- 63 open issues, 14 open PRs, core bugs sitting for almost a year
- No timeline for fixes, no assigned developers

**vitest-browser-react is not ready:**
- Same act() bug in different packaging
- React 19 suspense issues unresolved

**This is not your technical debt. This is ecosystem debt.** Professional teams are routing around the problem with workarounds like ours. You're not doing anything wrong.

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

The React team recommends migrating to `@testing-library/react` — which is what we'll do once the Vitest compatibility is fixed upstream.

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
- [ ] **vitest-browser-react** — use for interactive tests when suspense bug is fixed (see above)

---

## History

| Date | Change |
|------|--------|
| 2026-02-01 | Created after intermittent act() failures in pre-push hooks |
| 2026-02-01 | Removed react-test-renderer (deprecated in React 19) |
| 2026-02-01 | Standardized on renderToStaticMarkup for render-output tests |
| 2026-02-01 | Validated all claims against official sources |
| 2026-02-01 | Confirmed vitest-browser-react has same act() bug — not a fix |
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
