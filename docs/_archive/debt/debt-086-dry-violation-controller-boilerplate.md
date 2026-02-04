# DEBT-086: DRY Violation — Repeated Controller Boilerplate Pattern

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-03
**Resolved:** 2026-02-03

---

## Description

Every controller function follows an identical structure with duplicated boilerplate:

```typescript
const getDeps = createDepsResolver<DepsType, ContainerType>(
  (container) => container.createXxxControllerDeps(),
  loadAppContainer
);

export async function someAction(
  input: unknown,
  deps?: DepsType,
  options?: { loadContainer?: LoadContainerFn<ContainerType> },
): Promise<ActionResult<Output>> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

  try {
    const d = await getDeps(deps, options);
    // ... business logic
  } catch (error) {
    return handleError(error);
  }
}
```

This exact pattern is repeated in **10+ controller files**, each with ~15 lines of boilerplate per action.

## Affected Files

| File | Actions | Boilerplate Lines |
|------|---------|------------------|
| `billing-controller.ts` | 2 | ~30 |
| `practice-controller.ts` | 2 | ~30 |
| `question-controller.ts` | 2 | ~30 |
| `bookmark-controller.ts` | 2 | ~30 |
| `review-controller.ts` | 1 | ~15 |
| `stats-controller.ts` | 1 | ~15 |
| `tag-controller.ts` | 1 | ~15 |
| `question-view-controller.ts` | 1 | ~15 |
| **Total** | **12** | **~180 lines** |

## Why This Is a Problem

1. **Maintenance Burden:** If the pattern needs to change (e.g., add logging, change validation, add middleware), we must update 12+ places.

2. **Copy-Paste Risk:** Easy to introduce subtle bugs when copying the pattern to new controllers.

3. **Inconsistency Risk:** Over time, controllers may drift as different developers modify them.

4. **Obscures Business Logic:** The actual logic is buried in boilerplate.

## The Pattern in Detail

Each action requires:

```typescript
// 1. Module-level dependency resolver (4 lines)
const getDeps = createDepsResolver<TypeA, TypeB>(
  (container) => container.createFooDeps(),
  loadAppContainer
);

// 2. Function signature (5 lines)
export async function fooAction(
  input: unknown,
  deps?: DepsType,
  options?: { loadContainer?: LoadContainerFn<ContainerType> },
): Promise<ActionResult<Output>> {

// 3. Input validation (2 lines)
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return handleError(parsed.error);

// 4. Try-catch wrapper (3 lines overhead)
  try {
    const d = await getDeps(deps, options);
    // actual logic here
  } catch (error) {
    return handleError(error);
  }
}
```

## Resolution Options

### Option A: Higher-Order Function (Recommended)

Create a `createAction` utility:

```typescript
// src/adapters/controllers/create-action.ts
import type { LoadContainerFn } from '@/lib/controller-helpers';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import { handleError, ok } from '@/src/adapters/controllers/action-result';

export type ServerAction<TOutput, TDeps, TContainer> = (
  input: unknown,
  deps?: TDeps,
  options?: { loadContainer?: LoadContainerFn<TContainer> },
) => Promise<ActionResult<TOutput>>;

export function createAction<TInput, TOutput, TDeps, TContainer>(config: {
  schema: z.ZodSchema<TInput>;
  getDeps: (
    deps?: TDeps,
    options?: { loadContainer?: LoadContainerFn<TContainer> },
  ) => Promise<TDeps>;
  execute: (input: TInput, deps: TDeps) => Promise<TOutput>;
}): ServerAction<TOutput, TDeps, TContainer> {
  return async (
    input: unknown,
    deps?: TDeps,
    options?: { loadContainer?: LoadContainerFn<TContainer> },
  ) => {
    const parsed = config.schema.safeParse(input);
    if (!parsed.success) return handleError(parsed.error);

    try {
      const d = await config.getDeps(deps, options);
      const result = await config.execute(parsed.data, d);
      return ok(result);
    } catch (error) {
      return handleError(error);
    }
  };
}

// Usage in controller:
export const getNextQuestion = createAction({
  schema: GetNextQuestionInput,
  getDeps: getDeps,
  execute: async (input, deps) => {
    // Pure business logic here
  },
});
```

**Pros:** Single source of truth for the pattern, clear separation
**Cons:** Requires refactoring all controllers

### Option B: Decorator Pattern

Use TypeScript decorators (experimental):

```typescript
@ServerAction(GetNextQuestionInput)
async getNextQuestion(input: GetNextQuestionInput, deps: Deps) {
  // business logic only
}
```

**Pros:** Clean syntax, removes all boilerplate
**Cons:** Experimental feature, requires TypeScript config changes

### Option C: Accept Current Pattern (Document It)

Keep as-is but add a generator script or template.

**Pros:** No refactoring
**Cons:** Doesn't actually reduce duplication

## Recommendation

**Option A (Higher-Order Function)** balances pragmatism with DRY:
- Doesn't require experimental features
- Can be migrated incrementally
- Makes adding cross-cutting concerns easy (logging, metrics, etc.)

## Impact if Not Addressed

- Adding a new cross-cutting concern (e.g., request tracing) requires modifying 12+ files
- Code reviews must check the boilerplate is correct in every PR
- New developers may copy-paste incorrectly

## Verification

After refactoring:
- [x] TypeScript compiles
- [x] All controller tests pass
- [x] Action signatures unchanged (same input/output types)
- [x] Error handling unchanged

## Resolution

Implemented a shared action wrapper:

- Added `src/adapters/controllers/create-action.ts` (plus tests).
- Migrated server-action controllers to use `createAction(...)` so schema parsing,
  dependency loading, and error handling are consistently applied in one place.

## Related

- `src/adapters/controllers/create-deps-resolver.ts` — Current pattern
- `src/adapters/controllers/handle-error.ts` — Error handler
- `src/adapters/controllers/action-result.ts` — Result type
