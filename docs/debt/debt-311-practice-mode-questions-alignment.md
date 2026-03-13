# DEBT-311: Practice Page — Mode/Questions Row Vertical Misalignment

**Priority:** P3
**Area:** Frontend / UI
**File:** `app/(app)/app/practice/components/practice-session-starter.tsx` (lines 112–144)

---

## Problem

On the practice session setup page, the **Mode** toggle (SegmentedControl) and **Questions** input sit side-by-side on `sm:` screens. The two controls have mismatched heights:

- **SegmentedControl:** container has `p-1` (4px) + button items have `py-2` (8px top + 8px bottom) + `text-sm` line-height ≈ **44px total**
- **Input:** fixed `h-9` (36px)

The labels ("Mode" / "Questions") top-align correctly via `sm:items-start`, but the 8px height difference between the controls beneath them makes the row look unbalanced — the Questions input appears to float above the bottom edge of the Mode toggle.

### Screenshot

![Misalignment](/docs/debt/assets/debt-311-misalignment.png)

---

## Root Cause

Line 112 of `practice-session-starter.tsx`:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
```

`sm:items-start` aligns both flex children at the top. The labels align, but the SegmentedControl is ~8px taller than the Input, so the controls don't share a common bottom edge or visual center.

### Height breakdown

| Component | Container padding | Item padding | Font line-height | Approx. total |
|-----------|------------------|--------------|------------------|---------------|
| SegmentedControl | `p-1` (4px × 2) | `py-2` (8px × 2) | ~20px | ~44px |
| Input | — | `py-1` (4px × 2) | ~20px | 36px (`h-9`) |

---

## Options Considered

### Option A: Vertically center-align the row (`sm:items-center`)

Change `sm:items-start` → `sm:items-center` on the flex container.

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
```

**Pros:** One-character change. Both labels and controls float to a shared midline.
**Cons:** The labels ("Mode", "Questions") no longer share a top edge — they shift vertically relative to each other because the taller SegmentedControl pushes its label higher. This looks worse when the height gap is small because the labels appear to wobble rather than sit on a clean baseline.

### Option B: Match heights — increase Input to match SegmentedControl

Override the Input height to visually match the SegmentedControl (~44px / `h-11`), and adjust vertical padding to center the text.

```tsx
<Input
  className="w-24 h-11 py-2.5 border-0 bg-foreground/5 ..."
/>
```

**Pros:** Both controls share top and bottom edges. The row looks solid and balanced.
**Cons:** The Input becomes taller than the standard `h-9` used everywhere else. If the SegmentedControl height ever changes, this becomes stale again.

### Option C (Recommended): Bottom-align the controls, keep labels top-aligned

Use a two-row layout within each column: labels in the first row share a top baseline, controls in the second row share a bottom baseline. This is achieved by switching to `sm:items-end` and ensuring both inner containers have the same label → control spacing.

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
  <div className="space-y-2">
    <div className="text-sm font-medium text-foreground">Mode</div>
    <SegmentedControl ... />
  </div>
  <div className="space-y-2">
    <label className="text-sm font-medium text-foreground">Questions</label>
    <Input ... />
  </div>
</div>
```

**Pros:**
- Labels still top-align naturally (both sit above their control with `space-y-2`)
- Controls bottom-align, giving a clean shared baseline at the bottom of the row
- No height hacks, no fragile pixel matching
- Works regardless of SegmentedControl height changes

**Cons:** The labels technically have a few pixels of vertical offset (the taller control pushes its label higher). In practice this is imperceptible because the eye tracks the control bottoms, not the label tops.

---

## Recommendation

**Option C — `sm:items-end`** is the best fix. It's a single class change, semantically correct (controls share a visual baseline), and robust against future height changes in either component.

---

## Additional Findings (Browser Agent Review)

A visual audit of the live page surfaced these related concerns on the same component:

### A11y: Inconsistent label semantics

The "Mode" label is a plain `<div>`, while "Questions" uses a proper `<label for="...">`. Clicking "Questions" focuses the input; clicking "Mode" does nothing. The `<fieldset>` has an `sr-only` `<legend>`, so screen readers work, but the visible label is disconnected.

**Fix:** Either make Mode's visible text a `<label>` with `aria-labelledby` on the fieldset, or unify the pattern across all sections.

### A11y: Duplicate label announcements

Each SegmentedControl has both a visible `<div>` label ("Mode", "Status", "Difficulty") *and* an `sr-only` `<legend>` with identical text. Screen readers announce the label twice.

**Fix:** Drop the `sr-only` legend and use `aria-labelledby` pointing to the visible label, or make the legend visible and remove the div.

### Visual hierarchy: No separation between session config and filters

Mode/Questions, Status, Difficulty, Topic, Substance, and Treatment are all siblings inside `space-y-5`. But Mode+Questions is conceptually the *session configuration*, while Status/Difficulty/Topic/Substance/Treatment are *filters*. A larger gap or subtle divider between the two tiers would establish hierarchy.

### Visual consistency: Questions input borderless vs Mode bordered

The Questions input uses `border-0` with a subtle `bg-foreground/5` fill, while the Mode fieldset has a visible `border-border`. On dark backgrounds the input edges are hard to perceive — it reads as floating text rather than an editable field. Consider adding a matching subtle border or increasing the background contrast.

---

## Implementation

### Primary fix (alignment)

1. In `practice-session-starter.tsx` line 112, change `sm:items-start` → `sm:items-end`
2. Visual verify on mobile (stacked) and desktop (side-by-side)
3. No test changes needed — this is a pure CSS alignment fix

### Optional follow-ups (from additional findings)

4. Unify label semantics across Mode/Status/Difficulty sections
5. Eliminate duplicate screen-reader announcements on SegmentedControl
6. Add visual separator between session config row and filter sections
7. Add subtle border to Questions input to match Mode affordance
