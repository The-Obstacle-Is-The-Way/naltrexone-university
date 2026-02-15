# BS-016: Color-Coded Question Navigator in Review Mode

**Date:** 2026-02-14
**Triggered by:** UX comparison of active session view (question navigator grid) vs review mode (linear previous/next only)
**Scope:** Review mode lacks the question navigator grid, forcing linear traversal to find incorrect answers in a completed session
**Related:** [SPEC-027](../specs/spec-027-session-review-navigation.md) (Session Review Navigation — implemented), [BS-009](../_archive/brainstorming/bs-009-session-review-navigation-gap.md) (Session Review Navigation Gap — archived)

---

## Open Questions

1. **Reuse or fork the component?** The existing `QuestionNavigator` (in `exam-review-view.tsx`) uses state-based navigation (`onNavigateQuestion` callback). Review mode uses URL-based navigation (each question is a separate route). Should we adapt the existing component to support both modes, or create a review-specific variant?
2. **Color palette?** Green/red is universal for correct/incorrect, but what shade works in both light and dark themes without clashing with existing UI tokens? Should we use the existing `destructive` and `success` variant tokens or add new ones?
3. **"Review Incorrect Only" filter?** UWorld and NBME offer a button to show only incorrect questions. Should the navigator support filtering, or is visual scanning sufficient for sessions of 20 questions?
4. **Fourth state for "marked for review"?** The active session navigator already shows a small dot for marked-for-review questions. Should this carry through to the review grid (e.g., AMBOSS uses yellow for "correct but used hints")?
5. **Mobile layout?** The active navigator uses 5 columns on mobile. For a 20-question session this is 4 rows — acceptable. For 40-question sessions this grows to 8 rows. Should the grid be collapsible on mobile?

---

## The Problem

When a user finishes a 20-question practice session and enters review mode, their primary goal is almost always: **find and study the questions I got wrong.** The current review UI forces them to click "Next →" up to 19 times sequentially to locate, say, question 17 which they missed.

Meanwhile, during the _active_ session, users see a question navigator grid — numbered circular buttons 1 through 20 — with random access to any question. This navigation disappears entirely in review mode, replaced by bare "← Previous" / "Next →" links.

### What Exists Today

**Active session** (`QuestionNavigator` in `exam-review-view.tsx`):
- Responsive grid of numbered buttons (5 cols mobile, 8 tablet, 10 desktop)
- Three visual states: `default` (current), `secondary` (answered), `outline` (unanswered)
- Mark-for-review dot indicator
- Random access via `onNavigateQuestion(questionId)` callback
- State-based navigation (no URL change)

**Review mode** (`SessionNavigationBar` in `question-page-client.tsx`):
- Linear "← Previous" / "Next →" / "Question X of Y"
- URL-based navigation with query params (`sessionId`, `from`, `mode=review`)
- Has `SessionNavigation.questions[]` with `{ slug, order, isCorrect }` — the data is already there but not visualized
- No way to see the full session at a glance or jump to a specific question

### Task Mismatch

The linear pattern makes sense for _taking_ a session (you proceed through questions in order). It does not match the review task, where users are triaging — scanning for red, drilling into specific failures. Forcing sequential traversal through correct answers to reach incorrect ones is pure friction with zero learning value.

### Industry Precedent

Competitor research confirms this is the established convention in medical education question banks:

- **UWorld**: Color-coded question list panel in review — green (correct), red (incorrect), white (omitted). Click any number to jump.
- **AMBOSS**: Four-color system — green (correct), yellow (correct with hint), red (incorrect), gray (unanswered).
- **NBME**: Navigator grid in review with "Review All" vs "Review Incorrect" filtering. Their newer interface restricted navigation to linear-only, and users found it so frustrating that some resorted to external tools to skip through questions.
- **Lecturio**: Performance overview with color-coded accuracy indicators per subject.

### Clean Architecture Analysis

