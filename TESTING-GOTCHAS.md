# Testing Gotchas

**This document exists because we got burned. Don't repeat our mistakes.**

---

## React 19 + Vitest 4 Component Testing

### The Problem

Tests pass locally but fail in git hooks / CI with:

```
TypeError: React.act is not a function
```

### Root Cause

`@testing-library/react` uses `react-dom/test-utils` internally. In React 19, this module's `act()` function only works with the **development** build of react-dom.

Vitest in git hooks loads the **production** build (because `NODE_ENV` isn't explicitly set), causing `act()` to be undefined.

This is a **known bug** in the ecosystem. It affects: React 19 + Vitest + pre-push hooks/CI. It does NOT affect Jest users or most other setups.

### Our Current Solution: renderToStaticMarkup

For tests that only verify render output (no clicks, no form input, no state changes), we use `renderToStaticMarkup`. It's:
- A first-party React API from `react-dom/server`
- NOT deprecated, NOT experimental
- Works reliably everywhere

**All 9 of our .test.tsx files use this pattern and only check render output.**

### Future: When You Need Interactive Tests

When you write a test that needs to click buttons, type in forms, or test state changes, you'll need `@testing-library/react`.

**The fix:** Add this to `vitest.config.ts`:

```typescript
resolve: {
  conditions: ['development'],  // Forces dev build of react-dom
  alias: {
    '@': path.resolve(__dirname, './'),
  },
},
```

This forces Vitest to load the development build of react-dom, which has a working `act()`.

**Don't add this now.** Add it when you actually write an interactive test. By then, the upstream bug might also be fixed.

---

## Required Setup

1. **jsdom** must be installed:
   ```bash
   pnpm add -D jsdom
   ```

2. **vitest.setup.ts** sets the environment flag:
   ```typescript
   (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
   ```

3. **Every `.test.tsx` file** must have this at the top:
   ```typescript
   // @vitest-environment jsdom
   ```

---

## Standard Component Test Pattern (Render Output Only)

```typescript
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('MyComponent', () => {
  it('renders correctly', async () => {
    const MyComponent = (await import('./MyComponent')).default;
    const html = renderToStaticMarkup(<MyComponent />);
    expect(html).toContain('Expected text');
  });
});
```

---

## What NOT to Use (Currently)

| Package | Status | Notes |
|---------|--------|-------|
| `react-test-renderer` | Deprecated in React 19 | Don't use |
| `@testing-library/react` | Broken with Vitest + React 19 in hooks/CI | See "Future" section above |
| `react-dom/test-utils` | Removed in React 19 | Doesn't exist |
| `environmentMatchGlobs` | Deprecated in Vitest 4 | Don't use |

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

1. [ ] First line: `// @vitest-environment jsdom`
2. [ ] Use `renderToStaticMarkup` for render-output tests
3. [ ] Use dynamic imports: `const Component = (await import('./Component')).default`
4. [ ] Assert on HTML content: `expect(html).toContain('text')`
5. [ ] For interactive tests: add `conditions: ['development']` to vitest config first
6. [ ] Use fakes for DI, not vi.mock() for our code

---

## History

- 2026-02-01: Created after intermittent act() failures in pre-push hooks
- 2026-02-01: Removed react-test-renderer (deprecated in React 19)
- 2026-02-01: Standardized on renderToStaticMarkup for render-output tests
- 2026-02-01: Documented future fix for interactive tests (`conditions: ['development']`)
