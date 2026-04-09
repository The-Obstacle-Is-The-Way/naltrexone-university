# DEBT-350: Exam Results Continuity — Keep Summary Review Inside the Session Orchestrator

**Priority:** P2
**Created:** 2026-04-07
**Source:** [BS-061 Review Surface Divergence Audit](../brainstorming/bs-061-review-surface-divergence-audit.md)
**Related:** [BS-059](../brainstorming/bs-059-practice-session-action-bar-button-arrangement.md), [Pattern Registry — Review Surface Map](../frontend/pattern-registry.md), [practice-session-page-view.tsx](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx), [use-practice-session-review-stage.ts](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts)

---

## Problem Statement

After exam completion, the learner currently moves through two different review systems in one session:

1. `PostExamReviewView` inside `/app/practice/[sessionId]`
2. `QuestionView` inside `/app/questions/[slug]?from=summary...`

That route ejection changes the renderer, navigator family, bookmark placement, exit model, and page framing in the middle of the same exam-results flow. The user should stay inside the session orchestrator for:

- `PostExamReviewView`
- `SessionSummaryView`
- summary-triggered review re-entry

This is not a one-line CTA swap. The current stage model clears post-exam review state on summary entry, and `PracticeSessionPageView` short-circuits on `summary` before the post-exam review branch can render again.

## In Scope

- exam-mode results continuity inside `/app/practice/[sessionId]`
- explicit exam-results substages inside `usePracticeSessionReviewStage`
- in-session summary CTA re-entry to `PostExamReviewView`
- in-session summary breakdown-row re-entry to `PostExamReviewView`
- lazy hydration of completed-feedback review payload after refresh/direct revisit
- stable loading and error handling on the summary surface while re-entry payload hydrates

## Out of Scope

- standalone `question-page-client.tsx` review origins (`history`, `bookmarks`, `dashboard`, `practice`, residual `summary` route visits)
- standalone action-bar cleanup tracked separately in [BS-059](../brainstorming/bs-059-practice-session-action-bar-button-arrangement.md)
- merging `QuestionNavigator` with `ReviewQuestionNavigator`
- persisting the last reviewed question in the URL
- changing summary exit routes (`Back to Practice`, `View in History`)

## Current Code References