The review page already fetches `GetPracticeSessionReviewOutput` which contains per-question `isCorrect`, `isAnswered`, and `markedForReview` state. The presentation layer has all the data — it simply doesn't render the navigator component. Uncle Bob's principle of keeping presentation honest applies: the UI should show users what it knows, not hide available information behind unnecessary sequential access.

## Impact

- **High friction for the primary review task**: Finding incorrect answers requires O(n) clicks instead of O(1)
- **Inconsistency**: Active session has rich navigation; review mode regresses to bare linear links
- **Missed at-a-glance performance summary**: The navigator grid doubles as a visual heat map (mostly green = good session, lots of red = focused study needed)

## Proposed Fix (Sketch)

### Approach: Add Question Navigator Grid to Review Mode

Add the question navigator grid above the question content in review mode, color-coded by result:

| Button State | Color | Meaning |
|-------------|-------|---------|
| Green filled | `success` variant | Answered correctly |
| Red filled | `destructive` variant | Answered incorrectly |
| Outline (neutral) | `outline` variant | Unanswered / skipped |
| Ring highlight | Current question indicator | Currently viewing |

Keep the existing "← Previous" / "Next →" links below the navigator — they serve a different moment (stepping through adjacent questions once you've jumped into a section).

### Component Strategy

Two options:

**Option A — Extend `QuestionNavigator`:** Add a `mode` prop (`'active' | 'review'`) and a `variant` callback (`(row) => 'success' | 'destructive' | 'outline'`). For review mode, replace the `onNavigateQuestion` callback with URL-based `<Link>` elements. This reuses the grid layout and responsive breakpoints.

**Option B — New `ReviewNavigator` component:** Fork the grid layout but with `<Link href={...}>` elements and correctness-based coloring from the start. Keeps the active session component unchanged.

Option A is preferred — less duplication, one source of truth for the grid layout.

### Data Flow

```
Review page loads → fetches GetPracticeSessionReviewOutput (already cached)
  → passes review.rows to QuestionNavigator with mode='review'
  → navigator renders colored grid with <Link> elements
  → user clicks red button #17 → navigates to /app/questions/[slug]?sessionId=...&from=practice&mode=review
  → question page loads, navigator shows #17 as current
```

### Visual Mockup (Text)

```
Question navigator
[1:green] [2:green] [3:red]  [4:green] [5:green]
[6:green] [7:red]  [8:green] [9:green] [10:outline]
[11:green] [12:green] [13:green] [14:red]  [15:green]
[16:green] [17:green] [18:green] [19:green] [20:green]

Question 3 of 20                           Back to Session
← Previous                                        Next →

[Question content with explanation...]
```

## Verification

1. New browser-mode test: review navigator renders with correct colors for each question state
2. New browser-mode test: clicking a navigator button navigates to the correct question URL with preserved query params
3. Existing unit tests for `SessionNavigationBar` remain passing (previous/next still works)
4. Manual: complete a session → enter review → see colored grid → click red buttons → verify navigation

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-14 | Proceed with navigator grid in review mode (not scrollable list) | Grid preserves the clean one-at-a-time view while adding random access; matches UWorld/AMBOSS convention |
| 2026-02-14 | Keep previous/next links alongside grid | Grid is for jumping in; arrows are for stepping through adjacent questions |
| 2026-02-14 | Defer "Review Incorrect Only" filter to v2 | Visual scanning is sufficient for typical 20-question sessions; reassess if users request it |

## Related

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` — existing `QuestionNavigator` component
- `app/(app)/app/questions/[slug]/question-page-client.tsx` — `SessionNavigationBar` (current linear nav)
- `app/(app)/app/questions/[slug]/question-page-logic.ts` — `SessionNavigation` type with `isCorrect` per question
- `src/application/use-cases/get-practice-session-review.ts` — `GetPracticeSessionReviewOutput` with per-row state
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts` — controller that fetches and caches session review data
