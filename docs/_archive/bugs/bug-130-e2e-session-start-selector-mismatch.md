# BUG-130: E2E Session Start Selectors Don't Match Current UI

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-10
**Resolved:** 2026-02-10

---

## Description

`startSession()` in `tests/e2e/helpers/session.ts` uses two selectors that don't match the current practice start form:

1. `page.getByLabel('Mode').selectOption(mode)` — expects a `<select>` element labeled "Mode"
2. `page.getByLabel('Count').fill(String(count))` — expects an input labeled "Count"

The actual UI uses:
1. A `SegmentedControl` (`<fieldset>` with `<button>` elements and `aria-pressed`), not a `<select>`
2. An input labeled "Questions", not "Count"

## Affected Tests

- `practice.spec.ts` — both "tutor session" (line 14) and "exam mode" (line 36) tests
- `session-continuation.spec.ts` (line 13)

All fail at `helpers/session.ts:13` with: `locator.selectOption: Test timeout of 120000ms exceeded. waiting for getByLabel('Mode')`

## Root Cause

The practice form was refactored from a `<select>` dropdown to a `SegmentedControl` component, and the input label was renamed from "Count" to "Questions". The E2E helpers were never updated.

**Actual component** (`app/(app)/app/practice/components/practice-session-starter.tsx`):
```tsx
<!-- Mode: SegmentedControl with buttons, not a <select> -->
<SegmentedControl
  options={[{ value: 'tutor', label: 'Tutor' }, { value: 'exam', label: 'Exam' }]}
  value={props.sessionMode}
  onChange={props.onSessionModeChange}
  legend="Mode"
/>

<!-- Count: label is "Questions", not "Count" -->
<label htmlFor="session-count-input">Questions</label>
<Input id="session-count-input" type="number" ... />
```

## Resolution (Implemented)

Updated `startSession()` to:

- Click the SegmentedControl button (`Tutor` / `Exam`) instead of calling `selectOption()`.
- Fill the count input by the correct label (`Questions`) instead of `Count`.

Key file:

- `tests/e2e/helpers/session.ts`

## Verification

- `pnpm test:e2e`

## Related

- `app/(app)/app/practice/components/practice-session-starter.tsx` — form source
- `components/ui/segmented-control.tsx` — SegmentedControl component
- `tests/e2e/helpers/session.ts` — session helper
