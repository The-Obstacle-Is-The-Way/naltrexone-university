# DEBT-329: Question Navigator Colorblind Accessibility

**Priority:** P3
**Created:** 2026-03-19
**Updated:** 2026-03-23 (Chrome agent visual audit + adversarial review)
**Source:** Chrome browser agent visual audit during DEBT-324 pre-removal documentation
**Related:** [DEBT-326](./debt-326-post-exam-review-focus-management.md), [ReviewQuestionNavigator](../../app/(app)/app/questions/[slug]/components/review-question-navigator.tsx), [QuestionNavigator](../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx)

---

## The Problem

Both question navigator components use color alone to distinguish correct (green/`success`), incorrect (red/`destructive`), and unanswered (gray/`outline`) buttons. Red-green colorblindness (~8% of males) makes correct and incorrect buttons visually indistinguishable — both appear as filled buttons of a similar muddy hue.

The outline vs filled distinction does separate unanswered from answered, so that axis is partially accessible. The broken axis is **correct vs incorrect** — both are filled, differentiated only by red vs green.

In dark mode both variants render at 60% opacity (`dark:bg-success/60`, `dark:bg-destructive/60`), further reducing the already-poor hue contrast for colorblind users.

## What Already Works

Screen-reader accessibility is already handled. Both navigators provide descriptive `aria-label` attributes:

```tsx
// QuestionNavigator
aria-label={`Question ${row.order}: ${statusParts.join(', ')}`}

// ReviewQuestionNavigator
aria-label={`Question ${q.order}: ${statusLabel}${retryLabel}${isCurrent ? ', Current' : ''}`}
```

The problem is exclusively visual for sighted colorblind users.

## Affected Components

| Component | File | Used In |
|-----------|------|---------|
| `QuestionNavigator` | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:32-118` | Shared navigator used by the live session shell (`practice-session-page-view.tsx:267-272`) and post-exam review (`post-exam-review-view.tsx:84-90`); the colorblind issue is specifically the `mode="review"` branch at `exam-review-view.tsx:76-82` |
| `ReviewQuestionNavigator` | `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:15-27,29-101` | Standalone question review rendered from `question-page-client.tsx:244-247` |

Both use the same `success` / `destructive` / `outline` correctness pattern in review mode.

The current-question ring (`ring-[3px] ring-ring/50`) is helpful for "where am I?" but does not distinguish correct from incorrect.

## Codebase Trace Notes

- `components/ui/button.tsx:14-19` confirms the actual review fills come from the shared button variants, including `dark:bg-success/60` and `dark:bg-destructive/60`.
- A codebase search found no third navigator/grid surface that uses `Button` `success` + `destructive` variants for correctness. The accessibility debt is confined to these two navigator components.
- Adjacent review surfaces already use text labels instead of color-only pills:
  - `ExamReviewView` (`exam-review-view.tsx:120-268`) renders text-labeled review cards, not a colored grid.
  - `SessionBreakdownList` (`app/(app)/app/shared/components/session-breakdown-list.tsx`) renders explicit `Correct` / `Incorrect` / `Unanswered` text, so it is not affected by WCAG 1.4.1 on this axis.

## Existing Test Coverage

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.test.tsx` already asserts that review-mode navigator buttons render `bg-success`, `bg-destructive`, and `bg-background`/`border`.
- `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx` already asserts the same success/destructive/outline mapping and the current-question ring.
- The DEBT-329 implementation should extend these tests to assert the new non-color cue, including coexistence with `markedForReview` / `wasRetried` badges.

### Surfaces NOT Affected

These surfaces were verified via Chrome agent walkthrough (2026-03-23) and do NOT have the colorblind issue:

- **Review & Submit page (pre-finalization):** Rendered by `ExamReviewView` in the same file. Uses text-labeled cards ("Answered"/"Unanswered") — no colored grid buttons.
- **Active exam session navigator:** Uses `default`/`secondary`/`outline` variants (no red/green). Color is not the distinguishing axis.
- **Active tutor session navigator:** Despite tutor mode revealing correctness after each answer, the navigator still uses `default`/`secondary`/`outline` during the live session. The red/green variants only appear when `mode="review"`.

## Proposed Fix

Add a non-color indicator to distinguish correct from incorrect. Options:

1. **Absolutely-positioned badge/glyph** — small checkmark (✓) badge for correct, X badge for incorrect, nothing for unanswered. This must be rendered in its own absolutely-positioned wrapper rather than as a direct child SVG, because `Button` uses `has-[>svg]:px-3` and direct-child icons would change the pill padding. The buttons are `h-9` (36 px tall) but do **not** set `overflow-hidden`, so a tiny overflow badge can remain visible outside the pill edge.
2. **Border/shape variation** — e.g., dashed border for incorrect vs solid for correct.
3. **Legend below the heading** — "Green = Correct, Red = Incorrect, Outline = Unanswered" (weakest option — doesn't fix the buttons themselves).

Option 1 remains the strongest fix, but it should be treated as a **small overflow badge**, not an interior corner icon. A badge tucked partly outside the pill edge matches the current dot pattern and avoids crowding the number inside a 36 px-tall control.

### Design Constraint: `markedForReview` Dot Collision

Both navigators already render an absolutely-positioned dot in the **top-right** corner, but the offsets are not identical:

```tsx
// QuestionNavigator
<span aria-hidden="true"
  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />

// ReviewQuestionNavigator
<span aria-hidden
  className="absolute -right-1 -top-1 size-2 rounded-full bg-primary" />
```

The correct/incorrect badge must use a **different corner** (e.g., bottom-right) or a different indicator style to avoid visual collision when a question is both marked/retried and correct/incorrect. Any shared implementation must account for the current offset mismatch or deliberately standardize it.

## Secondary Recommendation

`QuestionNavigator` and `ReviewQuestionNavigator` currently duplicate the review-state mapping, pill grid layout, current-ring styling, and badge positioning logic. A small shared helper or review-specific navigator item component would reduce drift and make the DEBT-329 fix easier to keep consistent across both surfaces.

## Known Visual Limitation

The overflow badges meet WCAG 1.4.1 via shape distinction (✓ vs ✗) but have rough visual polish:

- **Light mode:** The `bg-background` badge circle blends into the light page background, making badges less prominent.
- **Size:** Badges are small (`size-3.5` container, `size-2.5` icon) and feel like a functional band-aid rather than a designed feature.
- **Icon colors:** The ✓ is `text-success` (green) and the ✗ is `text-destructive` (red) — matching their parent button. This is redundant reinforcement, not the accessibility mechanism (shape is). A future polish pass could use a neutral color (e.g., `text-foreground`) for better contrast against the button fill.

These are cosmetic — the accessibility fix is functional. Polish can be revisited if users report visual confusion or if a broader design pass touches the navigator.

## Acceptance Criteria

- [ ] Correct and incorrect navigator buttons are visually distinguishable without relying on color
- [ ] Unanswered distinction is preserved
- [ ] Screen-reader `aria-label` behavior remains unchanged
- [ ] Both `QuestionNavigator` and `ReviewQuestionNavigator` are updated consistently
- [ ] Colorblind indicator does not visually collide with the existing `markedForReview` dot
