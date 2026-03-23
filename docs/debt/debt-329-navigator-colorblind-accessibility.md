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
| `QuestionNavigator` | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:32-118` | Active session navigator + post-exam review; the colorblind issue is specifically the `mode="review"` branch at `exam-review-view.tsx:77-82` |
| `ReviewQuestionNavigator` | `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:15-27,29-101` | Standalone question review (from summary, history) |

Both use the same `success` / `destructive` / `outline` correctness pattern in review mode.

The current-question ring (`ring-[3px] ring-ring/50`) is helpful for "where am I?" but does not distinguish correct from incorrect.

### Surfaces NOT Affected

These surfaces were verified via Chrome agent walkthrough (2026-03-23) and do NOT have the colorblind issue:

- **Review & Submit page (pre-finalization):** Rendered by `ExamReviewView` in the same file. Uses text-labeled cards ("Answered"/"Unanswered") — no colored grid buttons.
- **Active exam session navigator:** Uses `default`/`secondary`/`outline` variants (no red/green). Color is not the distinguishing axis.
- **Active tutor session navigator:** Despite tutor mode revealing correctness after each answer, the navigator still uses `default`/`secondary`/`outline` during the live session. The red/green variants only appear when `mode="review"`.

## Proposed Fix

Add a non-color indicator to distinguish correct from incorrect. Options:

1. **Absolutely-positioned corner icons** — small checkmark (✓) badge for correct, X badge for incorrect, nothing for unanswered. Uses the same positioning pattern as the existing `markedForReview` dot (`absolute -right-0.5 -top-0.5 size-2 rounded-full`).
2. **Border/shape variation** — e.g., dashed border for incorrect vs solid for correct.
3. **Legend below the heading** — "Green = Correct, Red = Incorrect, Outline = Unanswered" (weakest option — doesn't fix the buttons themselves).

Option 1 (corner icons) provides the strongest non-color signal, follows WCAG 1.4.1 (Use of Color), and is proven by the existing review-dot pattern.

### Design Constraint: `markedForReview` Dot Collision

Both navigators already render an absolutely-positioned dot in the **top-right** corner for questions marked for review:

```tsx
<span aria-hidden="true"
  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
```

The correct/incorrect icon must use a **different corner** (e.g., bottom-right) or a different indicator style to avoid visual collision when a question is both marked-for-review and correct/incorrect.

## Acceptance Criteria

- [ ] Correct and incorrect navigator buttons are visually distinguishable without relying on color
- [ ] Unanswered distinction is preserved
- [ ] Screen-reader `aria-label` behavior remains unchanged
- [ ] Both `QuestionNavigator` and `ReviewQuestionNavigator` are updated consistently
- [ ] Colorblind indicator does not visually collide with the existing `markedForReview` dot
