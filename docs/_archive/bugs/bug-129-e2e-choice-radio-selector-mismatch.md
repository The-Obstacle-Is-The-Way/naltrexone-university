# BUG-129: E2E Choice Radio Selector Cannot Find Question Choices

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-10
**Resolved:** 2026-02-10

---

## Description

`selectChoiceByLabel()` in `tests/e2e/helpers/question.ts` uses `page.getByRole('radio', { name: 'Choice A' })` to find answer choices. The actual `<input type="radio">` in `components/question/choice-button.tsx` has `className="sr-only"` and gets its accessible name from the wrapping `<label>`, which contains the full choice text (e.g., "A Blocks mu-opioid receptors..."), not just "Choice A".

Playwright's `getByRole('radio', { name: 'Choice A' })` expects a radio whose accessible name is exactly "Choice A", which never matches.

## Affected Tests

- `core-app-pages.spec.ts` (line 30: `submitQuestionForOutcome`)
- `review.spec.ts` (line 26: `submitQuestionForOutcome`)
- `subscribe-and-practice.spec.ts` (line 21: `selectChoiceByLabel`)

All fail at `helpers/question.ts:33` with: `getByRole('radio', { name: 'Choice A' }).first() — element(s) not found`

## Root Cause

The choice component renders:
```tsx
<label>
  <input type="radio" className="sr-only" />   <!-- no aria-label -->
  <div>A</div>                                   <!-- badge -->
  <MarkdownContent>{choiceText}</MarkdownContent> <!-- full text -->
</label>
```

The radio's accessible name is the entire label content including the choice text, not "Choice A".

## Resolution (Implemented)

Updated `selectChoiceByLabel()` to match the ChoiceButton DOM by locating the `<label>` that contains the round badge indicator for the requested letter (`A|B|C|D`) and clicking that label, then asserting the nested radio is checked.

Key file:

- `tests/e2e/helpers/question.ts`

## Verification

- `pnpm test:e2e`

## Related

- `components/question/choice-button.tsx` — component source
- `tests/e2e/helpers/question.ts:27-38` — `selectChoiceByLabel()`
- BUG-110 (resolved) — previously fixed aria-label override on ChoiceButton
