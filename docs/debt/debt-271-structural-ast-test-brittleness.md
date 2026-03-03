# DEBT-271: Structural/AST-Coupled Test Brittleness

**Status:** Active
**Priority:** P2
**Date:** 2026-03-03
**Owner:** Testing
**Related:** BUG-187, BUG-188, DEBT-270

---

## Description

Two repository test files contain structural tests that inspect Drizzle ORM's internal query AST rather than testing observable behavior. These tests verify that the *right SQL shape* is being constructed by walking internal expression trees — but they are coupled to Drizzle's undocumented internal representation and will silently become non-protective if Drizzle changes its AST structure in a version upgrade.

### Affected files

**1. `src/adapters/repositories/drizzle-attempt-repository.test.ts` (lines 8–38, 549+)**

```typescript
// collectColumnNamesForTable() — walks Drizzle AST to extract column names
function collectColumnNamesForTable(obj: unknown, tableName: string): string[] {
  // ... recursive AST traversal ...
}
```

Used in a test that asserts `countWhere` filter includes `practiceSessions` columns — proving BUG-187's fix is wired in. But it tests *how* the query is built, not *what rows it returns*.

**2. `src/adapters/repositories/drizzle-practice-session-repository.test.ts` (lines 6–31, 748+)**

```typescript
// hasNestedOwnKey() — deep object traversal
function hasNestedOwnKey(obj: unknown, targetKey: string): boolean {
  // ... recursive key search ...
}
```

Used to verify BUG-188's CAS update uses `rawParamsJson` (checking the key exists in the query expression). But it tests *internal query structure*, not *whether legacy rows are updatable*.

### Why these exist

Both were written as unit-level guards before integration tests existed for BUG-187 and BUG-188. They provided immediate confidence that the fix was wired into the query. Now that behavioral integration tests exist (added in the BUG-186/187/188 PR), the structural tests are redundant as proof — the integration tests hit real Postgres and prove actual row inclusion/exclusion.

## Why this is debt

1. **Drizzle upgrade risk:** A Drizzle minor/major version bump could change the internal expression tree shape, causing these tests to pass vacuously (no longer finding the columns they're looking for) or fail spuriously.
2. **False confidence:** A passing structural test doesn't guarantee the SQL actually filters correctly — only that the AST *looks right* to the traversal function.
3. **Maintenance burden:** Anyone modifying these queries must understand both the Drizzle API and the custom AST-walking helpers.

## Current mitigation

Both structural tests now have documentation comments (added 2026-03-03) pointing to the behavioral integration tests as the real proof:

```typescript
// Structural assertion: verifies the WHERE clause includes practiceSessions columns.
// Couples to Drizzle's internal AST — if Drizzle changes expression tree shape, this
// could silently become non-protective. The behavioral proof lives in the integration
// tests (BUG-187 section in repositories.integration.test.ts).
```

## Proposed resolution

**Option A (Recommended): Delete structural tests, rely on integration tests.**

The integration tests in `repositories.integration.test.ts` (BUG-187 and BUG-188 sections) already prove the correct behavior against real Postgres. The structural tests add no additional safety. Delete them and remove the `collectColumnNamesForTable` and `hasNestedOwnKey` helpers.

**Option B: Keep as defense-in-depth, accept brittleness.**

If the team prefers belt-and-suspenders, keep the structural tests but add a CI step or Drizzle upgrade checklist item to manually verify they still work after version bumps.

## Acceptance criteria

- [ ] Structural AST helpers (`collectColumnNamesForTable`, `hasNestedOwnKey`) removed
- [ ] Tests that use them either deleted or rewritten as behavioral assertions
- [ ] Integration tests for BUG-187 and BUG-188 remain as the behavioral proof
- [ ] `pnpm test --run` and `pnpm test:integration` both pass
- [ ] No reduction in actual bug-detection capability

## Effort estimate

~1 hour. Pure deletion + verification.

## Risk

Low. The behavioral integration tests already cover the same bugs. Removing the structural tests only removes redundant (and brittle) coverage.
