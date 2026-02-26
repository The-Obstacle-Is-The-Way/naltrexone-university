# BUG-155: Feedback Card Visual Overhaul — Verdict Badge, Correct Answer Display, Wrong-Answer Cards, Accessibility

**Status:** Fixed (2026-02-26)
**Priority:** P2
**Date:** 2026-02-25
**Source:** [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) (Problems 2, 3, 8, 9, 10, 12, 18, 22)

---

## Description

Seven visual/UX issues in the `Feedback` component (`components/question/feedback.tsx`) that collectively degrade the post-answer learning experience. These all live in one file and should be fixed together as a coherent feedback card redesign.

### Issue 1: Entire feedback card tinted green/red — too heavy (Problem 2+8)

The ENTIRE explanation card gets `bg-success/10` or `bg-destructive/10` background tint plus a colored border. This overwhelms the reading experience — the green/red should communicate the verdict, not color the entire explanation.

**Current (line 46-49):**
```tsx
<Card className={cn(
  isCorrect && 'border-success bg-success/10',
  !isCorrect && 'border-destructive bg-destructive/10',
)}>
```

**The verdict is also rendered as plain body text (line 51-53):**
```tsx
<div className="text-sm font-semibold text-foreground">
  {isCorrect ? 'Correct' : 'Incorrect'}
</div>
```

It doesn't stand out as a verdict. It should be a badge/chip.

**Fix:** Remove `bg-success/10` / `bg-destructive/10` from the Card. Style the verdict as a compact badge:

```tsx
// Card becomes neutral
<Card>

// Verdict becomes a badge
<span className={cn(
  'inline-flex rounded-full px-3 py-1 text-sm font-semibold',
  isCorrect && 'bg-success/15 text-success',
  !isCorrect && 'bg-destructive/15 text-destructive',
)}>
  {isCorrect ? 'Correct' : 'Incorrect'}
</span>
```

### Issue 2: "Explanation" heading is redundant — show correct answer (Problem 3)

**Current (line 56):**
```tsx
<div className="text-sm font-medium text-foreground">Explanation</div>
```

The word "Explanation" adds no information. Replace it with the correct answer's display label + text so the reader immediately sees what the right answer was.

**Fix:** Extract the correct choice from `choiceExplanations` and render it as a normal block section (not inline):

```tsx
const correctChoice = choiceExplanations.find((c) => c.isCorrect);
// ...
{correctChoice ? (
  <div className="space-y-1">
    <div className="text-sm font-medium text-foreground">Correct answer</div>
    <div className="flex items-start gap-1 text-sm text-foreground">
      <span className="shrink-0 font-medium">{correctChoice.displayLabel})</span>
      <Markdown content={correctChoice.textMd} />
    </div>
  </div>
) : (
  <div className="text-sm font-medium text-foreground">Explanation</div>
)}
```

This avoids trying to render `Markdown` inline. `Markdown` currently renders a wrapper `<div>`, so inline placement is structurally incorrect.

Falls back to "Explanation" when `choiceExplanations` is empty (e.g., when used in contexts without per-choice data).

### Issue 3: Reference label not differentiated from citation text (Problem 9)

**Current (line 93-94):**
```tsx
<div className="text-xs font-medium text-muted-foreground">Reference</div>
<Markdown content={referenceMd} className="mt-1 text-xs" />
```

Both use similar muted styling. No visual distinction between the section label and the content.

**Fix:** Add `uppercase tracking-wide` to the Reference label:

```diff
-<div className="text-xs font-medium text-muted-foreground">Reference</div>
+<div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reference</div>
```

### Issue 4: Verdict and explanation too close together (Problem 10)

**Current (line 55):**
```tsx
<div className="mt-4">
```

Only `mt-4` (16px) between the verdict badge and the explanation section.

**Fix:** Increase to `mt-6` (24px). The badge fix (Issue 1) also helps because the badge has more visual weight than the current plain text, making the gap feel more intentional.

### Issue 5: Wrong-answer cards repeat full choice text at heavy weight (Problem 12)

**Current (line 77-80):**
```tsx
<div className="flex items-start gap-1 text-sm font-medium text-foreground">
  <span className="shrink-0">{choice.displayLabel})</span>
  <Markdown content={choice.textMd} />
</div>
```

