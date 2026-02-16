# FE-055: Practice Session Question Navigator Missing Navigation Landmark + `aria-current`

**Priority:** P3
**Status:** Open
**Found:** 2026-02-16
**Component:** Frontend — Accessibility

---

## Summary

The `QuestionNavigator` component (defined in `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`, lines 24–85 — note: this file also exports the post-session `ExamReviewView` at lines 87–235) renders numbered buttons for jumping between questions during an **in-progress** practice session (tutor/exam). It is rendered via `PracticeSessionPageView` when the navigator data is loaded.

The component has good per-button `aria-label`s, but the overall navigator UI lacks explicit navigation landmark semantics (e.g. `role="navigation"` / `<nav>` + `aria-label`). The “current question” state is visually indicated but not exposed via `aria-current="step"`.

## Affected File

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:24-80`

## Current Markup

```tsx
<Card className="gap-0 rounded-2xl p-4 shadow-sm">
  <div className="text-sm font-medium text-foreground">Question navigator</div>
  <div className="mt-3 grid grid-cols-5 gap-2 ...">
    {review.rows.map((row) => (
      <Button
        aria-label={`Question ${row.order}: ${statusParts.join(', ')}`}
        // Missing: aria-current for the current question button
      >
        {row.order}
      </Button>
    ))}
  </div>
</Card>
```

## Suggested Fix

Match the existing `ReviewQuestionNavigator` pattern:

1. Add a navigation landmark on the wrapper (e.g. `role="navigation"` + `aria-label="Question navigator"` on the `Card`)
2. Add `aria-current="step"` to the current question button

Optional follow-up (only if we add a stable question-region `id` in the practice view): add `aria-controls="<question-region-id>"` to each button.

## Acceptance Criteria

- [ ] Navigator exposes a navigation landmark with an accessible label
- [ ] Current question button has `aria-current="step"`
- [ ] Accessibility audit passes on the practice session page (navigator present)

---

## Related

- SPEC-028 `ReviewQuestionNavigator` — uses `role="navigation"` + `aria-label` + `aria-current="step"` pattern (reference implementation)
- `docs/_archive/specs/spec-028-review-question-navigator.md` — spec for the review navigator component
- `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` — reference implementation (`role="navigation"` at line 40, `aria-label` at line 41, `aria-current` at line 62)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — renders `QuestionNavigator` in `PracticeView.topContent`
