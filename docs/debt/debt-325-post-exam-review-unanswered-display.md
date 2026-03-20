# DEBT-325: Post-Exam Review Unanswered Question Display

**Priority:** P2
**Created:** 2026-03-19
**Source:** BS-058 post-implementation audit
**Related:** [BS-058](../_archive/brainstorming/bs-058-exam-post-submit-flow-reorder.md), [PostExamReviewView](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

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

## Implementation Decision (2026-03-20)

**Approach:** Extend the shared `Feedback` component with an `isUnanswered` prop.
**Scope:** Fix both post-exam review AND standalone route in the same PR.

### Rationale

Both surfaces use the same `Feedback` component. Adding `isUnanswered?: boolean` to `FeedbackProps` lets both call sites opt into verdict suppression with a single prop, keeping the rendering logic centralized. A separate wrapper would duplicate explanation/reference/choice-explanation rendering.

### Concrete Changes

When `currentRow.isCorrect === null` and `currentRow.isAnswered === false` (unanswered), render:

1. The yellow warning banner: "You did not answer this question during this session." (reusing the standalone route's `border-warning/50 bg-warning/5` styling)
2. The `QuestionCard` with `correctChoiceId` highlighted but no selected choice
3. The explanation/reference/choice-explanation content **without** the red `Incorrect` verdict pill

**`Feedback` extension:**

```tsx
// feedback.tsx
export type FeedbackProps = {
  isCorrect: boolean;
  isUnanswered?: boolean; // NEW — suppresses verdict pill when true
  explanationMd: string | null;
  referenceMd?: string | null;
  choiceExplanations?: readonly FeedbackChoiceExplanation[];
  selectedChoiceId?: string | null;
};
```

When `isUnanswered` is true, `Feedback` skips the verdict pill (no "Correct"/"Incorrect" badge) but still renders explanation, reference, and choice explanations.

**Post-exam review (`post-exam-review-view.tsx:104-110`):**

```tsx
<Feedback
  isCorrect={currentRow.isCorrect === true}
  isUnanswered={!currentRow.isAnswered}
  ...
/>
```

Plus a yellow warning banner above Feedback when `!currentRow.isAnswered`.

**Standalone route (`question-page-client.tsx:347-368`):**

```tsx
<Feedback
  isCorrect={props.submitResult?.isCorrect ?? false}
  isUnanswered={!!isSessionReviewUnansweredReveal}
  ...
/>
```

The existing yellow banner at `question-page-client.tsx:319-326` already covers the banner. Adding `isUnanswered` suppresses the redundant red verdict pill underneath.

The key visual signal: **yellow/warning for unanswered, red/destructive for incorrect.** This matches the navigator colors (outline vs destructive) and gives the user accurate feedback about what happened.

### Mode coverage

The `isUnanswered` prop is **mode-agnostic**. It keys off `!currentRow.isAnswered` (or `!!isSessionReviewUnansweredReveal` on the standalone route), not off the session mode. This means:

- **Exam mode** (primary case): unanswered questions from skipping → yellow banner + verdict suppressed
- **Tutor mode early exit** (edge case): `end-practice-session.ts` has no validation requiring all questions to be answered, so ending a tutor session early can produce unanswered questions → same yellow banner + verdict suppressed, zero extra logic
- **Quick Practice**: impossible — each question creates an immediate attempt with `selectedChoiceId` and `isCorrect: boolean`, no session that can be left incomplete

No mode-specific branching needed. The existing `isAnswered` / `isCorrect: null` data model already captures the distinction uniformly across modes.

## Where Else This Matters

| Surface | Unanswered Handling | Status |
|---------|-------------------|--------|
| **Exam confirmation dialog** | "scored as incorrect" warning | Correct |
| **Post-exam review navigator** | `outline` variant for unanswered | Correct |
| **Post-exam review question detail** | Red `Incorrect` verdict, no unanswered banner | **Broken — this debt** |
| **Standalone question review** | Yellow unanswered banner, but still red `Incorrect` verdict from shared `Feedback` | **Partially correct — reference pattern exists, verdict still misleading** |
| **Session Summary breakdown** | `text-muted-foreground` "Unanswered" label | Correct |
| **Tutor mode (early exit)** | Unanswered questions possible if user clicks "End session" before answering all; `end-practice-session.ts` has no all-answered validation | **Handled for free** — `isUnanswered` prop is mode-agnostic; `!currentRow.isAnswered` works identically for tutor and exam rows |
| **Quick Practice** | N/A — each question creates an immediate attempt, no session context, no unanswered path | N/A |

## Acceptance Criteria

- [ ] Unanswered questions in post-exam review show yellow warning banner ("You did not answer this question during this session")
- [ ] Unanswered questions do NOT show the red "Incorrect" pill
- [ ] The correct answer and explanation content are still shown (the learning value is preserved)
- [ ] Navigator `outline` variant for unanswered remains unchanged
- [ ] Scoring is unchanged — unanswered still counts as incorrect in totals
- [ ] Test coverage for the unanswered display path in post-exam review
- [ ] Standalone route (`question-page-client.tsx`) verdict pill suppressed for unanswered review via the same `isUnanswered` prop
- [ ] Test coverage for the standalone unanswered review path (verdict suppressed, yellow banner preserved)
