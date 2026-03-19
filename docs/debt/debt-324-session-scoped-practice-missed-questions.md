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

## Options

### Option A: Remove the CTA entirely

Remove "Practice missed questions" from the exam Session Summary. The post-exam CTA set becomes: "Review your answers" + "Back to Practice" + "View in History" (ghost).

**Why this might be the right call:**
- The user already reviewed every question with full feedback in the new post-exam review stage (BS-058). They know exactly what they got wrong and why.
- If they want to retry those topics, they can start a new session from Practice — they have the knowledge to self-direct.
- Removing a broken/misleading CTA is better than shipping one that doesn't do what it says.
- Simplifies the Summary page. Fewer choices = less decision fatigue (the same principle that drove removing per-question Try Again in the first place).

**Why it might not be:**
- Loses the one-click path from "I just failed these" to "let me retry them now." The user has to manually go to Practice, remember which topics they bombed, and set up a new session. That's friction.
- "Practice missed questions" is a natural next step after seeing your exam results — removing it might feel like a missing affordance.

### Option B: Fix it (session-scoped filtering)

Extend Quick Practice to accept a `slugs` query parameter. Build the link from `summaryReview.rows` data already available on the Summary page.

**Changes required:**
1. Add optional `questionSlugs?: string[]` to `GetNextQuestionInputSchema` filters
2. Add a `slugs` filter to `listPublishedCandidateIds` (simple `WHERE slug = ANY($1)` clause)
3. Pass `questionSlugs` through `executeForFilters` to the repository
4. Parse `slugs` query param on the Quick Practice page
5. Build the link from `summaryReview.rows` instead of hardcoding `status=incorrect`

**Scope:** Small vertical slice. No new use case needed — extends the existing filter pipeline.

### Option C: Relabel honestly

Change "Practice missed questions" to "Practice incorrect questions" — accurately describes what it does (global incorrect pool, not session-scoped). Less compelling but not misleading.

## Open Decision

**This feature may not be needed at all.** The post-exam review stage (BS-058) already gives the user a full feedback walkthrough of every question they got wrong. The "Practice missed questions" CTA was originally proposed to replace per-question "Try Again" (AF-6), but the real AF-6 fix was *suppression* — not replacement. The CTA was additive, not required.

**Resolution path:** Evaluate the post-BS-058 exam flow in a live walkthrough. If the Summary feels complete without the CTA, choose Option A. If there's a clear "I want to retry these now" moment, choose Option B.

## Acceptance Criteria (if Option B is chosen)

- [ ] "Practice missed questions" on exam Summary opens Quick Practice scoped to only the questions answered incorrectly in that specific session
- [ ] If all session-scoped questions are subsequently answered correctly, Quick Practice shows "No more questions found"
- [ ] Global `status=incorrect` Quick Practice continues to work unchanged
- [ ] Tests cover the new `questionSlugs` filter path

## Acceptance Criteria (if Option A is chosen)

- [ ] "Practice missed questions" CTA removed from exam Session Summary
- [ ] Summary CTA set: "Review your answers" (primary) + "Back to Practice" (outline) + "View in History" (ghost)
- [ ] No regressions in tutor-mode Summary (which never had this CTA)
