# BUG-163: Dashboard Session Fraction Denominator Mismatches Accuracy Calculation

**Status:** Open
**Priority:** P3
**Date:** 2026-02-26

---

## Description

Dashboard "Recent sessions" cards render a mixed denominator:

- Exam: `correct / questionCount`
- Tutor: `correct / answered`

At the same time, the displayed `accuracy` percentage is computed as `correct / questionCount` for both modes. For incomplete tutor sessions this can render contradictory metrics (for example `2/2 correct (40%)`).

## Root Cause

`app/(app)/app/dashboard/page.tsx:159–161`:

```tsx
{row.correct}/
{row.mode === 'exam' ? row.questionCount : row.answered} correct
```

But `GetSessionHistoryUseCase` computes accuracy with `questionCount` for all session modes:

`src/application/use-cases/get-session-history.ts:82–93`

```ts
const accuracyDenominator = questionCount;
accuracy: computeAccuracy(accuracyDenominator, correct),
```

This diverges from SSOT (`docs/specs/master_spec.md:1640`: `accuracy = correct / questionCount`).

## Impact

- Contradictory tutor-session metrics on dashboard cards.
- Inconsistent semantics between Dashboard and History → Sessions (History uses `correct / questionCount`).
- Reduced trust in performance data.

## Fix

Use `questionCount` as denominator for all modes in DashboardView.

### Code Change

`app/(app)/app/dashboard/page.tsx`:

```tsx
{row.correct}/{row.questionCount} correct
```

### Test Change

`app/(app)/app/dashboard/page.test.tsx`:

- Add/extend a tutor-session fixture with `questionCount > answered` (for example `questionCount: 5`, `answered: 2`, `correct: 2`, `accuracy: 0.4`).
- Assert dashboard HTML contains `2/5 correct`.
- Assert it does **not** contain `2/2 correct`.

## Verification

- [ ] Unit test: Tutor row with unanswered questions renders `correct/questionCount`
- [ ] Unit test: Existing exam row rendering remains unchanged
- [ ] Manual: Dashboard and History Sessions show consistent fraction semantics

## Related

- `app/(app)/app/dashboard/page.tsx:159–161` — inconsistent tutor denominator
- `src/application/use-cases/get-session-history.ts:82–93` — accuracy denominator source of truth
- `app/(app)/app/history/components/history-sessions-tab.tsx:157–159` — correct fraction denominator pattern
- `docs/specs/master_spec.md:1640` — SSOT accuracy definition
- BUG-160 — same dashboard session-card area
