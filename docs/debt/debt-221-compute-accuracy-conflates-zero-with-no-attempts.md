# DEBT-221: `computeAccuracy()` Conflates "No Attempts" With "0% Accuracy"

**Priority:** P4
**Status:** Open
**Found:** 2026-02-16
**Component:** Domain — Statistics Service

---

## Summary

`computeAccuracy(total, correct)` returns `0` when `total <= 0`. This is **intentional today** (SPEC-003 + `src/domain/services/statistics.test.ts` assert “0 for no attempts”), but it creates a presentation problem: UI that formats `accuracy * 100` cannot distinguish “no attempts yet” from “0% correct.”

This shows up for:

- Brand-new users (dashboard accuracy cards render `0%`)
- Completed sessions with `answered = 0` (history/session summary can render `0%`)

## Affected Code

- Domain: `src/domain/services/statistics.ts:10-13`
- Use cases producing accuracy values:
  - `src/application/use-cases/get-user-stats.ts:96-100` — calls `computeAccuracy()` directly (lines 96, 97)
  - `src/application/use-cases/get-session-history.ts:55,63` — `computeSessionStats()` at line 55 feeds `computeAccuracy()` at line 63
  - `src/application/use-cases/end-practice-session.ts:41-42` — `computeSessionStats()` at line 41 feeds `computeAccuracy()` at line 42
- Upstream: `src/domain/services/session-stats.ts` — `computeSessionStats(questionStates)` returns `{ answered, correct }`, which is the source of the `(0, 0)` input when a session has no answered questions
- UI percent formatting:
  - `app/(app)/app/dashboard/page.tsx:25-27`
  - `app/(app)/app/history/components/history-sessions-tab.tsx:22-24`
  - `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:24-55`

## Current Behavior

```typescript
// src/domain/services/statistics.ts:10-13
export function computeAccuracy(total: number, correct: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, correct / total));  // clamped to [0, 1]
}
```

Note: SPEC-003 shows the simpler `return correct / total` without clamping. The current implementation adds `Math.min/max` for defensive bounds but the `(0, 0) → 0` behavior is identical.

The typical flow for session-based accuracy:

```
session.questionStates (empty) → computeSessionStats([]) → { answered: 0, correct: 0 }
                                                         → computeAccuracy(0, 0) → 0
```

## Impact

- Accuracy UI can render `0%` when there’s no underlying denominator (new user or a completed session with `answered = 0`).
- This is mathematically defensible but can be misleading/motivationally harmful (“I’m at 0%”) vs an explicit empty state (“—” / “No attempts yet”).

## Suggested Fix (Recommended: Presentation Layer)

Do **not** change `computeAccuracy()` signature/semantics. Instead, render an explicit empty state when the denominator is 0, using counts already present in outputs:

- Dashboard:
  - If `stats.totalAnswered === 0`, show `—` for overall accuracy
  - If `stats.answeredLast7Days === 0`, show `—` for 7-day accuracy
- Session history + session summary:
  - If `row.answered === 0` (history) or `summary.totals.answered === 0` (summary), show `—` instead of `0%`

This keeps domain behavior + tests/spec stable and avoids propagating `number | null` through application/controller types.

## Alternative Fix (Breaking)

Return `null` for no-data case from the domain:

```typescript
export function computeAccuracy(total: number, correct: number): number | null {
  if (total <= 0) return null;
  return Math.min(1, Math.max(0, correct / total));
}
```

This requires updating:

- `src/domain/services/statistics.test.ts` (currently asserts `computeAccuracy(0, 0) === 0`)
- `docs/_archive/specs/spec-003-domain-services.md` (SSOT currently expects `0` for no attempts)
- Downstream output types and UI formatting to handle `null`

## Acceptance Criteria

- [ ] Dashboard accuracy cards render `—` when denominator is 0
- [ ] Session history and session summary render `—` when answered is 0
- [ ] No `NaN%`/`Infinity%` is ever rendered
- [ ] Domain spec/tests remain unchanged (recommended path)
- [ ] UI/unit tests updated to cover empty-state formatting

---

## Related

- `src/domain/services/statistics.test.ts` — asserts `computeAccuracy(0, 0) === 0`
- `src/domain/services/session-stats.ts` + `session-stats.test.ts` — upstream `computeSessionStats()` that produces the `(0, 0)` inputs
- `docs/_archive/specs/spec-003-domain-services.md` — domain SSOT for `computeAccuracy()`
