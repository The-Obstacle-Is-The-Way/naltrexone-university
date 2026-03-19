# DEBT-324: Session-Scoped "Practice Missed Questions" CTA

**Priority:** P3
**Created:** 2026-03-19
**Source:** BS-058 implementation review
**Related:** [BS-058](../brainstorming/bs-058-exam-post-submit-flow-reorder.md) (Q8), [interaction-contracts.md](../practice-engine/interaction-contracts.md)

---

## The Problem

The "Practice missed questions" CTA on the exam Session Summary currently links to `/app/practice/quick?status=incorrect`, which loads **all** historically incorrect questions across every session the user has ever taken. The label implies session-scoped behavior — "practice the questions *you just got wrong*" — but the implementation delivers a global incorrect pool.

For a user who just finished a 10-question exam and got 3 wrong, clicking "Practice missed questions" might present 200 questions from their entire history. That's misleading.

## Why It Shipped This Way

Session-scoped question filtering does not exist in the Quick Practice pipeline. `GetNextQuestion.executeForFilters()` accepts `statuses`, `tagSlugs`, and `difficulties` — no `questionIds` or `sessionId` parameter. Adding one requires changes to the use case, the repository query (`listPublishedCandidateIds`), the schema (`GetNextQuestionInputSchema`), and the controller. That's a vertical-slice feature, not a label swap.

BS-058's scope was the post-submit flow reorder. The CTA was added as directionally correct — it gets the user into a reattempt flow for incorrect questions, just not scoped to the session.

## Data Already Available

The `summaryReview` prop on `SessionSummaryView` contains `GetPracticeSessionReviewOutput.rows`, each with `slug`, `questionId`, and `isCorrect`. The incorrect question slugs for the just-completed session are trivially derivable on the client:

```typescript
const missedSlugs = summaryReview.rows
  .filter((row) => row.isAvailable && row.isCorrect === false)
  .map((row) => row.slug);
```

## Proposed Fix

Extend Quick Practice to accept an optional `slugs` query parameter (comma-separated slugs). When present, the question pool is restricted to those slugs instead of using the global status filter.

**Changes required:**

1. **Schema:** Add optional `questionSlugs?: string[]` to `GetNextQuestionInputSchema` filters
2. **Repository:** Add a `slugs` filter to `listPublishedCandidateIds` (simple `WHERE slug = ANY($1)` clause)
3. **Use case:** Pass `questionSlugs` through `executeForFilters` to the repository
4. **Quick practice page:** Parse `slugs` query param, pass to filters
5. **Session Summary CTA:** Build the link from `summaryReview.rows` instead of hardcoding `status=incorrect`

**Scope:** Small vertical slice. No new use case needed — extends the existing filter pipeline.

## Alternatives Considered

| Option | Verdict |
|--------|---------|
| Change label to "Practice incorrect questions" (honest about global scope) | Weaker UX — doesn't leverage the session context the user just completed |
| Pass `sessionId` to Quick Practice and have it derive the question pool server-side | Over-engineered — the slugs are already available client-side |
| Encode question IDs in URL params | Fragile for large exams (URL length limits), and IDs are internal — slugs are the public identifier |

## Acceptance Criteria

- [ ] "Practice missed questions" on exam Summary opens Quick Practice scoped to only the questions answered incorrectly in that specific session
- [ ] If all session-scoped questions are subsequently answered correctly, Quick Practice shows "No more questions found"
- [ ] Global `status=incorrect` Quick Practice continues to work unchanged
- [ ] Tests cover the new `questionSlugs` filter path
