# DEBT-221: `computeAccuracy()` Conflates "No Attempts" With "0% Accuracy"

**Priority:** P4
**Status:** Open
**Found:** 2026-02-16
**Component:** Domain — Statistics Service

---

## Summary

`computeAccuracy()` returns `0` when `total <= 0`, which is semantically indistinguishable from a user who attempted questions and got 0% correct. Callers cannot differentiate "no data" from "zero accuracy."

## Affected File

- `src/domain/services/statistics.ts:10-13`

```typescript
export function computeAccuracy(total: number, correct: number): number {
  if (total <= 0) return 0; // No attempts → 0, same as 0% accuracy
  return Math.min(1, Math.max(0, correct / total));
}
```

## Impact

- Dashboard shows "0%" for users who haven't attempted any questions yet
- "0%" could mislead users into thinking they failed rather than haven't started

## Suggested Fix

Return `null` for no-data case:

```typescript
export function computeAccuracy(total: number, correct: number): number | null {
  if (total <= 0) return null;
  return Math.min(1, Math.max(0, correct / total));
}
```

Callers would then display "—" or "N/A" instead of "0%".

## Acceptance Criteria

- [ ] `computeAccuracy()` returns `null` when `total <= 0`
- [ ] All callers handle `null` (display "—" or equivalent)
- [ ] Domain tests updated for new return type
- [ ] Dashboard/history UI shows appropriate empty state

---

## Callers Requiring Update

1. `src/application/use-cases/get-user-stats.ts:96-100` — `accuracyOverall` and `accuracyLast7Days` in dashboard stats
2. `src/application/use-cases/end-practice-session.ts:42` — `accuracy` in session summary totals
3. `src/application/use-cases/get-session-history.ts:63` — `accuracy` per session row in history

## UI Impact

- `app/(app)/app/dashboard/page.tsx:71,85` — `formatPercent(stats.accuracyOverall)` → would render `NaN%` if null
- `app/(app)/app/dashboard/page.tsx:159` — `formatPercent(row.accuracy)` for session history rows
- `app/(app)/app/history/` — session history tab renders accuracy per row

Note: `end-practice-session` and `get-session-history` always operate on completed sessions with `answered >= 1`, so the null path only triggers from `get-user-stats` for new users. However, the return type change propagates to all three callers' output types.
