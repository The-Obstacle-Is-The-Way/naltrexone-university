# BUG-157: Question Card and Choice Button Visual Polish — Text Size, Spacing, Contrast, Post-Submit Indicators

**Status:** Fixed (2026-02-26)
**Priority:** P2
**Date:** 2026-02-25
**Source:** [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) (Problems 7, 11, 13, 14, 19)

---

## Description

Five visual refinements across `question-card.tsx` and `choice-button.tsx` that improve readability and post-submit clarity for a medical education reading context.

### Issue 1: Text size feels small for medical reading (Problem 7)

Question stems, choice text, and explanations all use `text-sm` (14px). For a reading-heavy medical education product, body content should be `text-base` (16px). Labels and metadata stay at `text-sm`.

**Current:**
- `question-card.tsx:35` — stem: `text-sm`
- `choice-button.tsx:60` — choice text: `text-sm`
- `feedback.tsx:58` — explanation: `text-sm` (tracked in BUG-155)

**Fix:**

```diff
// question-card.tsx:35
-<Markdown content={stemMd} className="text-sm text-foreground" />
+<Markdown content={stemMd} className="text-base text-foreground" />

// choice-button.tsx:60
-<Markdown content={textMd} className="text-sm text-foreground" />
+<Markdown content={textMd} className="text-base text-foreground" />
```

### Issue 2: Stem-to-choices gap too tight (Problem 11)

The space between the end of the question stem and the first answer choice is `mt-6` (24px). The stem-to-choices gap should feel larger since it separates reading from selecting.

**Current (`question-card.tsx:37`):**
```tsx
<fieldset className="mt-6 space-y-3">
```

**Fix:**
```diff
-<fieldset className="mt-6 space-y-3">
+<fieldset className="mt-8 space-y-3">
```

### Issue 3: Choice badge (A/B/C/D circle) has weak contrast (Problem 13)

The letter circles use `bg-background` with a subtle `border-border` — on dark backgrounds, they barely stand out.

**Current (`choice-button.tsx:49-51`):**
```tsx
'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold leading-none text-foreground'
```

**Fix:** Increase background contrast:
```diff
-'... border border-border bg-background text-xs ...'
+'... border border-border bg-muted text-xs ...'
```

`bg-muted` provides more contrast against card backgrounds in both light and dark modes while remaining neutral.

### Issue 4: Hover/focus states may be too subtle on dark backgrounds (Problem 14)

The choice button has `hover:bg-muted` (line 29) and `focus-within:ring-[3px]` (line 28). These exist but may be too subtle on dark backgrounds.

**Current (`choice-button.tsx:28-29`):**
```tsx
'... focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
!disabled && 'cursor-pointer hover:bg-muted',
```

**Fix:** Verify visual contrast on dark theme. If too subtle, increase hover contrast:

```diff
-!disabled && 'cursor-pointer hover:bg-muted',
+!disabled && 'cursor-pointer hover:bg-muted/80 hover:border-muted-foreground/30',
```

This is a conditional fix — only apply if visual review confirms the current states are insufficient. The existing states may be adequate.

### Issue 5: Unchosen wrong answers have only passive dimming post-submit (Problem 19)

After submission, the correct answer gets green treatment and the selected wrong answer gets red treatment. All other wrong answers are dimmed via `opacity-50` but have no explicit wrong indicator — they're ambiguous.

**Current (`choice-button.tsx:31`, `question-card.tsx:41-48`):**
- Correct answer: `correctness: 'correct'` → green border/bg
- Selected wrong: `correctness: 'incorrect'` → red border/bg
- Unselected wrong: `correctness: null` + `disabled` → `opacity-50` only

**Fix:** Add a new correctness state for unselected wrong answers.

In `question-card.tsx`, set `correctness: 'wrong-unselected'` for non-selected, non-correct choices when post-submit:

```diff
 const correctness =
   correctChoiceId === null
     ? null
     : choice.id === correctChoiceId
       ? 'correct'
       : selected
         ? 'incorrect'
-        : null;
+        : 'wrong-unselected';
```

In `choice-button.tsx`, update the type and add styling:

```diff
-correctness?: 'correct' | 'incorrect' | null;
+correctness?: 'correct' | 'incorrect' | 'wrong-unselected' | null;
```

```diff
-disabled && !correctness && 'opacity-50',
+disabled && !correctness && 'opacity-50',
+correctness === 'wrong-unselected' && 'opacity-60',
```

Keep the dimming but make it slightly less aggressive than `opacity-50`. A subtle ✗ indicator is optional — the key improvement is distinguishing "not yet answered" dimming from "wrong and we know it" dimming.

## Affected Files

| File | Change |
|------|--------|
| `components/question/question-card.tsx` | Bump stem text size. Increase fieldset gap. Add `wrong-unselected` correctness. |
| `components/question/choice-button.tsx` | Bump choice text size. Increase badge contrast. Verify hover/focus. Add `wrong-unselected` styling. Update correctness type. |
| `components/question/QuestionCard.test.tsx` | Update assertions for text size, gap, correctness values |
| `components/question/ChoiceButton.test.tsx` | Update assertions for text size, badge contrast, correctness type |

## Verification

- [x] Question stem renders at `text-base` (16px)
- [x] Choice text renders at `text-base` (16px)
- [x] Stem-to-choices gap is visibly larger than before
- [x] A/B/C/D letter badges have adequate contrast on dark backgrounds
- [x] Hovering over an unselected choice produces a visible background change
- [x] Focus ring on choice is visible on dark backgrounds
- [x] Post-submit: correct answer has green treatment
- [x] Post-submit: selected wrong answer has red treatment
- [x] Post-submit: unselected wrong answers are dimmed but distinguishable from pre-answer state
- [x] Labels, metadata, and other secondary text remain at `text-sm`
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes

## Related

- [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) — Problems 7, 11, 13, 14, 19
- BUG-154 — Markdown prose spacing (related: affects paragraph rendering in stems)
- BUG-155 — Feedback card overhaul (related: explanation text size tracked there)
