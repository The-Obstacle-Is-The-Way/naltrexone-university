# DEBT-195: Domain Service Defensive Programming Gaps

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

---

## Description

Two domain service functions have defensive programming gaps that could propagate invalid data to the UI layer under edge conditions.

## Affected Functions

### 1. `computeAccuracy` does not clamp output to `[0, 1]`

**File:** `src/domain/services/statistics.ts`, lines 10-13

```typescript
export function computeAccuracy(total: number, correct: number): number {
  if (total <= 0) return 0;
  return correct / total;
}
```

The function's documented contract is `0..1`, but if `correct > total` (due to a data integrity bug elsewhere), it silently returns a value > 1.0. The `formatPercent` and `formatSessionAccuracy` functions in the UI would display values like "150%".

**Fix:** Add clamping: `return Math.min(1, Math.max(0, correct / total))`

### 2. `isEntitled` default parameter violates stated purity

**File:** `src/domain/services/entitlement.ts`, lines 7-9

```typescript
export function isEntitled(
  subscription: Subscription | null,
  now: Date = new Date(),  // Impure default
): boolean {
```

The function is documented as a "pure function" but the default `now` parameter reads the system clock. All current callers inject `now` explicitly, but future callers could silently get non-deterministic behavior.

**Fix:** Remove the default parameter to make `now` required.

### 3. Entitlement boundary edge case untested

**File:** `src/domain/services/entitlement.ts`, line 13

The `currentPeriodEnd <= now` comparison means a user loses access at the exact millisecond their period ends. This is a defensible business rule but is untested — no test covers `currentPeriodEnd === now`.

**Fix:** Add a test case for the exact-boundary scenario.

## Impact

- Low under normal operation — current callers provide valid inputs
- `computeAccuracy` unclamped output is the highest risk: a data bug in attempt counting could show ">100%" accuracy in the UI

## Verification

- `pnpm test --run` — all tests pass after adding clamp and removing default
- `pnpm typecheck` — all callers provide `now` explicitly

## Related

- DEBT-192 (source-reading tests — behavioral assertions)
