# DEBT-271: Structural/AST-Coupled Test Brittleness

**Status:** Resolved (2026-03-03)
**Priority:** P2
**Date:** 2026-03-03
**Owner:** Testing
**Related:** BUG-187, BUG-188, DEBT-270

---

## Summary

This debt tracked one remaining AST-coupled unit test in
`src/adapters/repositories/drizzle-practice-session-repository.test.ts`.
The helper `hasNestedOwnKey` and its structural assertion have now been removed.

Behavioral protection remains in integration tests for BUG-188 (and BUG-187),
which assert real Postgres behavior instead of Drizzle internal object shape.

## Resolution implemented

1. Deleted file-local structural helper and structural test from:
   - `src/adapters/repositories/drizzle-practice-session-repository.test.ts`
2. Kept behavioral integration tests in:
   - `tests/integration/repositories.integration.test.ts` (BUG-187 and BUG-188 sections)
3. Verified no helper imports/usages remain for:
   - `collectColumnNamesForTable`
   - `hasNestedOwnKey`

## Post-resolution verification (2026-03-03)

- `rg -n "collectColumnNamesForTable|hasNestedOwnKey" src/adapters/repositories tests/integration/repositories.integration.test.ts`
  - Result: no remaining helper definitions/usages in repository test files.
- `pnpm test --run`
  - Passed (`1785` tests).
- `pnpm test:integration tests/integration/repositories.integration.test.ts`
  - Passed (`57` tests).

## Acceptance criteria

- [x] `hasNestedOwnKey` helper removed from `drizzle-practice-session-repository.test.ts`
- [x] Structural test using `hasNestedOwnKey` removed
- [x] BUG-188 integration tests remain as primary proof
- [x] `pnpm test --run` and `pnpm test:integration` pass
- [x] No import/runtime breakage from helper deletion

## Risk

Low. Remaining coverage is behavior-first and less brittle across Drizzle upgrades.
