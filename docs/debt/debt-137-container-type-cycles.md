# DEBT-137: Composition Root Type Cycles Between Container and Controllers

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The current container typing setup creates circular dependencies between composition-root modules and controller modules.

Validated from first principles:

- `lib/container/types.ts` imports controller dependency types from adapter controllers
- controllers import `createDepsResolver` / `loadAppContainer` from `lib/controller-helpers.ts`
- `lib/controller-helpers.ts` imports the `createContainer` type from `lib/container.ts`
- `lib/container.ts` imports `lib/container/types.ts`

`madge --circular --extensions ts,tsx --ts-config tsconfig.json app src lib` reports 9 circular dependencies rooted in this pattern.

## Impact

- Violates acyclic dependency expectations in Clean Architecture support code
- Makes composition-root refactors risky (small import changes can create runtime cycles)
- Increases cognitive load and slows dependency analysis/tooling

## Resolution

1. Break the controller type dependency loop:
   - Move controller dependency type contracts out of controller modules into a neutral type module (for example `src/adapters/controllers/types.ts` or `lib/container/controller-deps.ts`)
   - Keep controllers importing those shared types instead of defining container-facing deps in each controller file
2. Update `lib/container/types.ts` to import only neutral type modules
3. Keep `lib/controller-helpers.ts` free of container type imports that point back into the same graph (prefer a narrow exported container interface type)

## Verification

- [ ] `pnpm dlx madge --circular --extensions ts,tsx --ts-config tsconfig.json app src lib` reports zero cycles
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test --run` passes

## Related

- `lib/container.ts`
- `lib/container/types.ts`
- `lib/controller-helpers.ts`
- `lib/container/controllers.ts`
- `src/adapters/controllers/billing-controller.ts`
- `src/adapters/controllers/bookmark-controller.ts`
- `src/adapters/controllers/practice-controller.ts`
