# DEBT-324: Remove Misleading "Practice Missed Questions" CTA From Exam Summary

**Priority:** P3
**Created:** 2026-03-19
**Updated:** 2026-03-19
**Source:** BS-058 implementation audit
**Related:** [BS-058](../brainstorming/bs-058-exam-post-submit-flow-reorder.md), [interaction-contracts.md](../practice-engine/interaction-contracts.md)

---

## Decision

**Recommendation: Option A. Remove the CTA.**

Do **not** extend Quick Practice for session-scoped missed-question filtering as part of this debt. After BS-058, the user already gets a full in-session post-exam review with explanations, choice-level feedback, and navigator-driven review before reaching the terminal summary. An immediate reattempt CTA on the summary is now redundant, and the current implementation is also misleading.

---

## Verified Current Behavior

### What the button does right now

`SessionSummaryView` renders the CTA as:

```tsx
<Link href={`${ROUTES.APP_PRACTICE_QUICK}?status=incorrect`}>
  Practice missed questions
</Link>
```

Source:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

### Exact code path

1. User clicks `Practice missed questions` on the exam summary.
2. Browser navigates to `/app/practice/quick?status=incorrect`.
3. `QuickPracticeClient` reads the query string via `parseStatusParam(...)`.
4. `QuickPracticeClient` builds `filters = { tagSlugs: [], difficulty: null, status: 'incorrect' }`.
5. `usePracticeQuestionFlow()` passes those filters into `usePracticeQuestionAnswerFlow()`.
6. `practice-page-logic.ts` converts them to server filters:
   - `statuses: [input.filters.status]`
7. `question-controller.ts` calls `GetNextQuestionUseCase.execute({ userId, filters })`.
8. `GetNextQuestionUseCase.executeForFilters()` calls:
   - `questions.listPublishedCandidateIds({ ...filters, userId })`
9. `DrizzleQuestionRepository.listPublishedCandidateIds()` applies the status filter in `buildStatusCondition('incorrect', userId)`.
10. The repository query selects questions whose **latest visible attempt** for this user is incorrect.

### What `status=incorrect` actually means

It does **not** mean "questions you got wrong in this session."

It also does **not** mean "every question you have ever gotten wrong at least once."

The actual semantics are:

- Global across the user's visible attempt history
- Based on the **latest** visible attempt per question
- Excludes active exam attempts via `activeExamVisibilityCondition()`
- Includes sessionless attempts, tutor attempts, and completed exam attempts

The decisive repository logic is:

```ts
const latestAttemptRows = this.latestAttemptRowsSubquery(userId);
return inArray(
  questions.id,
  this.db
    .select({ questionId: latestAttemptRows.questionId })
    .from(latestAttemptRows)
    .where(
      and(
        eq(latestAttemptRows.attemptRank, 1),
        eq(latestAttemptRows.isCorrect, false),
      ),
    ),
);
```

So the current CTA launches a **global latest-incorrect pool**, not a session-scoped retry set.

---

## Summary Data Available Today

### What `SessionSummaryView` receives

`SessionSummaryView` does **not** receive a prop literally named `summaryReview`.

It receives:

```ts
review?: GetPracticeSessionReviewOutput | null;
reviewLoadState?: LoadState;
```

and aliases that locally:

```ts
const summaryReview = review ?? null;
```

Source:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

### Is the review data available by the time the user sees Summary?

Not on first paint.

The terminal summary renders as soon as `summary` exists. The summary review data is then fetched asynchronously by `usePracticeSessionSummaryReview()`, which calls `createSummaryReviewEffect(...)` after `summary` is set.

That means:

- `Session Summary` heading and stat cards can render first
- `summaryReview` may still be `null`
- breakdown links and `Review your answers` wait on the review fetch

Sources:
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-summary-review.ts`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`

### Could we derive session-scoped missed question slugs on the client today?

**Yes, once `reviewLoadState === 'ready'`.**

`GetPracticeSessionReviewOutput.rows` contains:

- `questionId`
- `isCorrect`
- `isAvailable`
- `slug` for available rows only

So the client can already derive session-scoped missed slugs:

```ts
const missedSlugs = review.rows
  .filter((row) => row.isAvailable && row.isCorrect === false)
  .map((row) => row.slug);
```

But the existing Quick Practice route cannot consume those slugs. So the missing piece is **not** slug derivation; it is the lack of a question-id/slug-scoped filter path in the Quick Practice stack.

---

## Why Removal Is The Right Product Decision

### First-principles UX read

After BS-058, exam mode already does the important pedagogical work in the right place:

```text
Submit exam
  → Post-exam review
  → full feedback for each question
  → View Summary / Finish review
  → Session Summary
```

By the time the user reaches `Session Summary`, they have already:

- seen every question again
- seen the correct answer
- seen the explanation / clinical pearl / why-wrong content
- completed the emotionally relevant learning moment

