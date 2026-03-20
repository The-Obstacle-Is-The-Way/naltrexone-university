# DEBT-329: Question Navigator Colorblind Accessibility

**Priority:** P3
**Created:** 2026-03-19
**Source:** Chrome browser agent visual audit during DEBT-324 pre-removal documentation
**Related:** [DEBT-326](./debt-326-post-exam-review-focus-management.md), [ReviewQuestionNavigator](../../app/(app)/app/questions/[slug]/components/review-question-navigator.tsx), [QuestionNavigator](../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx)

---

## The Problem

Both question navigator components use color alone to distinguish correct (green/`success`), incorrect (red/`destructive`), and unanswered (gray/`outline`) buttons. Red-green colorblindness (~8% of males) makes correct and incorrect buttons visually indistinguishable — both appear as filled buttons of a similar muddy hue.

The outline vs filled distinction does separate unanswered from answered, so that axis is partially accessible. The broken axis is **correct vs incorrect** — both are filled, differentiated only by red vs green.

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
| `QuestionNavigator` | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:32-113` | Active session navigator + post-exam review; the colorblind issue is specifically the `mode=\"review\"` branch at `exam-review-view.tsx:76-82` |
| `ReviewQuestionNavigator` | `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:15-27,29-101` | Standalone question review (from summary, history) |

Both use the same `success` / `destructive` / `outline` correctness pattern in review mode.

The current-question ring (`ring-[3px] ring-ring/50`) is helpful for "where am I?" but does not distinguish correct from incorrect.

## Proposed Fix

Add a non-color indicator to distinguish correct from incorrect. Options:

1. **Icons inside buttons** — small checkmark for correct, X for incorrect, dash or empty for unanswered. Compact enough for the numbered grid.
2. **Border/shape variation** — e.g., dashed border for incorrect vs solid for correct.
3. **Legend below the heading** — "Green = Correct, Red = Incorrect, Outline = Unanswered" (weakest option — doesn't fix the buttons themselves).

Option 1 (icons) provides the strongest non-color signal and follows WCAG 1.4.1 (Use of Color).

## Acceptance Criteria

- [ ] Correct and incorrect navigator buttons are visually distinguishable without relying on color
- [ ] Unanswered distinction is preserved
- [ ] Screen-reader `aria-label` behavior remains unchanged
- [ ] Both `QuestionNavigator` and `ReviewQuestionNavigator` are updated consistently
