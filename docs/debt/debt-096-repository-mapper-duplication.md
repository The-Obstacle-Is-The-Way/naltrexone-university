# DEBT-096: Repository Row→Domain Mapping Duplicated (DRY Violation)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-04

---

## Description

Multiple Drizzle repositories repeat row→domain mapping logic inline in several methods instead of centralizing it in a private mapper (e.g., `toDomain(...)`). Other repositories in this codebase already use a dedicated `toDomain` helper, so the duplication is inconsistent and increases maintenance risk.

Evidence:

- `src/adapters/repositories/drizzle-attempt-repository.ts` repeats mapping blocks:
  - `insert` mapping (`src/adapters/repositories/drizzle-attempt-repository.ts:57-66`)
  - `findByUserId` mapping (`src/adapters/repositories/drizzle-attempt-repository.ts:88-101`)
  - `findBySessionId` mapping (`src/adapters/repositories/drizzle-attempt-repository.ts:113-126`)
- `src/adapters/repositories/drizzle-subscription-repository.ts` duplicates mapping:
  - `findByUserId` (`src/adapters/repositories/drizzle-subscription-repository.ts:23-48`)
  - `findByStripeSubscriptionId` (`src/adapters/repositories/drizzle-subscription-repository.ts:50-75`)
- `src/adapters/repositories/drizzle-practice-session-repository.ts` duplicates mapping:
  - `findByIdAndUserId` (`src/adapters/repositories/drizzle-practice-session-repository.ts:34-56`)
  - `create` (`src/adapters/repositories/drizzle-practice-session-repository.ts:58-91`)

Contrast (already good patterns):

- `src/adapters/repositories/drizzle-user-repository.ts` has `private toDomain(...)`.
- `src/adapters/repositories/drizzle-question-repository.ts` has `private toDomain(...)`.

## Impact

- **Bug risk:** subtle mapping differences can creep in over time.
- **Refactor friction:** schema changes require editing multiple mapping sites.
- **Inconsistent invariants:** required fields / null handling may diverge across methods.

## Resolution

1. Introduce a private mapper per repository, e.g. `private toDomain(row): Attempt`.
2. Reuse it across methods; keep small “require” helpers (like `requireSelectedChoiceId`) where useful.
3. Add/adjust unit tests if mapping invariants change (should be mostly refactor-only).

## Verification

- Mapping logic is defined once per repository.
- Existing repository tests pass unchanged.
- `pnpm lint && pnpm typecheck` are clean.

## Related

- `src/adapters/repositories/drizzle-attempt-repository.ts`
- `src/adapters/repositories/drizzle-subscription-repository.ts`
- `src/adapters/repositories/drizzle-practice-session-repository.ts`
- `src/adapters/repositories/drizzle-user-repository.ts`
- `src/adapters/repositories/drizzle-question-repository.ts`
