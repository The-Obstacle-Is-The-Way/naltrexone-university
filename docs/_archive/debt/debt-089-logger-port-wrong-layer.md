# DEBT-089: Logger Port Defined in Wrong Layer (Dependency Arrow Outward)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-04
**Resolved:** 2026-02-04

---

## Description

The `Logger` type was defined in the adapters layer (`src/adapters/shared/logger.ts`), but imported by application-layer code (`src/application/test-helpers/fakes.ts`). This created an **inner → outer** dependency, violating Clean Architecture’s dependency rule: **dependencies must point inward only**.

Evidence (pre-fix):

- `src/adapters/shared/logger.ts:1-8` defines `LoggerContext` and `Logger`.
- `src/application/test-helpers/fakes.ts:1` imports `Logger` / `LoggerContext` from `@/src/adapters/shared/logger`.

Even though this is “just types” and “just test helpers”, it still couples the application layer to the adapters layer and makes boundaries leaky.

## Impact

- **Architecture integrity:** Application depends on adapter types, breaking the “inner layers are independent” rule.
- **Refactor friction:** Any adapter-level logging changes can ripple into application tests and fakes.
- **Port confusion:** Logging is a cross-cutting concern that the application layer needs to reference; it should be expressed as a port owned by the application layer.

## Resolution

Moved the logger contract into the application layer and updated all imports:

1. Added `src/application/ports/logger.ts`.
2. Updated application + adapter imports to use `@/src/application/ports/logger`.
3. Removed `src/adapters/shared/logger.ts` to avoid duplicate definitions.

## Verification

- [x] No application-layer file imports from `src/adapters/**`.
- [x] `rg "from '@/src/adapters/shared/logger'" src/application` returns 0.
- [x] `pnpm typecheck && pnpm test --run` pass.

## Related

- Clean Architecture dependency rule (dependencies point inward only).
- `src/application/ports/logger.ts`
- `src/application/test-helpers/fakes.ts`
