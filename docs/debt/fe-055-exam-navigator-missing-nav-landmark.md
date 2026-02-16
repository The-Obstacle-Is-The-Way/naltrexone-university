# FE-055: Exam Review Navigator Missing `nav` Landmark and `aria-controls`

**Priority:** P3
**Status:** Open
**Found:** 2026-02-16
**Component:** Frontend — Accessibility

---

## Summary

The `QuestionNavigator` component in `exam-review-view.tsx` renders numbered buttons for jumping between questions during exam review, but the button group lacks a `<nav>` landmark wrapper. Individual buttons have `aria-label` but no `aria-controls` linking them to the question content area.

## Affected File

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:24-80`

## Current Markup

```tsx
<Card className="gap-0 rounded-2xl p-4 shadow-sm">
  <div className="text-sm font-medium text-foreground">
    Question navigator
  </div>
  <div className="mt-3 grid grid-cols-5 gap-2 ...">
    {review.rows.map((row) => (
      <Button
        aria-label={`Question ${row.order}: ${statusParts.join(', ')}`}
        // Missing: aria-controls="question-content"
      >
        {row.order}
      </Button>
    ))}
  </div>
</Card>
```

## Suggested Fix

1. Wrap the grid in `<nav aria-label="Question navigator">`
2. Add `aria-controls` pointing to the question content region ID
3. Add `aria-current="step"` to the current question button (for parity with the `ReviewQuestionNavigator` component in SPEC-028)

## Acceptance Criteria

- [ ] Navigator wrapped in `<nav aria-label="Question navigator">`
- [ ] Current question button has `aria-current="step"`
- [ ] Axe accessibility audit passes on exam review page

---

## Related

- SPEC-028 `ReviewQuestionNavigator` — uses `aria-current="step"` pattern
- `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` — reference implementation
