---
paths:
  - "**/*.test.tsx"
---

# React 19 Component Testing (jsdom)

## CRITICAL: Tests will fail in git hooks/CI without these rules.

### Every `.test.tsx` file MUST:

1. Start with `// @vitest-environment jsdom` as the **first line**
2. Use `renderToStaticMarkup` from `react-dom/server` for render-output tests
3. Use dynamic imports for components

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

### DO NOT USE:

- `@testing-library/react` — broken with React 19 + Vitest, zombie maintenance
- `react-test-renderer` — deprecated in React 19
- `react-dom/test-utils` — removed in React 19
- `environmentMatchGlobs` — removed in Vitest 4

### Synchronous hook capture:

Use `renderHook` from `@/src/application/test-helpers/render-hook` (built on `renderToStaticMarkup`).

```typescript
import { renderHook } from '@/src/application/test-helpers/render-hook';
const output = renderHook(() => useMyHook());
expect(output.someValue).toBe(42);
```

Limitation: Cannot observe async state transitions (`useEffect`, `setState` after `await`). Use `*.browser.spec.tsx` for those.

### Full details: `docs/dev/react-vitest-testing.md`
