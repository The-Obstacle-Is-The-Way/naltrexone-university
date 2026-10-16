---
paths:
  - "**/*.browser.spec.tsx"
---

# Browser Mode Testing (vitest-browser-react)

## When to use Browser Mode

Use `*.browser.spec.tsx` for:
- Hooks with async state transitions (`useEffect`, `useState` after `await`)
- Interactive UI testing (clicks, forms, user events)
- Any test that needs real DOM behavior (not jsdom simulation)

Run with: `pnpm test:browser`

## Pattern

```tsx
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

test('hook updates state correctly', async () => {
  function HookConsumer() {
    const output = useMyHook(props);
    return <div data-testid="status">{output.status}</div>;
  }

  const screen = await render(<HookConsumer />);
  await expect.element(screen.getByTestId('status')).toHaveTextContent('done');
});
```

## Key differences from jsdom tests

- Runs in **real Chromium** via Playwright (not jsdom)
- `expect.element()` has **built-in retry-ability**: prefer it for a locator. `expect.poll()` is right for a value no locator reaches, such as a spy's call count
- `unmount()` returns a Promise: await it, like `render()` and `rerender()`, so React's cleanup finishes and an unmount error fails this test
- `toHaveTextContent` matches the whole text exactly (Vitest 5). For a partial or RegExp match, including `.not`, use `toMatchTextContent`
- No `// @vitest-environment jsdom` directive needed
- Config: `vitest.browser.config.mts`

## Controller mocking in Browser Mode

Server-action controllers are Node-only and can't execute in Chromium. Use `vi.mock()` with `{ spy: true }`:

```typescript
vi.mock('@/src/adapters/controllers/practice-controller', { spy: true });
vi.mocked(practiceController.getSessionHistory).mockResolvedValue(ok({...}));
```

`{ spy: true }` preserves unstubbed real exports; factory mocks replace all exports. This is a targeted exception for non-injectable module boundaries.

## Stability tips

- Keep hook inputs/callback refs stable (avoid recreating objects/functions on every render)
- Unstable references cause React effects to re-trigger indefinitely
- Use `useMemo`/`useCallback` in test wrapper components if needed

## Existing browser specs

Find them with `git ls-files '*.browser.spec.tsx'`, and copy the nearest one.
