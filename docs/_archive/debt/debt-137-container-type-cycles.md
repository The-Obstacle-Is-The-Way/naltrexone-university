# DEBT-137: Composition Root Type Cycles Between Container and Controllers

**Status:** Invalidated (False Positive)
**Priority:** P2
**Date:** 2026-02-07
**Invalidated:** 2026-02-07

---

## Description

This finding was invalidated after verification that the reported cycle edges are `import type` only from `lib/container/types.ts`, which are erased at compile time and do not create runtime module cycles.

Validated from first principles:

- `lib/container/types.ts` imports controller dependency types from adapter controllers
- controllers import `createDepsResolver` / `loadAppContainer` from `lib/controller-helpers.ts`
- `lib/controller-helpers.ts` imports the `createContainer` type from `lib/container.ts`
- `lib/container.ts` imports `lib/container/types.ts`

`madge --circular --extensions ts,tsx --ts-config tsconfig.json app src lib` reports 9 circular dependencies rooted in this pattern.

## Impact

- No runtime cycle bug was present.
- No production behavior was at risk.

## Resolution

No code change required. The debt was archived as a tooling false positive.

## Verification

- [x] Type-only edges were confirmed in `lib/container/types.ts`
- [x] TypeScript transpilation confirms those imports erase from runtime output

## Related

- `lib/container.ts`
- `lib/container/types.ts`
- `lib/controller-helpers.ts`
- `lib/container/controllers.ts`
- `src/adapters/controllers/billing-controller.ts`
- `src/adapters/controllers/bookmark-controller.ts`
- `src/adapters/controllers/practice-controller.ts`
