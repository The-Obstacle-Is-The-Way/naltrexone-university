# DEBT-089: Logger Port Defined in Wrong Layer (Dependency Arrow Outward)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-04

---

## Description

The `Logger` type is defined in the adapters layer (`src/adapters/shared/logger.ts`), but it is imported by application-layer code (`src/application/test-helpers/fakes.ts`). This creates an **inner → outer** dependency, violating Clean Architecture’s dependency rule: **dependencies must point inward only**.

Evidence:

- `src/adapters/shared/logger.ts:1-8` defines `LoggerContext` and `Logger`.
- `src/application/test-helpers/fakes.ts:1` imports `Logger` / `LoggerContext` from `@/src/adapters/shared/logger`.

Even though this is “just types” and “just test helpers”, it still couples the application layer to the adapters layer and makes boundaries leaky.

## Impact

- **Architecture integrity:** Application depends on adapter types, breaking the “inner layers are independent” rule.
- **Refactor friction:** Any adapter-level logging changes can ripple into application tests and fakes.
- **Port confusion:** Logging is a cross-cutting concern that the application layer needs to reference; it should be expressed as a port owned by the application layer.

## Resolution

### Option A: Move Logger to application ports (Recommended)

1. Create `src/application/ports/logger.ts`:
   - `export type LoggerContext = Record<string, unknown>;`
   - `export type Logger = { debug/info/warn/error: (context, msg) => void }`
2. Update imports:
   - Application layer: import from `@/src/application/ports/logger`
   - Adapters/controllers/framework: import from `@/src/application/ports/logger`
3. Transition plan:
   - Either delete `src/adapters/shared/logger.ts`, **or**
   - Keep it temporarily as a re-export to avoid churn:
     - `export type { Logger, LoggerContext } from '@/src/application/ports/logger';`

### Option B: Define Logger only where needed

Avoid a shared logger type and use `console` directly where logging is needed. This is simpler but loses a stable abstraction for tests and DI.

## Verification

- No application-layer file imports from `src/adapters/**`.
- `rg "from '@/src/adapters/shared/logger'" src/application` returns 0.
- `pnpm typecheck && pnpm test --run` pass.

## Related

- Clean Architecture dependency rule (dependencies point inward only).
- `src/adapters/shared/logger.ts`
- `src/application/test-helpers/fakes.ts`