- [practice-session-page-view.tsx](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx)
- [use-practice-session-review-stage.ts](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts)
- [use-practice-session-review-stage-state.ts](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts)
- [use-practice-session-summary-review.ts](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-summary-review.ts)
- [session-summary-view.tsx](../../app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx)
- [session-breakdown-list.tsx](../../app/(app)/app/shared/components/session-breakdown-list.tsx)
- [post-exam-review-view.tsx](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

## Exact Decided Behavior

### 1. One debt, not two

This debt intentionally owns both:

- the orchestrator/state-model changes
- the summary CTA + breakdown-row rewiring

Do not split them into separate trackers. The session-summary re-entry UX is not independently shippable unless both halves land together.

### 2. Explicit exam-results substage

The session route must distinguish at least these exam-results substages:

- `post_exam_review`
- `session_summary`

Do not infer the rendered surface solely from whether `summary`, `postExamReview`, or `review` is null.

### 3. Persistent exam-results state

While the session route remains mounted, the orchestrator must preserve:

- finalized exam summary payload
- completed post-exam review payload
- post-exam review load state
- current reviewed question ID

`pendingExamSummary` is the wrong mental model once summary becomes re-enterable. The state is no longer disposable.

### 4. Review cursor resolution

Whenever post-exam review opens or reopens, resolve the current question in this order:

1. specifically requested `questionId` from a summary breakdown click
2. persisted `postExamReviewCurrentQuestionId`, when still present and available
3. first available review row
4. first review row only if no available rows exist

This applies to:

- initial entry after exam finalization
- summary CTA re-entry
- summary breakdown-row re-entry
- lazy rehydration after refresh/direct revisit

### 5. Session Summary primary CTA

`Review your answers` becomes an in-session `Button`, not a `Link`.

The current `firstReviewableSlug`-based route CTA in `SessionSummaryView` is a migration point and must be removed from the primary exam-flow contract.

CTA visibility is gated by whether completed-feedback review is:

- already present, or
- hydrable in-session

It is not gated by whether an available-row `slug` exists.

### 6. Session Summary breakdown rows

`SessionBreakdownList` gains an optional callback mode for session-summary usage.

- available rows open the exact clicked `questionId` in-session
- unavailable rows remain static
- summary callback mode must not fork a duplicate summary-only list component

### 7. Entry and exit behavior

**Initial exam completion**

- finalization loads completed-feedback review
- cursor resolves by the rules above
- results substage enters `post_exam_review`

**From `PostExamReviewView`**

- `View Summary` switches to `session_summary`
- `Finish review` on the last question switches to `session_summary`
- neither action clears the completed-feedback payload or current reviewed question ID

**From `SessionSummaryView`**

- `Review your answers` reopens post-exam review in-session
- breakdown rows do the same for a specific `questionId`
- `Back to Practice` and `View in History` remain route exits

### 8. Refresh/direct revisit behavior

After a hard refresh or direct revisit of `/app/practice/[sessionId]` for a completed exam:

- land on `SessionSummaryView`
- do not restore the last reviewed question from the URL
- hydrate completed-feedback review lazily only when the user re-enters review

Last-reviewed-question restoration is an in-memory convenience for the mounted session, not a durable URL contract.

### 9. Error and loading behavior

If the learner is on Session Summary and completed-feedback review must be hydrated on demand:

- keep the user on the summary surface while loading
- disable repeated review-entry actions during hydration
- surface re-entry failures on the summary surface with an explicit retry path
- never eject to `question-page-client.tsx` as a recovery strategy

## Implementation Notes

- `PracticeSessionPageView` currently short-circuits on `if (props.summary) return <SessionSummaryView ... />`; that branch order is a migration point and must no longer be the only arbiter of the rendered results surface.
- `usePracticeSessionReviewStage` currently clears `postExamReview`, `postExamReviewCurrentQuestionId`, and `postExamReviewLoadState` inside `onViewSummary()`. That reset behavior must be replaced with substage switching.
- `SessionSummaryView` currently derives its primary CTA from `firstReviewableSlug` and renders `Button asChild` with `Link`. That implementation must be replaced by callback-driven in-session re-entry.
- `SessionBreakdownList` already receives rows keyed by `questionId`; add callback support instead of cloning the component.
- Keep `PostExamReviewView` as the only exam-results review renderer. Do not add a summary-specific variant.

## Acceptance Criteria

- The primary exam-results flow never routes to `/app/questions/[slug]?from=summary...`.
- `PostExamReviewView` and `SessionSummaryView` are both reachable without losing the completed-feedback payload while the session route remains mounted.
- Summary CTA re-entry preserves the last reviewed question when it is still valid; otherwise it follows the cursor-resolution rules.
- Summary breakdown clicks reopen the exact clicked question in-session.
- Unavailable summary rows remain non-interactive.
- Refresh/direct revisit lands on Session Summary and still supports in-session review re-entry after lazy hydration.
- Summary CTA state and summary breakdown state remain usable when the first row is unavailable.
- `Back to Practice` and `View in History` remain route exits.

## Testing Requirements

- Add unit coverage for the results-substage state machine in `use-practice-session-review-stage.ts`.
- Add regression coverage for cursor resolution, especially the unavailable-first-row case.
- Add component coverage proving `PracticeSessionPageView` can render summary and post-exam review from the same preserved results payload without route ejection.
- Add component/browser coverage proving `SessionSummaryView` uses callback-driven re-entry, not a `Link`, for the primary CTA.
- Add component/browser coverage proving summary breakdown rows can open exact `questionId` targets in-session.

## Risks / Coupling

- `PracticeSessionPageView`, `usePracticeSessionReviewStage`, and `SessionSummaryView` currently encode the one-way summary handoff in different places. Partial implementation will leave the flow inconsistent.
- Summary breakdown uses `GetPracticeSessionReviewOutput`, while post-exam review uses `GetCompletedSessionQuestionsWithFeedbackOutput`. Re-entry must coordinate two related but different payloads.
- Direct revisit cannot preserve the last reviewed question without a URL contract; this debt explicitly accepts that limitation.

## Non-Goals

- Making standalone summary-origin review look like `PostExamReviewView`
- Rewriting `question-page-client.tsx`
- Collapsing the review surface map into a separate tracker
- Merging navigator families or route models
