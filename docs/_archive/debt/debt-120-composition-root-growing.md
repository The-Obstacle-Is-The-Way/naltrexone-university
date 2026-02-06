# DEBT-120: Composition Root Growing Toward God File (407 Lines)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

`lib/container.ts` is 407 lines and exposes a large factory surface (repository/gateway/use-case/controller creation methods) that wires all repositories, gateways, and use cases. While a composition root is an accepted pattern in Clean Architecture, the file is approaching the size where it becomes difficult to navigate and maintain.

Currently manageable — this is a **warning** not an emergency.

## Impact

- Any new use case, repository, or gateway requires editing this file
- Navigation is becoming cumbersome with a large factory surface in one file
- Merge conflicts increasingly likely as features are added
- At current growth rate (~5-10 new factories per feature), will exceed 600 lines within a few features

## Resolution (Implemented)

Implemented an early bounded split while preserving the public container API:

- Added container modules:
  - `lib/container/repositories.ts`
  - `lib/container/gateways.ts`
  - `lib/container/use-cases.ts`
  - `lib/container/controllers.ts`
  - `lib/container/types.ts`
- Kept `lib/container.ts` as a thin composition facade that wires and exports
  all factories.
- Added module-surface test:
  - `lib/container-modules.test.ts`

## Verification

- [x] Container logic is split into focused modules
- [x] `lib/container.ts` remains the single composition entrypoint
- [x] Existing factory surface is preserved
- [x] Existing test suite passes

## Related

- `lib/container.ts`
- `lib/container/repositories.ts`
- `lib/container/gateways.ts`
- `lib/container/use-cases.ts`
- `lib/container/controllers.ts`
- `lib/container/types.ts`
- `lib/container-modules.test.ts`
