# BUG-057: Choice Label Badges Render Clipped

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-05
**Resolved:** 2026-02-05

---

## Description

In the Practice and Question detail flows, the circular choice label badges (A/B/C/D) could appear visually “cut off” (not perfectly circular), especially near the bottom edge.

This is a UI-only defect but undermines perceived polish and can distract users during question answering.

---

## Steps to Reproduce

1. Navigate to `/app/practice` or `/app/questions/[slug]`.
2. Observe the choice label badges next to each answer option.
3. On some browsers/layouts, the badge border appears clipped instead of a clean circle.

---

## Root Cause

`components/question/ChoiceButton.tsx` rendered each choice as an inline `<label>` (default display), which is prone to inconsistent box-model rendering when combined with block children and focus-ring styles.

Additionally, the badge itself had a transparent background, allowing underlying borders/backgrounds to show through and accentuate clipping artifacts.

---

## Fix

- Make the outer `<label>` a block-level element (`block w-full`) for predictable layout.
- Give the badge an explicit background (`bg-background`) and match correctness-state backgrounds (emerald/red) to avoid underlay bleed-through.
- Add `leading-none` to keep the label glyph visually centered within the badge.

---

## Verification

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test --run`
- [x] `pnpm test:browser`

---

## Related

- `components/question/ChoiceButton.tsx`
