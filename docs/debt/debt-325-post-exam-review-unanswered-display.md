# DEBT-325: Post-Exam Review Unanswered Question Display

**Priority:** P2
**Created:** 2026-03-19
**Source:** BS-058 post-implementation audit
**Related:** [BS-058](../brainstorming/bs-058-exam-post-submit-flow-reorder.md), [PostExamReviewView](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

---

## The Problem

In the new post-exam review stage (`PostExamReviewView`), unanswered questions are visually indistinguishable from incorrect answers. The user sees the red "Incorrect" pill and the feedback content, but no indication that they *didn't answer* — only that the question is wrong.

**Root cause:** `post-exam-review-view.tsx:104-110` passes `isCorrect={currentRow.isCorrect === true}` to the `Feedback` component. When `isCorrect` is `null` (unanswered), this evaluates to `false`, which renders the "Incorrect" feedback path.

**The standalone review route is only partially correct.** When `from=summary` and the question was unanswered, `question-page-client.tsx:319-325` does render the yellow warning banner:

```tsx
<Card className="gap-0 rounded-2xl border-warning/50 bg-warning/5 p-4 text-sm text-foreground shadow-sm" role="status">
  You did not answer this question during this session.
</Card>
```

But the standalone route then still renders the shared `Feedback` component with:

```tsx
<Feedback
  isCorrect={props.submitResult?.isCorrect ?? false}
  ...
/>
```

at `question-page-client.tsx:347-367`. In the unanswered-review case, `submitResult` is `null`, so this still becomes `false` and produces the red `Incorrect` verdict pill.

So the current contrast is:

- **post-exam review:** red `Incorrect` verdict, no unanswered banner
- **standalone session review:** yellow unanswered banner **plus** the same red `Incorrect` verdict underneath

The post-exam review is worse, but the standalone route is not a fully correct end state yet.

## Scoring vs Display

**Scoring:** Unanswered = incorrect for the exam score. This is correct and already established — the confirmation dialog warns "unanswered questions will be scored as incorrect" (`exam-review-view.tsx:232`). The `totals.correct` count does not include unanswered questions. The accuracy percentage reflects this. No change needed to scoring.

**Display:** The user should see that they skipped a question, not that they picked the wrong answer. These are different learning signals:
- "You answered B but the answer was D" → wrong reasoning, study the content
- "You didn't answer this one" → time management issue, or unfamiliarity with the topic

**Navigator:** The `QuestionNavigator` in review mode already handles the unanswered/correct/incorrect distinction correctly — unanswered questions get `outline` while incorrect gets `destructive`. The inconsistency is in the question detail + feedback area.

## Proposed Fix

When `currentRow.isCorrect === null` and `currentRow.selectedChoiceId === null` (unanswered), render:

1. The yellow warning banner: "You did not answer this question during this session." (reusing the standalone route's `border-warning/50 bg-warning/5` styling)
2. The `QuestionCard` with `correctChoiceId` highlighted but no selected choice
3. The explanation/reference/choice-explanation content **without** the red `Incorrect` verdict pill

`Feedback` as currently written is **not** sufficient for step 3, because `isCorrect={false}` always renders the red `Incorrect` pill. The implementation therefore needs one of these two shapes:

- extend `Feedback` with an unanswered/verdict-suppressed mode, or
- render a small explanation-only wrapper for the unanswered case instead of using `Feedback` directly

The key visual signal: **yellow/warning for unanswered, red/destructive for incorrect.** This matches the navigator colors (outline vs destructive) and gives the user accurate feedback about what happened.

If the team extends `Feedback` with an unanswered mode, the standalone session-review unanswered path should adopt the same verdict-suppression behavior in the same PR or be tracked explicitly as follow-up debt. The yellow banner alone is not enough if the shared verdict pill still says `Incorrect`.

## Where Else This Matters

| Surface | Unanswered Handling | Status |
|---------|-------------------|--------|
| **Exam confirmation dialog** | "scored as incorrect" warning | Correct |
| **Post-exam review navigator** | `outline` variant for unanswered | Correct |
| **Post-exam review question detail** | Red `Incorrect` verdict, no unanswered banner | **Broken — this debt** |
| **Standalone question review** | Yellow unanswered banner, but still red `Incorrect` verdict from shared `Feedback` | **Partially correct — reference pattern exists, verdict still misleading** |
| **Session Summary breakdown** | `text-muted-foreground` "Unanswered" label | Correct |
| **Tutor mode** | N/A — tutor locks after submit, no skip-without-answer path | N/A |
| **Quick Practice** | N/A — no session context | N/A |

## Acceptance Criteria

- [ ] Unanswered questions in post-exam review show yellow warning banner ("You did not answer this question during this session")
- [ ] Unanswered questions do NOT show the red "Incorrect" pill
- [ ] The correct answer and explanation content are still shown (the learning value is preserved)
- [ ] Navigator `outline` variant for unanswered remains unchanged
- [ ] Scoring is unchanged — unanswered still counts as incorrect in totals
- [ ] Test coverage for the unanswered display path in post-exam review
- [ ] If shared `Feedback` is extended, standalone session-review unanswered presentation is kept consistent or explicitly tracked as separate follow-up
