# DEBT-314: Feedback Section Label Chip Consistency

**Priority:** P3
**Created:** 2026-03-15
**Source:** Visual QA of feedback section post-submit UI
**Status:** Open
**Scope:** Section labels inside `components/question/feedback.tsx` — "Correct answer", "Explanation", and "Why other answers are wrong" text labels

---

## Context

The feedback section's verdict indicator ("Correct" / "Incorrect") uses a pill/chip style:

```tsx
<span className="inline-flex self-start rounded-full px-3 py-1 text-sm font-semibold bg-success ...">
  Correct
</span>
```

But the sub-section labels below it use plain unstyled text:

```tsx
<div className="text-sm font-medium text-foreground">
  Correct answer
</div>

<div className="text-sm font-medium text-foreground">
  Why other answers are wrong:
</div>
```

This creates a visual hierarchy inconsistency: the verdict gets a clear chip treatment, but the section dividers below it look like afterthoughts — plain text floating between card groups.

---

## Current Implementation

All three labels are hardcoded strings in `feedback.tsx`, NOT from markdown/MDX:

| Label | Location | Current styling |
|-------|----------|----------------|
| "Correct answer" / "Explanation" | Line 72 | `text-sm font-medium text-foreground` |
| "Why other answers are wrong:" | Line 164 (correct flow) | `text-sm font-medium text-foreground` |
| "Why other answers are wrong:" | Line 224 (incorrect flow) | `text-sm font-medium text-foreground` |

Additional issue: "Why other answers are wrong:" includes a trailing colon that should be dropped if it becomes a chip — chips are labels, not sentence fragments.

---

## Recommended Direction

Convert these section labels to neutral muted chips that echo the verdict pill's shape without competing with it:

```tsx
<span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
  Correct answer
</span>
```

### Why this recipe

- `rounded-full px-3 py-1` matches the verdict pill's shape
- `bg-muted text-muted-foreground` keeps it visually subordinate to the colored verdict pill
- `text-xs font-semibold uppercase tracking-wide` matches the existing "REFERENCE" and "CLINICAL PEARL" label convention already used elsewhere in the feedback section
- Dropping the colon from "Why other answers are wrong" cleans up the label for chip presentation

### Text changes

| Current | Target |
|---------|--------|
| "Correct answer" | "Correct answer" (unchanged) |
| "Explanation" | "Explanation" (unchanged) |
| "Why other answers are wrong:" | "Why other answers are wrong" (drop colon) |

---

## Files In Scope

### Production

| File | Change |
|------|--------|
| `components/question/feedback.tsx` | Convert the three section label `<div>` elements to `<span>` chip elements with the neutral muted pill recipe; drop the colon from "Why other answers are wrong" |

### Tests

| File | Change |
|------|--------|
| `components/question/Feedback.test.tsx` | Assert the section labels render with the chip class pattern; assert "Why other answers are wrong" no longer has a trailing colon |

---

## Out of Scope

1. **Verdict pill styling** ("Correct" / "Incorrect") — already correct, no change needed
2. **"REFERENCE" label** — already uses `text-xs font-semibold uppercase tracking-wide text-muted-foreground` but without a chip background. Could optionally be aligned in a follow-up, but it serves a different visual role (separator label, not section header).
3. **"CLINICAL PEARL" label** — same as above, different visual role
4. **Choice button surface changes** — tracked in DEBT-313

---

## Test Plan

### Unit coverage

1. "Correct answer" label renders with `rounded-full` and `bg-muted`
2. "Why other answers are wrong" label renders with `rounded-full` and `bg-muted`
3. "Why other answers are wrong" text does not contain a colon
4. Labels use `text-xs` and `uppercase` (not `text-sm`)

### Manual visual QA

1. Correct answer feedback, dark mode — chip visible and subordinate to verdict pill
2. Incorrect answer feedback, dark mode — both "Correct answer" and "Why other answers are wrong" chips visible
3. Correct answer feedback, light mode — chip visible
4. Incorrect answer feedback, light mode — both chips visible

### Visual acceptance criteria

1. Section labels read as neutral chips, not floating plain text
2. Chips are clearly subordinate to the colored verdict pill (smaller, muted, not colored)
3. The colon is gone from "Why other answers are wrong"
4. The overall feedback section feels more structured and intentional