The full choice text is rendered in `font-medium text-foreground` — same weight as a heading. The learner already read these options above.

**Fix:** Reduce visual weight — drop `font-medium`, use `text-muted-foreground`:

```diff
-<div className="flex items-start gap-1 text-sm font-medium text-foreground">
+<div className="flex items-start gap-1 text-sm text-muted-foreground">
```

### Issue 6: User's selected wrong answer not labeled "Your answer" (Problem 18)

**Current:** The `FeedbackProps` type has no `selectedChoiceId` prop. Wrong-answer cards cannot indicate which choice the user selected.

**Fix:** Add `selectedChoiceId` to `FeedbackProps`:

```tsx
export type FeedbackProps = {
  isCorrect: boolean;
  explanationMd: string | null;
  referenceMd?: string | null;
  choiceExplanations?: readonly FeedbackChoiceExplanation[];
  selectedChoiceId?: string | null;  // NEW
};
```

In the wrong-answer cards, when `choice.choiceId === selectedChoiceId`, render a subtle "Your answer" badge:

```tsx
{choice.choiceId === selectedChoiceId ? (
  <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
    Your answer
  </span>
) : null}
```

Callers (`practice-view.tsx`, `question-page-client.tsx`) need to pass `selectedChoiceId` through to `<Feedback>`.

### Issue 7: `role="alert"` on large content block is too assertive (Problem 22)

**Current (line 44-45):**
```tsx
<Card role="alert" ...>
```

`role="alert"` causes immediate assertive screen-reader interruption. For large content (verdict + explanation + wrong-answer breakdown + reference), this is disruptive.

**Fix:** Use `role="status"` (polite) instead of `role="alert"` (assertive):

```diff
-<Card role="alert" ...>
+<Card role="status" ...>
```

## Affected Files

| File | Change |
|------|--------|
| `components/question/feedback.tsx` | All 7 issues above |
| `components/question/Feedback.test.tsx` | Update assertions for badge, correct answer display, reference label, role change, "Your answer" badge |
| `app/(app)/app/practice/components/practice-view.tsx` | Pass `selectedChoiceId` to `<Feedback>` |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Pass `selectedChoiceId` to `<Feedback>` |
| `app/(app)/app/practice/components/practice-view.test.tsx` | Update Feedback assertions |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Update Feedback assertions |
| `tests/e2e/practice.spec.ts` | Update assertion for "Explanation" text if it changes to correct answer display |
| `tests/e2e/subscribe-and-practice.spec.ts` | Same E2E update |
| `tests/e2e/review-mode-audit.spec.ts` | Update feedback-card locator/expectations if role changes (`alert` → `status`) and if "Explanation" heading text changes. |
| `tests/e2e/core-app-pages.spec.ts` | Update post-submit heading assertion from "Explanation" to "Correct answer". |
| `components/theme-token-regression.test.tsx` | Update feedback token assertions if neutral-card treatment removes `border-success`/`border-destructive` from the outer card. |

## Verification

- [x] Feedback card has neutral background (no green/red tint)
- [x] "Correct" / "Incorrect" renders as a colored badge/chip
- [x] Correct answer text shown instead of "Explanation" heading
- [x] "Explanation" fallback still works when `choiceExplanations` is empty
- [x] Reference label is visually distinct from citation text (uppercase, tracking)
- [x] Verdict-to-explanation gap feels adequate (mt-6)
- [x] Wrong-answer choice text has reduced visual weight
- [x] "Your answer" badge appears on the user's selected wrong choice
- [x] "Your answer" badge does NOT appear on unselected wrong choices
- [x] Feedback card uses `role="status"` (verify with screen reader or DOM inspection)
- [x] Quick Practice feedback renders correctly
- [x] Review mode feedback renders correctly
- [x] Session review feedback renders correctly (including unanswered reveal)
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes
- [x] `pnpm build` succeeds

## Related

- [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) — Problems 2, 3, 8, 9, 10, 12, 18, 22
- BUG-154 — Markdown prose spacing (related: affects explanation paragraph rendering)
