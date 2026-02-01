# Testing Gotchas

**This document exists because we got burned. Don't repeat our mistakes.**

---

## React 19 + Vitest 4 + act() = Pain

### The Problem

Tests pass locally but fail in git hooks / CI with:
```
TypeError: act is not a function
```

Or worse, they fail **intermittently**.

### Root Cause

React 19 requires `globalThis.IS_REACT_ACT_ENVIRONMENT = true` to be set for `act()` to work correctly. Without it, act() behavior is inconsistent across different shell environments.

Git hooks run in a different environment than your terminal. CI is different again. This causes "works for me" syndrome.

### The Solution

**Three things are required:**

1. **Install jsdom** as a dev dependency:
   ```bash
   pnpm add -D jsdom
   ```

2. **vitest.setup.ts** sets the global flag:
   ```typescript
   (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
   ```

3. **Every `.test.tsx` file** must have this comment at the top:
   ```typescript
   // @vitest-environment jsdom
   ```

This is explicit, per-file environment declaration. No magic, no config inheritance issues.

### Why Not test.projects?

Vitest 4 supports `test.projects` for multi-environment configs. We tried it. It broke with module resolution errors due to alias inheritance issues. The per-file directive is simpler and bulletproof.

### Why Not environmentMatchGlobs?

Deprecated in Vitest 4. Don't use it.

---

## react-test-renderer is Deprecated

React 19 officially deprecates `react-test-renderer`. It still works, but React recommends migrating to `@testing-library/react`.

**Current state:** Our tests use `react-test-renderer` for snapshot/structure tests and `renderToStaticMarkup` for HTML output tests. Both work fine.

**Future:** When adding new component tests, prefer `@testing-library/react`. Migrate existing tests opportunistically.

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

See CLAUDE.md for full details.

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

1. [ ] Add `// @vitest-environment jsdom` at the very top
2. [ ] Import `act` from `'react'` (not react-test-renderer)
3. [ ] Use fakes for DI, not vi.mock() for our code
4. [ ] Follow TDD: write test first, then implementation

---

## Related Issues

- https://github.com/testing-library/react-testing-library/issues/1061
- https://github.com/testing-library/react-testing-library/issues/1392
- https://react.dev/reference/react/act

---

## History

- 2026-02-01: Created after intermittent act() failures in pre-push hooks
