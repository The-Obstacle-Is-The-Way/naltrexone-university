# DEBT-324: Remove Misleading "Practice Missed Questions" CTA From Exam Summary (Resolved)

**Priority:** P3
**Created:** 2026-03-19
**Resolved:** 2026-03-19
**Source:** BS-058 implementation audit
**Related:** [BS-058](../brainstorming/bs-058-exam-post-submit-flow-reorder.md), [interaction-contracts.md](../../practice-engine/interaction-contracts.md)

---

## Resolution

Resolved on 2026-03-19 by removing `Practice missed questions` from the exam `SessionSummaryView`.

The shipped exam summary CTA set is now:

- `Review your answers` when a reviewable slug exists
- `Back to Practice`
- `View in History`

This archived doc preserves the pre-removal audit that justified the change.

---

## Pre-Resolution Audit

### What the button did before removal

Before DEBT-324 landed, the CTA existed in the shipped exam summary.

Pre-removal render contract in `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`:

- `showPracticeMissedQuestions` is computed at lines 29-30:

```ts
const showPracticeMissedQuestions =
  summary.mode === 'exam' && summary.totals.correct < summary.totals.answered;
```

- The CTA renders at lines 121-126:

```tsx
<Link href={`${ROUTES.APP_PRACTICE_QUICK}?status=incorrect`}>
  Practice missed questions
</Link>
```

- The CTA also currently participates in the button-weighting branch at lines 35-36 and 128-131:

```ts
const hasPrimaryFollowUp =
  firstReviewableSlug !== null || showPracticeMissedQuestions;
```

Source:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:29-36`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:121-131`

### Exact code path

1. User clicks `Practice missed questions` on the exam summary.
   Source: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:121-125`
2. Browser navigates to `/app/practice/quick?status=incorrect`.
3. `QuickPracticeClient` reads the query string via `parseStatusParam(...)`.
   Source: `app/(app)/app/practice/quick/quick-practice-client.tsx:26-31,54`
4. `QuickPracticeClient` builds `filters = { tagSlugs: [], difficulty: null, status: 'incorrect' }`.
   Source: `app/(app)/app/practice/quick/quick-practice-client.tsx:56-63`
5. `usePracticeQuestionFlow()` passes those filters into `usePracticeQuestionAnswerFlow()`.
   Source: `app/(app)/app/practice/quick/quick-practice-client.tsx:65-67`; `app/(app)/app/practice/hooks/use-practice-question-flow.ts:47-52`
6. `practice-page-logic.ts` converts them to server filters:
   - `statuses: [input.filters.status]`
   Source: `app/(app)/app/practice/practice-page-logic.ts:66-70`
7. `question-controller.ts` calls `GetNextQuestionUseCase.execute({ userId, filters })`.
   Source: `src/adapters/controllers/question-controller.ts:192-210`
8. `GetNextQuestionUseCase.executeForFilters()` calls:
   - `questions.listPublishedCandidateIds({ ...filters, userId })`
   Source: `src/application/use-cases/get-next-question.ts:266-273`
9. `DrizzleQuestionRepository.listPublishedCandidateIds()` applies the status filter in `buildStatusCondition('incorrect', userId)`.
   Source: `src/adapters/repositories/drizzle-question-repository.ts:195-215,217-257`
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

So the removed CTA launched a **global latest-incorrect pool**, not a session-scoped retry set.

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
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:13-23`

### Is the review data available by the time the user sees Summary?

Not on first paint.

The terminal summary renders as soon as `summary` exists. The summary review data is then fetched asynchronously by `usePracticeSessionSummaryReview()`, which calls `createSummaryReviewEffect(...)` after `summary` is set.

That means:

- `Session Summary` heading and stat cards can render first
- `summaryReview` may still be `null`
- breakdown links and `Review your answers` wait on the review fetch
- `Practice missed questions` does **not** wait on the review fetch; it renders solely from `summary.mode` and `summary.totals`