At that point, an immediate reattempt CTA is weak:

- It duplicates a need the post-exam review already served
- It encourages short-term re-answering immediately after reveal
- It muddies exam finality after BS-058 intentionally removed per-question reattempt from exam review
- It adds one more summary choice without adding a clearly distinct user outcome

For a medical board prep student, the more natural next actions after a reviewed exam are:

- leave and continue later
- re-open reviewed answers
- go back to general practice
- inspect history

An immediate "retry the questions you just studied" path is not the highest-value next step.

### Why Option B is not recommended

A session-scoped implementation is technically feasible, but it is the wrong feature to prioritize now.

Even the smallest honest version requires extending the Quick Practice filter contract vertically across:

- route/query parsing
- controller schema
- use case filter shape
- repository query

That is meaningful cross-layer work for a CTA that is no longer central after BS-058.

### Why Option C is not recommended

Relabeling to `Practice incorrect questions` would be more honest than the current label, but it still promotes a global retry path at exactly the wrong moment in the post-exam funnel.

The main problem is no longer just naming. It is that the CTA itself is unnecessary in this surface.

---

## Locked Fix

Remove `Practice missed questions` from the exam `SessionSummaryView`.

### Production change

File:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Remove:
- `showPracticeMissedQuestions`
- the outline CTA linking to `${ROUTES.APP_PRACTICE_QUICK}?status=incorrect`
- any layout branching that exists only to support that CTA

### Expected summary CTA set after removal

Exam summary:
- `Review your answers` when a reviewable slug exists
- `Back to Practice`
- `View in History`

Tutor summary:
- unchanged

### Tests to update

Files:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.browser.spec.tsx`
- `app/(app)/app/practice/[sessionId]/page.test.tsx`

Update assertions so exam summaries no longer expect:
- `Practice missed questions`
- `/app/practice/quick?status=incorrect`

### Docs to update in the implementation PR

Files:
- `docs/practice-engine/interaction-contracts.md`
- `docs/practice-engine/question-rendering-architecture.md`
- `docs/debt/index.md`

Remove references to `Practice missed questions` from the shipped exam-summary CTA set.

---

## Edge Cases Audited

### 0 answered exam

Handled today. The CTA does not render because:

```ts
summary.totals.correct < summary.totals.answered
```

is `0 < 0`, which is false.

### All-correct exam

Handled today. The CTA does not render.

### Unavailable questions

Handled in both summary and post-exam review:

- summary breakdown shows `[Question no longer available]`
- post-exam review renders `Question no longer available.`

This does not change the recommendation. It only confirms the CTA is not needed as a fallback.

### Session reopen

Handled correctly today. Completed-session reopen goes to terminal `Session Summary`, not back into ephemeral post-exam review.

---

## Adjacent Issues Found During Audit

These are real, but they should **not** block the CTA removal and should **not** be folded into DEBT-324's implementation.

### 1. Post-exam review loses the explicit unanswered-state copy

`PostExamReviewView` renders unanswered rows through:

```tsx
<Feedback isCorrect={currentRow.isCorrect === true} ... />
```

When `currentRow.isCorrect` is `null`, this falls into the generic incorrect branch of `Feedback`. Unlike the standalone review route, the post-exam review does **not** show:

`You did not answer this question during this session.`

That means unanswered questions are visually collapsed into plain incorrect feedback even though the navigator still labels them `Unanswered`.

**Recommendation:** track as a separate post-BS-058 UX debt.

### 2. Post-exam review navigation does not currently move focus after question changes

`PostExamReviewView` swaps the rendered question in place, but there is no focus-management effect that moves focus to the controlled question panel or announces the change. Keyboard and screen-reader users may remain on the triggering button while the main review content changes below.

**Recommendation:** track as a separate accessibility debt.

### 3. `interaction-contracts.md` is accurate for the shipped post-session flow, but mixed in status

Section 5 accurately documents the shipped BS-058 flow. However, the document header still describes the overall exam contract as a BS-055 proposed target while some sections now document current shipped behavior. That mixed current/target framing is understandable, but it is easy to misread.

**Recommendation:** future docs cleanup, not part of DEBT-324.

### 4. `bookmark-surface-policy.md` contains stale summary-review provenance wording

It still says the summary review CTA routes through `from=history&sessionId=...`, but production now uses `from=summary`.

**Recommendation:** doc-only cleanup outside this debt.

---

## Acceptance Criteria

- [ ] `Practice missed questions` CTA removed from exam `SessionSummaryView`
- [ ] Exam summary CTA set becomes: `Review your answers` + `Back to Practice` + `View in History`
- [ ] Tutor summary behavior remains unchanged
- [ ] Tests no longer expect the Quick Practice incorrect-pool link from exam summaries
- [ ] Interaction/docs updated to remove `Practice missed questions` from the shipped exam-summary contract
