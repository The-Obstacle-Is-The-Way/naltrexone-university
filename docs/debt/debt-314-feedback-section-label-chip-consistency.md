# DEBT-314: Feedback Section Label Chip Consistency

**Priority:** P3
**Created:** 2026-03-15
**Source:** Visual QA of feedback section post-submit UI
**Status:** Open
**Scope:** Programmatic section labels inside `components/question/feedback.tsx` — the `CorrectAnswerSection` label (`"Correct answer"` / `"Explanation"` when `showLabel` is true) and the two `"Why other answers are wrong:"` headings. The verdict pill, reference separator label, and Markdown-rendered clinical pearl callout are reference points, not change targets.

---

## Context

The feedback section's verdict indicator ("Correct" / "Incorrect") already uses a compact pill:

```tsx
<span
  className={cn(
    'inline-flex self-start rounded-full px-3 py-1 text-sm font-semibold',
    isCorrect && 'bg-success text-success-foreground dark:bg-success/60',
    !isCorrect &&
      'bg-destructive text-destructive-foreground dark:bg-destructive/60',
  )}
>
  {isCorrect ? 'Correct' : 'Incorrect'}
</span>
```

But the sub-section labels below it use plain text:

```tsx
<div className="text-sm font-medium text-foreground">
  Correct answer
</div>

<div className="text-sm font-medium text-foreground">
  Why other answers are wrong:
</div>
```

This creates a visual hierarchy inconsistency: the verdict gets a clear chip treatment, but the section dividers below it look like afterthoughts.

---

## Current Implementation

All three labels are hardcoded strings in `feedback.tsx`, not markdown/MDX content:

| Label | Location | Current styling |
|-------|----------|----------------|
| `"Correct answer"` / `"Explanation"` | Lines 71-72 inside `CorrectAnswerSection` | `<div className="text-sm font-medium text-foreground">...` |
| `"Why other answers are wrong:"` | Lines 164-165 (correct flow) | `<div className="text-sm font-medium text-foreground">...` |
| `"Why other answers are wrong:"` | Lines 224-225 (incorrect flow) | `<div className="text-sm font-medium text-foreground">...` |

Render-path nuance:

- `CorrectAnswerSection` only shows its label when `showLabel` is true.
- The correct flow explicitly passes `showLabel={false}` at line 159, so **neither `"Correct answer"` nor `"Explanation"` renders in the correct-answer flow today**.
- The incorrect flow omits `showLabel`, so `"Correct answer"` appears when a `correctChoice` exists, and `"Explanation"` appears only in the explanation-only fallback branch.
- `"Why other answers are wrong:"` is rendered twice in the file because the correct and incorrect flows each have their own conditional section.

Related but out-of-scope labels:

- `Reference` is a separate programmatic label at lines 256-257 with `text-xs font-semibold uppercase tracking-wide text-muted-foreground`.
- `Clinical Pearl` is **not** rendered in `feedback.tsx`; it comes from `Markdown.tsx` as a styled callout label (`text-xs font-medium uppercase tracking-wide text-foreground/60` inside a `border-l-2` container).
- No sibling component under `components/question/` renders these exact programmatic labels, so this remains a `Feedback`-local change plus its test file.

Additional issue: `"Why other answers are wrong:"` includes a trailing colon that should be dropped if it becomes a chip.

---

## Recommended Direction

Convert these section labels to neutral muted chips that echo the verdict pill's shape without competing with it:

```tsx
<span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/60">
  Correct answer
</span>
```

### Why this recipe

- `rounded-full px-3 py-1` matches the verdict pill's shape
- `bg-muted` gives the chip a neutral contained surface that is visually subordinate to the semantic verdict pill
- `text-foreground/60` preserves subordinate hierarchy but still clears comfortable contrast on `bg-muted` in both themes; `text-muted-foreground` on `bg-muted` is only ~`4.34:1` in light mode and is too weak here
- `text-xs font-semibold uppercase tracking-wide` matches the existing `Reference` micro-label scale. `Clinical Pearl` is similar in spirit but intentionally not an exact match: it is rendered by `Markdown.tsx`, uses `font-medium text-foreground/60`, and lives inside its own bordered callout
- Dropping the colon from "Why other answers are wrong" cleans up the label for chip presentation
- Switching the label element from `<div>` to `<span>` is layout-safe here because the vertical rhythm is carried by the surrounding `mt-4` wrappers and the following card's existing `mt-2` margin, not by the label element being block-level

### Text changes

| Current | Target |
|---------|--------|
| "Correct answer" | "Correct answer" (unchanged) |
| "Explanation" | "Explanation" (unchanged) |
| "Why other answers are wrong:" | "Why other answers are wrong" (drop colon) |

Behavioral scope:

- Do **not** change the `showLabel` behavior in this debt item.
- Correct flow should remain label-free above the green success card unless a separate debt item explicitly changes that choice.

---

## Files In Scope

### Production

| File | Change |
|------|--------|
| `components/question/feedback.tsx` | Convert the current label `<div>` elements to `<span>` chip elements with the neutral muted pill recipe; drop the colon from "Why other answers are wrong"; preserve existing `showLabel` behavior and leave `Reference` / `Clinical Pearl` unchanged |

### Tests

| File | Change |
|------|--------|
| `components/question/Feedback.test.tsx` | Update the existing label assertions and selectors: many tests currently search `querySelectorAll('div')`, use exact `"Why other answers are wrong:"` text, and assume `"Correct answer"` / `"Explanation"` appear only in the incorrect-flow branches. Add chip token assertions on top of those existing contracts |

---

## Out of Scope

1. **Verdict pill styling** (`"Correct"` / `"Incorrect"`) — already correct, no change needed
2. **`Reference` label** — already uses its own separator-label styling and serves a different visual role from the section-header chips
3. **`Clinical Pearl` label** — rendered by `components/markdown/Markdown.tsx`, not `feedback.tsx`; different implementation path and different visual role
4. **Choice button surface changes** — tracked separately

---

## Test Plan

### Unit coverage

1. "Correct answer" label renders with `rounded-full` and `bg-muted`
2. `"Explanation"` label renders with the chip recipe in the incorrect-flow fallback branch
3. `"Why other answers are wrong"` label renders with `rounded-full` and `bg-muted` in both flows when wrong-answer cards are present
4. `"Why other answers are wrong"` text does not contain a colon
5. Chip labels use `text-xs` and `uppercase` instead of `text-sm font-medium`
6. Correct flow still suppresses the `CorrectAnswerSection` label because `showLabel={false}` remains unchanged
7. `Reference` and `Clinical Pearl` styling remain unchanged

### Manual visual QA

1. Correct answer feedback with wrong-answer cards, dark mode — only the `"Why other answers are wrong"` chip appears; no new `"Correct answer"` chip is introduced
2. Incorrect answer feedback with a correct choice, dark mode — `"Correct answer"` and `"Why other answers are wrong"` chips both render and remain subordinate to the verdict pill
3. Incorrect answer feedback without a correct choice, light mode — `"Explanation"` chip renders above the success card
4. Incorrect answer feedback with no other wrong-answer cards — `"Why other answers are wrong"` chip stays absent
5. Reference section and clinical pearl callout remain visually unchanged

### Visual acceptance criteria

1. Section labels read as neutral chips, not floating plain text
2. Chips are clearly subordinate to the colored verdict pill (smaller, muted, not colored)
3. The colon is gone from "Why other answers are wrong"
4. No layout regression is introduced by switching the labels from `<div>` to `<span>`
5. Correct flow remains label-free above the success card unless explicitly changed by a separate debt item
6. The overall feedback section feels more structured and intentional
