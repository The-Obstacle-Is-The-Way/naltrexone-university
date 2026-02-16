# BUG-141: `ports/use-cases.ts` Only Defines 1 of 17 Use Case Type Aliases

**Status:** Open
**Priority:** P4
**Date:** 2026-02-16

---

## Description

The `src/application/ports/use-cases.ts` file defines a generic `UseCase<Input, Output>` interface and a `CheckEntitlementUseCase` type alias, but the remaining 16 use case types are only available via direct imports from their implementation files in `src/application/use-cases/`.

The container types (`lib/container/types.ts:29-46`) import use case types directly from `@/src/application/use-cases`, bypassing the ports layer entirely.

**Observed:** Only `CheckEntitlementUseCase` has a port-layer type alias. Other use cases are referenced by importing directly from their implementation modules.

**Expected:** For Clean Architecture consistency, all use case interfaces should be defined in the ports layer, or the incomplete ports file should be removed/refactored.

## Root Cause

`src/application/ports/use-cases.ts` was created early with only the first use case, and was never updated as new use cases were added.

## Impact Assessment

**No runtime impact.** This is an architectural consistency issue. The code works correctly because TypeScript structural typing ensures compatibility regardless of import path. However, it creates confusion about which import path to use.

## Fix

Option A: Complete the ports file — add type aliases for all 16 missing use cases.

Option B: Remove the ports file — since the container types already import directly from implementations, the ports file for use cases may be unnecessary given TypeScript's structural typing.

## Related

- `src/application/ports/use-cases.ts:1-13`
- `lib/container/types.ts:29-46` — Imports from implementations directly
- Consumers: `app/(app)/app/layout.tsx`, `app/pricing/page.tsx`, `src/adapters/controllers/require-entitled-user-id.ts`
