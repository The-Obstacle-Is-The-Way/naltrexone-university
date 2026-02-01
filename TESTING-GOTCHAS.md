# Testing Gotchas

**This document exists because we got burned. Don't repeat our mistakes.**

---

## React 19 + Vitest 4 Component Testing

### The Setup (2026 Best Practices)

React component tests require:

1. **jsdom** environment (not Node)
2. **@testing-library/react** for rendering
3. **@testing-library/jest-dom** for matchers

### Required Dependencies

```bash
pnpm add -D jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom
```

### vitest.setup.ts

```typescript
import '@testing-library/jest-dom/vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
```

### Every `.test.tsx` File

```typescript
// @vitest-environment jsdom   ← MUST be first line
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

### Why Per-File `// @vitest-environment jsdom`?

- Vitest defaults to `node` environment
- React components need a DOM
- Per-file directive is explicit, simple, documented by Vitest
- Avoids `test.projects` alias inheritance issues we encountered

---

## DO NOT USE: react-test-renderer

**Deprecated in React 19. We removed it from this codebase.**

Old pattern (deprecated):
```typescript
// ❌ DEPRECATED - DO NOT USE
import { create } from 'react-test-renderer';
const tree = create(<Component />);
```

New pattern (correct):
```typescript
// ✅ CORRECT
import { render, screen } from '@testing-library/react';
render(<Component />);
expect(screen.getByRole('button')).toBeInTheDocument();
```

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
2. [ ] Use `@testing-library/react` (render, screen)
3. [ ] Use `toBeInTheDocument()` and other jest-dom matchers
4. [ ] Use fakes for DI, not vi.mock() for our code
5. [ ] Follow TDD: write test first, then implementation

---

## History

- 2026-02-01: Created after intermittent act() failures in pre-push hooks
- 2026-02-01: Migrated from deprecated react-test-renderer to @testing-library/react
