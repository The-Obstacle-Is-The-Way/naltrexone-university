# DEBT-329: Question Navigator Colorblind Accessibility

**Priority:** P3
**Created:** 2026-03-19
**Updated:** 2026-03-23 (Chrome agent visual audit, adversarial review, final implementation reconciliation, and DEBT-329 closure)
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
| `QuestionNavigator` | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:33-118` | Shared navigator used by the live session shell (`practice-session-page-view.tsx:267-272`) and post-exam review (`post-exam-review-view.tsx:84-90`); review-mode correctness styling lives at `exam-review-view.tsx:77-84`, and the implemented badge injection lives at `exam-review-view.tsx:102-104` |
| `ReviewQuestionNavigator` | `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:15-18,20-91` | Standalone question review rendered from `question-page-client.tsx:244-247`; the implemented badge injection lives in the shared `innerContent` fragment at `review-question-navigator.tsx:43-53` |
| `ReviewCorrectnessBadge` | `app/(app)/app/shared/components/review-correctness-badge.tsx:1-20` | Shared bottom-right overflow badge used by both review navigators; renders `Check` / `X` in a `size-3.5` badge container with `bg-background ring-1 ring-border` and neutral `text-foreground` icons |
| `Review Navigator Utils` | `app/(app)/app/shared/components/review-navigator-utils.ts:1-13` | Shared review-mode correctness mapping used by both navigators; centralizes `getReviewVariant` and `getReviewStatusLabel` so success/destructive/outline and Correct/Incorrect/Unanswered logic stay in sync |

Both navigators still use the same `success` / `destructive` / `outline` correctness pattern in review mode. The shared badge adds the non-color cue on top of that fill treatment.

The current-question ring (`ring-[3px] ring-ring/50`) is helpful for "where am I?" but does not distinguish correct from incorrect.

## Codebase Trace Notes

- `components/ui/button.tsx:14-19,27` confirms the actual review fills come from the shared button variants, including `dark:bg-success/60` and `dark:bg-destructive/60`, and confirms the `has-[>svg]:px-3` padding trap on default-sized buttons.
- A codebase search found no third navigator/grid surface that uses `Button` `success` + `destructive` variants for correctness. The accessibility debt is confined to these two navigator components.
- Adjacent review surfaces already use text labels instead of color-only pills:
  - `ExamReviewView` (`app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`) renders text-labeled review cards, not a colored grid.
  - `SessionBreakdownList` (`app/(app)/app/shared/components/session-breakdown-list.tsx`) renders explicit `Correct` / `Incorrect` / `Unanswered` text, so it is not affected by WCAG 1.4.1 on this axis.

## Existing Test Coverage

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.test.tsx` asserts review-mode `bg-success`, `bg-destructive`, and `bg-background`/`border` styling, badge absence in exam mode, correct/incorrect badge presence, unanswered badge absence, and coexistence with the `markedForReview` top-right dot.
- `app/(app)/app/questions/[slug]/components/review-question-navigator.test.tsx` asserts the same success/destructive/outline mapping, current-question ring behavior, correct/incorrect badge presence, unanswered badge absence, and coexistence with the `wasRetried` top-right dot.
- `app/(app)/app/shared/components/review-navigator-utils.test.ts` asserts the shared `getReviewVariant` and `getReviewStatusLabel` helpers for correct / incorrect / unanswered states.
- The navigator badge tests also verify the implemented badge sizing/tone tokens via `size-2.5` and `text-foreground` class assertions.

### Surfaces NOT Affected

These surfaces were verified via Chrome agent walkthrough (2026-03-23) and do NOT have the colorblind issue:

- **Review & Submit page (pre-finalization):** Rendered by `ExamReviewView` in the same file. Uses text-labeled cards ("Answered"/"Unanswered") — no colored grid buttons.
- **Active exam session navigator:** Uses `default`/`secondary`/`outline` variants (no red/green). Color is not the distinguishing axis.
- **Active tutor session navigator:** Despite tutor mode revealing correctness after each answer, the navigator still uses `default`/`secondary`/`outline` during the live session. The red/green variants only appear when `mode="review"`.

## Implemented Fix

The final implementation uses a shared `ReviewCorrectnessBadge` component:

1. **Correct** renders a bottom-right overflow badge with `Check` and neutral `text-foreground`.
2. **Incorrect** renders a bottom-right overflow badge with `X` and neutral `text-foreground`.
3. **Unanswered** renders no badge.

The badge stays in an absolutely-positioned wrapper span (`absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-background ring-1 ring-border`) so the SVG remains a grandchild, not a direct `Button` child. That preserves the default `px-4` button padding despite the global `has-[>svg]:px-3` rule. The controls are still `h-9` (36 px tall) and still do not set `overflow-hidden`, so the overflow badge remains visible outside the pill edge.

The review-mode state mapping is also shared now: `getReviewVariant` centralizes the `success` / `destructive` / `outline` button selection, and `getReviewStatusLabel` centralizes the `Correct` / `Incorrect` / `Unanswered` aria-label text for both navigators.

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

The implemented correctness badge uses the **bottom-right** corner (`-bottom-1 -right-1`), so it does not collide with either top-right dot. The current offset mismatch between the two top-right dots remains intentional and non-blocking.

## DRY Status

The original DRY concern is now **fully addressed for DEBT-329 scope**:

- Badge rendering is centralized in `ReviewCorrectnessBadge`.
- Review-state button variants are centralized in `getReviewVariant`.
- Review-state status labels are centralized in `getReviewStatusLabel`.
- `ReviewQuestionNavigator` no longer duplicates the badge + retry-dot fragment across its `isCurrent` and `Link` branches.

The two navigators still remain separate components, which is intentional. Their surrounding rendering logic differs meaningfully (`mode` branching, `aria-controls`, retry/mark dots, route generation), so a single merged navigator component is neither necessary nor desirable here.

## Known Visual Notes

- **Light-mode badge visibility (resolved):** The initial `bg-background` badge circle was invisible where it overflowed the button edge in light mode (white on white). Fixed in `review-correctness-badge.tsx:15` by adding `ring-1 ring-border` to the badge container, which provides a 1px ring that guarantees visibility in both themes without changing the dark-mode appearance.
- **Size:** Badges are small (`size-3.5` container, `size-2.5` icon) — at the lower end of comfortable readability but recognizable. Any smaller would fail.
- **Icon colors (resolved):** Both icons now use `text-foreground` in `review-correctness-badge.tsx:17`, giving maximum contrast against the badge background in both themes. The accessibility mechanism remains shape (✓ vs ✗), not icon hue.

## Acceptance Criteria

- [x] Correct and incorrect navigator buttons are visually distinguishable without relying on color
- [x] Unanswered distinction is preserved
- [x] Screen-reader `aria-label` behavior remains unchanged
- [x] Both `QuestionNavigator` and `ReviewQuestionNavigator` are updated consistently
- [x] Colorblind indicator does not visually collide with the existing `markedForReview` dot
