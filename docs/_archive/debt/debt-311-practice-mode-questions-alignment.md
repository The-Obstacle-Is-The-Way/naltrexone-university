# DEBT-311: Practice Page — Mode/Questions Row Vertical Misalignment

**Priority:** P3
**Created:** 2026-03-13
**Status:** Resolved
**Resolved:** 2026-03-13
**Area:** Frontend / UI
**File:** `app/(app)/app/practice/components/practice-session-starter.tsx` (lines 112–144)

---

## Problem

On the practice session setup page, the **Mode** toggle (SegmentedControl) and **Questions** input sit side-by-side on `sm:` screens. The two controls have mismatched heights:

- **SegmentedControl:** button content is `text-sm` line-height (20px) + `py-2` (16px) = **36px**, then the fieldset adds `p-1` (8px) + `border` (2px) = **46px outer height**
- **Input:** fixed `h-9` (36px)

[AUDIT NOTE] The previous **44px vs 36px / 8px mismatch** estimate understated the gap. The source-backed math in this repo is **46px vs 36px**, so the control delta is **10px**. Screenshot measurements can drift with zoom/device scale; the CSS class math does not.

The labels ("Mode" / "Questions") top-align correctly via `sm:items-start`, but the 10px height difference between the controls beneath them makes the row look unbalanced — the Questions input appears to float above the bottom edge of the Mode toggle.

### Screenshot

![Misalignment](/docs/debt/assets/debt-311-misalignment.png)

---

## Root Cause

Line 112 of `practice-session-starter.tsx`:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
```

`sm:items-start` aligns both flex children at the top. The labels align, but the SegmentedControl is 10px taller than the Input, so the controls don't share a common bottom edge or visual center.

[AUDIT NOTE] More precisely: the two `space-y-2` wrappers are top-aligned. With the current one-line `text-sm` labels (20px line-height) and 8px label-to-control gap, the Mode wrapper is **74px** tall (`20 + 8 + 46`) and the Questions wrapper is **64px** tall (`20 + 8 + 36`). `sm:items-start` makes that full **10px** difference show up on the bottom edge.

### Height breakdown

| Component | Math | Outer height |
|-----------|------|--------------|
| SegmentedControl button | `text-sm` line-height 20px + `py-2` 16px | 36px |
| SegmentedControl fieldset | button 36px + `p-1` 8px + `border` 2px | 46px |
| Input | `h-9` fixed height | 36px |

[AUDIT NOTE] The input also carries `py-1`, `border`, and responsive typography (`text-base md:text-sm`), but `h-9` fixes the outer box at 36px. Those inner styles affect text fit/optics, not the control's outer height.

---

## Options Considered

### Option A: Vertically center-align the row (`sm:items-center`)

Change `sm:items-start` → `sm:items-center` on the flex container.

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
```

**Pros:** One-character change. Both labels and controls float to a shared midline.
**Cons:** Neither the label tops nor the control bottoms align. The 10px difference gets split, so each column drifts by roughly 5px from both edges. This is a fair reason to dismiss `items-center`.

### Option B: Match heights — increase Input to match SegmentedControl

Override the Input height to visually match the SegmentedControl (~46px), and adjust vertical padding to center the text.

```tsx
<Input
  className="w-24 h-[46px] border-0 bg-foreground/5 ..."
/>
```

**Pros:** Both controls share top and bottom edges. The row looks solid and balanced.
**Cons:** The Input becomes taller than the standard `h-9` used elsewhere, and the height value is coupled to SegmentedControl internals (`py-2`, `p-1`, border width, and type scale). If either component changes, the override drifts.

### Option C (Recommended): Bottom-align the wrappers so the controls end flush

Switch to `sm:items-end` on the row container so the shorter Questions wrapper drops by 10px and both controls share a bottom edge.

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
- Controls bottom-align, giving a clean shared baseline at the bottom of the row
- No height hacks, no fragile pixel matching
- Mobile is unaffected because the layout only becomes a row at `sm:`
- Works if the control heights change, as long as bottom alignment remains the desired priority

**Cons:** The labels do **not** remain top-aligned. With the current markup they shift by the same 10px as the wrapper-height difference. That tradeoff is probably acceptable here because both labels are short, one-line strings, but the previous version of this doc overstated the benefit.

