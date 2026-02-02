# DEBT-056: Repeated getDeps Pattern Across 6 Controllers

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

All 6 controllers repeat the same boilerplate pattern for dependency injection:

```typescript
async function getDeps(
  deps?: BillingControllerDeps,
): Promise<BillingControllerDeps> {
  if (deps) return deps;

  const { createContainer } = await import('@/lib/container');
  return createContainer().createBillingControllerDeps();
}
```

This pattern is copied 6 times with only the type and method name changed.

**Affected files:**
- `billing-controller.ts`
- `bookmark-controller.ts`
- `practice-controller.ts`
- `question-controller.ts`
- `review-controller.ts`
- `stats-controller.ts`

## Impact

- Violates DRY principle
- If pattern needs to change (e.g., add caching), must update 6 files
- Each copy is a chance for slight divergence
- Boilerplate clutters each controller

## Resolution

Create a generic factory function:

```typescript
// lib/controller-helpers.ts
export function createDepsResolver<T>(
  createDeps: (container: Container) => T,
) {
  return async function getDeps(deps?: T): Promise<T> {
    if (deps) return deps;
    const { createContainer } = await import('@/lib/container');
    return createDeps(createContainer());
  };
}
```

Usage in controllers:

```typescript
import { createDepsResolver } from '@/lib/controller-helpers';

const getDeps = createDepsResolver(
  (container) => container.createBillingControllerDeps()
);
```

## Verification

- [x] Helper function exists (`lib/controller-helpers.ts`).
- [x] Controllers use `createDepsResolver`.
- [x] Unit tests pass.

## Related

- `src/adapters/controllers/*.ts` — all 6 controller files
- `lib/container.ts`
 - `lib/controller-helpers.ts`
