---
paths:
  - "**/*.test.tsx"
---

# React 19 Component Testing (jsdom)

## CRITICAL: Tests will fail in git hooks/CI without these rules.

### Every `.test.tsx` file MUST:

1. Start with `// @vitest-environment jsdom` as the **first line**
2. Use `renderToStaticMarkup` from `react-dom/server` for render-output tests
3. Use dynamic imports for components, loaded once in `beforeAll` (or `beforeEach` when mock order requires per-test imports)

```typescript
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let MyComponent: typeof import('./MyComponent').default;

beforeAll(async () => {
  MyComponent = (await import('./MyComponent')).default;
});

describe('MyComponent', () => {
  it('renders correctly', () => {
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

### Anchor href assertions:

For exact anchor assertions where the expected `href` contains a query string, `&`, or a generated/interpolated URL value, use `findAnchorByHref()` from `@/tests/shared/dom-helpers`.

```typescript
import { findAnchorByHref } from '@/tests/shared/dom-helpers';

// Bad: routes the URL through CSS attribute-selector parsing.
doc.querySelector('a[href="/path?tab=sessions&sort=desc"]');

// Good: compares the rendered href attribute directly.
findAnchorByHref(doc, '/path?tab=sessions&sort=desc');
```

PR #328 showed that jsdom 26 -> 29 selector/CSS parsing changes can break URL-bearing CSS attribute selectors while the rendered `href` remains correct. `findAnchorByHref()` compares `anchor.getAttribute('href') === href`, bypassing selector parsing entirely.

Prefer `findAnchorByHref()` for new exact anchor href assertions when it reads clearly. Do not churn existing simple static-href `querySelector('a[href="..."]')` sites only for style consistency.

### Full details: `docs/dev/react-vitest-testing.md`
