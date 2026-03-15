# DEBT-315: Feedback Chip Semantic Color & Casing Polish

**Priority:** P3
**Created:** 2026-03-15
**Status:** Resolved
**Resolved:** 2026-03-15
**Resolved in commit:** `edfff94d`
**Source:** Post-DEBT-314 visual QA
**Scope:** Feedback section chip labels in `components/question/feedback.tsx`

**Historical note:** This archived debt item records the follow-up polish that converted the incorrect-flow `"Correct answer"` transition label into a semantic `"Correct"` chip, dropped the all-caps casing from section chips, and strengthened the neutral chip background in dark mode while intentionally leaving the verdict pill and reference label unchanged.

---

## Context

DEBT-314 converted the plain-text section labels to neutral muted chips with `uppercase tracking-wide`. The chip shape is correct, but the screaming caps and neutral color on the "Correct answer" label look unbalanced next to the verdict pill's clean title case. The neutral chip is also too subtle in dark mode.

---

## Changes

### 1. "Correct answer" → "Correct" with green semantic chip

- Drop "answer" → just `"Correct"`
- Use `bg-success/15 text-success` instead of `bg-muted text-foreground/60`
- Drop `uppercase tracking-wide` → use title case to match the verdict pill's balanced feel
- Keep `rounded-full px-3 py-1 text-xs font-semibold`
- "Explanation" fallback (when no `correctChoice`) remains neutral muted, also title case

### 2. "Why other answers are wrong" → title case, stronger contrast

- Drop `uppercase tracking-wide` → title case: `"Why other answers are wrong"`
- Strengthen dark-mode chip: `bg-muted dark:bg-foreground/10` instead of plain `bg-muted`
- Keep `text-foreground/60` for text color — with the stronger background it will read clearly
- Keep `rounded-full px-3 py-1 text-xs font-semibold`

### 3. Reference label — no change

The "REFERENCE" label stays exactly as-is. It uses a different visual pattern (separator label, not a section chip) and its `uppercase tracking-wide` convention is correct for that tier.

---

## Recommended Token Baseline

### "Correct" section chip (when `correctChoice` exists)

```tsx
<span className="inline-flex rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
  Correct
</span>
```

### "Explanation" section chip (fallback, no `correctChoice`)

```tsx
<span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground/60 dark:bg-foreground/10">
  Explanation
</span>
```

### "Why other answers are wrong" section chip

```tsx
<span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground/60 dark:bg-foreground/10">
  Why other answers are wrong
</span>
```

---

## Files In Scope

### Production

| File | Change |
|------|--------|
| `components/question/feedback.tsx` | Update "Correct answer" label to green semantic "Correct" chip; drop `uppercase tracking-wide` from all section chips; strengthen neutral chip dark-mode fill; text stays title case |

### Tests

| File | Change |
|------|--------|
| `components/question/Feedback.test.tsx` | Update label text assertions ("Correct answer" → "Correct"); update chip token assertions (add `bg-success/15 text-success` for correct label, `dark:bg-foreground/10` for neutral chips); assert `uppercase` is absent from section chips |

---

## Out of Scope

- Verdict pill styling ("Correct" / "Incorrect") — unchanged
- Reference label — unchanged, different visual tier
- Clinical Pearl label — rendered by Markdown.tsx, not feedback.tsx
- Choice button surface tokens — tracked in DEBT-313

---

## Test Plan

### Unit coverage

1. "Correct" label uses `bg-success/15 text-success` (not `bg-muted text-foreground/60`)
2. "Correct" label text is `"Correct"` (not `"Correct answer"`)
3. "Explanation" label retains neutral muted chip with `dark:bg-foreground/10`
4. "Why other answers are wrong" label uses neutral muted chip with `dark:bg-foreground/10`
5. No section chip contains `uppercase` or `tracking-wide`
6. Verdict pill remains unchanged
7. Reference label remains unchanged
8. `showLabel={false}` behavior preserved in correct flow
