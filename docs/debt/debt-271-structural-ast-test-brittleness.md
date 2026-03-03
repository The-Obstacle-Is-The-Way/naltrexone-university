# DEBT-271: Structural/AST-Coupled Test Brittleness

**Status:** Active
**Priority:** P2
**Date:** 2026-03-03
**Owner:** Testing
**Related:** BUG-187, BUG-188, DEBT-270

---

## Description

One remaining repository unit test inspects Drizzle query-object structure instead of asserting observable behavior. It relies on recursive key-search over a Drizzle-generated expression object, which is brittle against internal representation changes.

This debt was partially reduced already:
- `collectColumnNamesForTable` is no longer present in `drizzle-attempt-repository.test.ts`.
- The remaining AST-coupled helper is `hasNestedOwnKey` in `drizzle-practice-session-repository.test.ts`.

## Verified current state (2026-03-03)

### 1) `collectColumnNamesForTable` in attempt repo tests

- File checked: `src/adapters/repositories/drizzle-attempt-repository.test.ts` (789 lines)
- Result: helper does **not** exist.
- Repo-wide usage search result: no occurrences outside this doc.

### 2) `hasNestedOwnKey` in practice-session repo tests

- File checked: `src/adapters/repositories/drizzle-practice-session-repository.test.ts` (1123 lines)
- Helper definition: lines **6-31**
- Helper usage: line **772**
- Test using helper (1 test total):
  - line **754**: `it('uses raw legacy params_json for CAS comparison when questionStates is missing', ...)`

### 3) Behavioral integration coverage for BUG-187 and BUG-188

File checked: `tests/integration/repositories.integration.test.ts` (2700 lines)

- BUG-187 section exists: lines **2396-2564**
  - line 2397: excludes active-exam attempts from `countByUserId` and `countCorrectByUserId`
  - line 2471: excludes active-exam attempts from `listRecentByUserId`
  - line 2529: includes tutor-session attempts in counts
- BUG-188 section exists: lines **2569-2700**
  - line 2570: CAS succeeds for legacy `params_json` without `questionStates` (recordQuestionAnswer)
  - line 2621: CAS succeeds for current-format `params_json`
  - line 2658: CAS succeeds for legacy `params_json` in `setQuestionMarkedForReview`

These integration tests verify the behavioral outcomes that the structural helper test is trying to guard.

### 4) Import and dependency safety for deletion

- `hasNestedOwnKey` is file-local and not exported/imported.
- `collectColumnNamesForTable` has no in-repo usage.
- Removing `hasNestedOwnKey` and its single structural test will not break imports.

## Why this is debt

1. **Drizzle upgrade risk:** Structural key-search against internal expression trees can fail or pass for the wrong reasons after Drizzle internal changes.
2. **False confidence:** Query-shape assertions do not guarantee legacy rows are actually updatable in Postgres.
3. **Redundant proof:** BUG-188 integration tests already validate real CAS behavior for legacy and current JSON shapes.

## Proposed resolution

**Option A (Recommended): remove the remaining structural helper test and rely on behavioral tests.**

1. In `drizzle-practice-session-repository.test.ts`, delete:
   - `hasNestedOwnKey` helper (lines 6-31)
   - test `uses raw legacy params_json for CAS comparison when questionStates is missing` (starts line 754)
2. Keep BUG-188 integration tests as the behavioral contract.

**Option B: keep as defense-in-depth and accept brittleness.**

If retained, document Drizzle-upgrade validation steps and treat this as intentionally brittle.

## Acceptance criteria

- [ ] `hasNestedOwnKey` helper removed from `drizzle-practice-session-repository.test.ts`
- [ ] Structural test using `hasNestedOwnKey` removed or rewritten as behavior-focused assertion
- [ ] BUG-188 integration tests remain unchanged as primary proof
- [ ] `pnpm test --run` and `pnpm test:integration` pass
- [ ] No import/runtime breakage from helper deletion

## Effort estimate

~30-60 minutes. Small deletion plus verification.

## Risk

Low. Behavioral integration coverage already exists for the affected CAS logic.
