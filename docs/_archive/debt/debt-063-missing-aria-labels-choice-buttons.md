# DEBT-063: Missing ARIA Labels on Choice Buttons

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Answer choices previously lacked clear semantic structure for assistive technology.

## Resolution

Refactored choice selection to use a native radio-input pattern:

- `components/question/ChoiceButton.tsx` renders a visually-hidden `<input type="radio">` inside a `<label>`.
- The label includes the choice letter and text, providing an accessible name and selection semantics without relying on ad-hoc ARIA attributes.

## Verification

- [x] Existing component render tests pass.
- [x] Manual spot-check: radio group is keyboard navigable and announced correctly by screen readers.

## Related

- `components/question/ChoiceButton.tsx`
