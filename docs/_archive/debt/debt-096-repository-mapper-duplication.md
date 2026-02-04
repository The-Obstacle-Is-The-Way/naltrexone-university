# DEBT-096: Repository Row→Domain Mapping Duplicated (DRY Violation)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-04
**Archived:** 2026-02-04

---

## Description

Several Drizzle repositories duplicated row→domain mapping blocks across methods instead of centralizing the mapping in a single helper (DRY violation).

## Resolution

Centralized mapping via `toDomain(...)` helpers and reused them across methods in:

- `src/adapters/repositories/drizzle-attempt-repository.ts`
- `src/adapters/repositories/drizzle-practice-session-repository.ts`
- `src/adapters/repositories/drizzle-subscription-repository.ts`

## Verification

- Repository behavior unchanged (refactor-only).
- Existing unit/integration tests remain green.
- Verified green gates:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test --run`

