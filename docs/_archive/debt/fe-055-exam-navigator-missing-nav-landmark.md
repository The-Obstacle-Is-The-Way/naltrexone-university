# FE-055: Practice Session Question Navigator Missing Navigation Landmark + `aria-current`

**Priority:** P3
**Status:** Resolved
**Found:** 2026-02-16
**Resolved:** 2026-02-16
**Component:** Frontend — Accessibility

---

## Summary

The `QuestionNavigator` component (defined in `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`, lines 24–88 — note: this file also exports the post-session `ExamReviewView` at lines 90–238) renders numbered buttons for jumping between questions during an **in-progress** practice session (tutor/exam). It is rendered via `PracticeSessionPageView` when the navigator data is loaded.

The component had good per-button `aria-label`s, but previously lacked a navigation landmark on the wrapper and didn’t expose the current-question state via `aria-current="step"`.

## Affected File

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:24-88`

## Resolution

```tsx
<nav aria-label="Question navigator">
  <Card className="gap-0 rounded-2xl p-4 shadow-sm">
    <div className="text-sm font-medium text-foreground">
      Question navigator
    </div>
    <div className="mt-3 grid grid-cols-5 gap-2 ...">
      {review.rows.map((row) => (
        <Button
          aria-label={`Question ${row.order}: ${statusParts.join(', ')}`}
          aria-current={isCurrent ? 'step' : undefined}
        >
          {row.order}
        </Button>
      ))}
    </div>
  </Card>
</nav>
```

Added regression coverage:

- `app/(app)/app/practice/[sessionId]/components/exam-review-view.test.tsx` — asserts landmark + `aria-current="step"`

## Acceptance Criteria

- [x] Navigator exposes a navigation landmark with an accessible label
- [x] Current question button has `aria-current="step"`
- [ ] Accessibility audit passes on the practice session page (navigator present)

---

## Related

- SPEC-028 `ReviewQuestionNavigator` — uses `<nav aria-label="Question navigator">` + `aria-current="step"` pattern (reference implementation)
- `docs/_archive/specs/spec-028-review-question-navigator.md` — spec for the review navigator component
- `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` — reference implementation (`<nav aria-label="Question navigator">` at line 38, `aria-current` at line 59)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — renders `QuestionNavigator` in `PracticeView.topContent`
