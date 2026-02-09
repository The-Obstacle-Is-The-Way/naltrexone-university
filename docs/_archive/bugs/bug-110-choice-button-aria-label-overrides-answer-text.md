# BUG-110: ChoiceButton aria-label Overrides Full Answer Text

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

`ChoiceButton` rendered each hidden radio input with `aria-label="Choice A"` (or B/C/D). Because ARIA labels override the implicit label text, screen readers announced only the short badge label and not the full answer content.

**Observed:** Assistive tech heard only `Choice A` instead of the full option text.

**Expected:** Each answer choice should expose the full choice content as the accessible name.

## Root Cause

The input used an explicit `aria-label` despite already being wrapped in a `<label>` containing both the letter badge and full Markdown answer text.

## Impact

- Non-visual users lose critical answer content while navigating choices.
- Practice/exam question interaction becomes partially unusable with screen readers.

## Fix

- Removed `aria-label` from `components/question/choice-button.tsx` so the radio input uses the wrapping `<label>` text as its accessible name.
- Added regression coverage in `components/question/ChoiceButton.test.tsx` asserting the radio input has no overriding `aria-label` and that the wrapping label contains full choice text.

## Verification

- [x] `ChoiceButton` no longer emits `aria-label="Choice X"`
- [x] Choice text remains rendered inside the associated `<label>`
- [x] Unit test updated and passing

## Related

- `components/question/choice-button.tsx`
- `components/question/ChoiceButton.test.tsx`
