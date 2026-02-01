# Testing Gotchas

**This document exists because we got burned. Don't repeat our mistakes.**

---

## React 19 + Vitest 4 Component Testing

### The Problem

`@testing-library/react` internally uses `react-dom/test-utils` which is broken in React 19. Tests pass locally but fail in git hooks with:

```
TypeError: React.act is not a function
```

### The Solution: renderToStaticMarkup

We use `renderToStaticMarkup` from `react-dom/server` for component tests. It's:
- NOT deprecated
- Works reliably with React 19
- Doesn't depend on broken test utilities

### Required Setup

1. **jsdom** must be installed:
   ```bash
   pnpm add -D jsdom
   ```

2. **vitest.setup.ts** sets the environment flag:
   ```typescript
   (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
   ```

3. **Every `.test.tsx` file** must have this comment at the top:
   ```typescript
   // @vitest-environment jsdom
   ```

### Standard Component Test Pattern

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

### What NOT to Use

| Package | Status | Why |
|---------|--------|-----|
| `react-test-renderer` | Deprecated in React 19 | Removed from codebase |
| `@testing-library/react` | Broken with React 19 | Uses react-dom/test-utils internally |
| `react-dom/test-utils` | Removed in React 19 | Doesn't exist anymore |

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
2. [ ] Use `renderToStaticMarkup` from `react-dom/server`
3. [ ] Use dynamic imports: `const Component = (await import('./Component')).default`
4. [ ] Assert on HTML content: `expect(html).toContain('text')`
5. [ ] Use fakes for DI, not vi.mock() for our code
6. [ ] Follow TDD: write test first, then implementation

---

## History

- 2026-02-01: Created after intermittent act() failures in pre-push hooks
- 2026-02-01: Removed react-test-renderer (deprecated)
- 2026-02-01: Removed @testing-library/react (broken with React 19)
- 2026-02-01: Standardized on renderToStaticMarkup
