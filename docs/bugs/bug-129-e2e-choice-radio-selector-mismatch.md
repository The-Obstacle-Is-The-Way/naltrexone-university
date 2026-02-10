# BUG-129: E2E Choice Radio Selector Cannot Find Question Choices

**Status:** Open
**Priority:** P1
**Date:** 2026-02-10

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

## Fix

Update `selectChoiceByLabel()` to match the actual DOM:
```typescript
// Option A: Match by the label badge text
const choiceLabel = page.locator('label').filter({ hasText: new RegExp(`^${label}\\s`) }).first();

// Option B: Add aria-label="Choice A" to the radio input in the component
```

Option A is the lower-friction fix (test-only change). Option B improves accessibility and aligns the component with the test expectation.

## Verification

- [ ] `pnpm test:e2e -- subscribe-and-practice.spec.ts` passes
- [ ] `pnpm test:e2e -- core-app-pages.spec.ts` passes
- [ ] `pnpm test:e2e -- review.spec.ts` passes

## Related

- `components/question/choice-button.tsx` — component source
- `tests/e2e/helpers/question.ts:27-38` — `selectChoiceByLabel()`
- BUG-110 (resolved) — previously fixed aria-label override on ChoiceButton
