# DEBT-315: Feedback Chip Semantic Color & Casing Polish

**Priority:** P3
**Created:** 2026-03-15
**Source:** Post-DEBT-314 visual QA
**Status:** Open
**Scope:** Feedback section chip labels in `components/question/feedback.tsx`

---

## Context

DEBT-314 converted the plain-text section labels to neutral muted chips. The shape and structure are correct, but post-implementation visual QA surfaced three remaining polish items.

---

## Issues

### 1. "Correct answer" should be "Correct" with a green semantic chip

The section label currently says "CORRECT ANSWER" in a neutral muted chip (`bg-muted text-foreground/60`). It should:
- Drop "answer" → just "Correct"
- Use a green semantic chip: `bg-success/15 text-success` instead of `bg-muted text-foreground/60`
- This creates a clear visual parallel with the red "Incorrect" verdict pill at the top

The "Explanation" fallback label (when no `correctChoice` exists) should remain neutral muted.

### 2. Casing inconsistency between verdict pill and section labels

The verdict pill ("Correct" / "Incorrect") uses title case at `text-sm`. The DEBT-314 section labels use `uppercase text-xs tracking-wide`. These are intentionally different visual tiers, but the coexistence of "Incorrect" (title case) and "CORRECT ANSWER" (all caps) on the same card looks inconsistent.

Options to evaluate:
- Keep the tier distinction (different sizes justify different casing)
- Remove `uppercase` from the section chips to match the verdict pill's casing
- Add `uppercase` to the verdict pill to match the section chips

### 3. "Why other answers are wrong" chip slightly too light in dark mode

The neutral muted chip (`bg-muted text-foreground/60`) is very subtle in dark mode. Consider `bg-foreground/[0.08] text-foreground/60` or `bg-muted dark:bg-foreground/10` for more presence.

---

## Files In Scope

| File | Change |
|------|--------|
| `components/question/feedback.tsx` | Update chip text/color for "Correct" label, evaluate casing, possibly strengthen neutral chip |
| `components/question/Feedback.test.tsx` | Update assertions for changed label text and chip tokens |

---

## Out of Scope

- Verdict pill styling ("Correct" / "Incorrect") — evaluate casing alignment but do not change semantic colors
- Choice button surface tokens — tracked in DEBT-313
- Reference and Clinical Pearl labels — separate visual tier