### Option D: Use a small grid so labels and controls each get their own shared row

If the goal is perfect top alignment for labels *and* perfect bottom alignment for controls, a two-row grid is the structurally correct solution. That requires a small markup refactor so the labels and controls can participate in shared grid rows.

```tsx
<div className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_auto]">
  <div className="text-sm font-medium text-foreground">Mode</div>
  <label htmlFor="session-count-input" className="text-sm font-medium text-foreground">
    Questions
  </label>
  <SegmentedControl ... />
  <Input id="session-count-input" ... />
</div>
```

[AUDIT NOTE] This option was missing from the original write-up. `items-end` is the best **minimal** fix; grid is the cleaner structural fix if the design requirement is "both rows align, no compromises."

**Pros:** Can align labels together and controls together without magic heights.
**Cons:** More markup/CSS rework than a one-token class change, which may be disproportionate for a P3 debt item.

---

## Recommendation

**Option C — `sm:items-end`** is the best fix for the narrow problem this debt item describes: the ragged bottom edge between the two controls.

[AUDIT NOTE] This recommendation should be read as **best minimal fix**, not "perfect alignment in all directions." It solves the reported defect by intentionally trading away shared top alignment for the labels. If future copy changes make those labels wrap or diverge, revisit this row as a grid instead of claiming `items-end` is universally ideal.

---

## Additional Findings (Browser Agent Review)

A visual audit of the live page surfaced these related concerns on the same component:

### A11y: Inconsistent label semantics

The "Mode" label is a plain `<div>`, while "Questions" uses a proper `<label for="...">`. Clicking "Questions" focuses the input; clicking "Mode" does nothing. The `<fieldset>` still has a programmatic label via its `sr-only` `<legend>`, but the visible label is disconnected.

**Fix:** Either make the `<legend>` visible and style it like the current text label, or give the visible text an `id` and point the `<fieldset>` at it with `aria-labelledby`.

[AUDIT NOTE] A `<label>` is not the right primitive for a `<fieldset>`. The original wording mixed two different labeling patterns.

### A11y: Duplicate label announcements

Each SegmentedControl has both a visible `<div>` label ("Mode", "Status", "Difficulty") *and* an `sr-only` `<legend>` with identical text.

**Fix:** Use one labeling source of truth: either keep the legend and make it visible, or keep the visible label and connect it with `aria-labelledby`.

[AUDIT NOTE] The original "screen readers announce the label twice" claim is too strong for what the source proves. The DOM clearly contains duplicate text, but whether assistive tech announces both in a given interaction mode depends on how the user navigates. The safe claim is that the component duplicates label copy and splits the visible label from the programmatic label.

### Visual hierarchy: No separation between session config and filters

Mode/Questions, Status, Difficulty, Topic, Substance, and Treatment are all siblings inside `space-y-5`. But Mode+Questions is conceptually the *session configuration*, while Status/Difficulty/Topic/Substance/Treatment are *filters*. A larger gap or subtle divider between the two tiers would establish hierarchy.

### Visual consistency: Questions input borderless vs Mode bordered

The Questions input uses `border-0` with a subtle `bg-foreground/5` fill, while the Mode fieldset has a visible `border-border`. On dark backgrounds the input edges are hard to perceive — it reads as floating text rather than an editable field. Consider adding a matching subtle border or increasing the background contrast.

[AUDIT NOTE] This is a valid visual-design follow-up, but it is not required to resolve the alignment bug itself.

---

## Implementation

### Primary fix (alignment)

1. In `practice-session-starter.tsx` line 112, change `sm:items-start` → `sm:items-end`
2. Update the unit test in `app/(app)/app/practice/components/practice-session-starter.test.tsx` that currently asserts `sm:items-start`
3. Visual verify on mobile (stacked) and desktop (side-by-side)

[AUDIT NOTE] The original "No test changes needed" line was incorrect. There is already a render-output test that hard-codes the current class token.

### Optional follow-ups (from additional findings)

4. Unify label semantics across Mode/Status/Difficulty sections
5. Use one source of truth for fieldset labeling (`legend` or `aria-labelledby`, not both as separate visible/programmatic labels)
6. Add visual separator between session config row and filter sections
7. Add subtle border to Questions input to match Mode affordance