Sources:
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-summary-review.ts:21-23,32-52`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:311-360`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:29-36,83-127`

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

But the existing Quick Practice route cannot consume those slugs. So the missing piece was **not** slug derivation; it was the lack of a question-id/slug-scoped filter path in the Quick Practice stack.

Also note the boundary conditions:

- unavailable rows have no slug, so a client-derived session-scoped retry set would still need an explicit omission policy
- review-fetch failure would leave no session-scoped slug list at all, while the pre-removal CTA still appeared anyway

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

There are **no open product questions** left in this debt. This is a UI-surface removal, not a Quick Practice redesign.

### Production change

File:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Remove:
- `showPracticeMissedQuestions` (`session-summary-view.tsx:29-30`)
- the outline CTA linking to `${ROUTES.APP_PRACTICE_QUICK}?status=incorrect` (`session-summary-view.tsx:121-126`)
- the `hasPrimaryFollowUp` dependency on `showPracticeMissedQuestions` (`session-summary-view.tsx:35-36`) so button weighting only depends on whether `Review your answers` exists

### Expected summary CTA set after removal

Exam summary:
- `Review your answers` when a reviewable slug exists
- `Back to Practice`
- `View in History`

Exam summary when review data is still loading, errors, or has no available slug:
- `Back to Practice`
- `View in History`

Tutor summary:
- unchanged

### Explicit non-goals

Do **not** change the Quick Practice `status=incorrect` route itself. That route still has a valid meaning for the Quick Practice segmented control; this debt was specifically about removing the misleading exam-summary shortcut into that global pool.

### Tests to update

Files:
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx:204-235,247-286`
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.browser.spec.tsx:61-65,92-133`
- `app/(app)/app/practice/[sessionId]/page.test.tsx:187-209`

Update assertions so exam summaries no longer expect:
- `Practice missed questions`
- `/app/practice/quick?status=incorrect`

Do **not** touch unrelated Quick Practice tests that assert the status-filter route contract itself, for example:

- `app/(app)/app/practice/quick/quick-practice-client.test.tsx`
- `app/(app)/app/practice/quick/quick-practice-client.browser.spec.tsx`

### Docs to update in the implementation PR

Files:
- `docs/practice-engine/interaction-contracts.md:260-265`
- `docs/practice-engine/question-rendering-architecture.md:83-89`
- `docs/practice-engine/question-rendering-architecture.md:527`
- `docs/_archive/brainstorming/bs-058-exam-post-submit-flow-reorder.md`
- `docs/debt/index.md`

Update the shipped exam-summary CTA set to remove `Practice missed questions`.

For `question-rendering-architecture.md`, also append a new changelog entry when the CTA is removed; do **not** rewrite the historical 2026-03-19 BS-058 entry that records the CTA being added.

---

## Edge Cases Audited

### Browser-audited CTA scenarios

These all still match the current guard in `session-summary-view.tsx:29-30`:

| Scenario | `correct` | `answered` | Guard (`correct < answered`) | CTA renders? |
|---------|-----------|------------|------------------------------|--------------|
| 1 wrong + 1 unanswered | 1 | 2 | `1 < 2` | Yes |
| Both correct | 2 | 2 | `2 < 2` | No |
| Both unanswered | 0 | 0 | `0 < 0` | No |

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

### No other production component depends on this CTA

Audit result:

- the only runtime render site is `SessionSummaryView`
- the current dependency surface outside production code is the three summary tests above plus documentation references
- there is no second production caller that would break if this CTA is removed

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

### 3. Related docs drift was resolved during this audit

The earlier post-BS-058 audit also found two adjacent doc-only issues:

- `interaction-contracts.md` still framed the exam contract as "Proposed"
- `bookmark-surface-policy.md` still said summary-launched review used `from=history`

Those documentation issues were corrected during the 2026-03-19 accuracy audit and no longer need to be treated as open adjacent debt for DEBT-324.

---

## Acceptance Criteria

- [ ] `Practice missed questions` CTA removed from exam `SessionSummaryView`
- [ ] Exam summary CTA set becomes: `Review your answers` + `Back to Practice` + `View in History`
- [ ] Tutor summary behavior remains unchanged
- [ ] Tests no longer expect the Quick Practice incorrect-pool link from exam summaries
- [ ] Interaction/docs updated to remove `Practice missed questions` from the shipped exam-summary contract
