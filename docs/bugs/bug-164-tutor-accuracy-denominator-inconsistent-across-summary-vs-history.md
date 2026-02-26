# BUG-164: Tutor Accuracy Denominator Inconsistent Across Session Summary vs History/Dashboard

**Status:** Fixed (2026-02-26)
**Priority:** P3
**Date:** 2026-02-26

---

## Description

Tutor-session accuracy is computed with different denominators depending on surface:

- **Session Summary (right after ending session):** `correct / answered`
- **History + Dashboard session history:** `correct / questionCount`

This means the same completed tutor session can show different percentages across the app.

Example:
- `questionCount = 5`, `answered = 2`, `correct = 2`
- Session Summary: `100%`
- History/Dashboard: `40%`

## Root Cause

Two use cases encode different tutor formulas:

1. `src/application/use-cases/end-practice-session.ts:45–47`

```ts
const accuracyDenominator =
  session.mode === 'exam' ? questionCount : answered;
const accuracy = computeAccuracy(accuracyDenominator, correct);
```

2. `src/application/use-cases/get-session-history.ts:82–93`

```ts
const accuracyDenominator = questionCount;
accuracy: computeAccuracy(accuracyDenominator, correct),
```

The UI correctly reflects these two different values:
- `SessionSummaryView` renders `summary.totals.accuracy` (`app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:24–28`)
- History and Dashboard render `row.accuracy` from `GetSessionHistory` output.

## Existing Tests Encode the Divergence

- `src/application/use-cases/end-practice-session.test.ts:74–95` expects tutor accuracy denominator = answered.
- `src/application/use-cases/get-session-history.test.ts:98–156` expects tutor accuracy denominator = questionCount.

## Impact

- The same tutor session appears to have conflicting performance depending on where the user views it.
- Users can lose trust in analytics correctness.
- Analytics interpretation becomes ambiguous in support and product discussions.

## SSOT Context

`docs/specs/master_spec.md:1640` explicitly defines `GetSessionHistory` accuracy as:
`correct / questionCount`.

`EndPracticeSession` behavior section currently does **not** define an explicit accuracy denominator, so current tutor-summary behavior is implementation-defined, not spec-defined.

## Fix

Align tutor accuracy denominator across both surfaces. Recommended: standardize on `correct / questionCount` everywhere.

### Recommended Implementation

1. Update `EndPracticeSessionUseCase` tutor denominator to `questionCount` (same as exam/history).
2. Update `end-practice-session.test.ts` tutor test expectation (`accuracy` should reflect questionCount denominator).
3. Add regression test ensuring a tutor session reports the same accuracy in:
   - `EndPracticeSessionOutput.totals.accuracy`
   - `GetSessionHistoryOutput.rows[0].accuracy`

## Verification

- [x] Unit test: tutor `end-practice-session` accuracy uses `questionCount`
- [x] Unit test: tutor `get-session-history` accuracy unchanged (`questionCount`)
- [x] Regression test: same tutor session yields equal accuracy in both outputs
- [ ] Manual: complete tutor session with unanswered questions, confirm summary % equals history/dashboard %

## Related

- `src/application/use-cases/end-practice-session.ts:45–47`
- `src/application/use-cases/get-session-history.ts:82–93`
- `src/application/use-cases/end-practice-session.test.ts:74–95`
- `src/application/use-cases/get-session-history.test.ts:98–156`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:24–28`
- `app/(app)/app/history/components/history-sessions-tab.tsx:159`
- `app/(app)/app/dashboard/page.tsx:167`
- `docs/specs/master_spec.md:1640`
- BUG-163
