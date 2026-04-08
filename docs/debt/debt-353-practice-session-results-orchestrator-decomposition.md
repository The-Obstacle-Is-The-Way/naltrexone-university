# DEBT-353: Practice Session Results Orchestrator Decomposition — Split DEBT-350 Continuity Logic Into Focused Hook/View Units

**Priority:** P3
**Created:** 2026-04-08
**Source:** DEBT-350 implementation review
**Related:** [DEBT-350](./debt-350-exam-results-session-continuity.md), [use-practice-session-review-stage.ts](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts), [practice-session-page-view.tsx](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx), [FE-002](../_archive/debt/fe-002-usepracticesessionreviewstage-exceeds-150-line-guideline.md)

---

## Problem Statement

[DEBT-350](./debt-350-exam-results-session-continuity.md) shipped the correct user-facing behavior: exam results now stay inside the session orchestrator, summary re-entry is callback-driven, and completed-feedback state survives summary transitions. The implementation is functionally correct, but it concentrated even more coordination logic into two already-large surfaces:

- [`use-practice-session-review-stage.ts`](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts) now owns generic review-stage orchestration, exam-results substage transitions, lazy post-exam hydration, cursor resolution, retry state, and summary promotion in one 500+ line hook.
- [`practice-session-page-view.tsx`](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx) now decides among practice, exam review, post-exam review, tutor summary, and exam summary branches in one procedural render tree.

That concentration does not make DEBT-350 incorrect, but it does make the continuity contract harder to reason about, harder to unit test in isolation, and easier to regress the next time this flow changes.

## In Scope

- decomposing exam-results continuity orchestration into a focused unit below the existing page-controller layer
- reducing branch-selection complexity in `practice-session-page-view.tsx`
- expanding pure/unit-level coverage for post-exam cursor resolution and exam-results transition helpers
- preserving the shipped DEBT-350 behavior and route contract exactly

## Out of Scope

- changing the DEBT-350 UX contract
- rewriting `question-page-client.tsx`
- merging navigator families
- changing tutor-mode summary behavior
- introducing URL-persisted reviewed-question state

## Current Code References

- [use-practice-session-review-stage.ts](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts)
- [use-practice-session-review-stage-state.ts](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts)
- [practice-session-page-view.tsx](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx)
- [use-practice-session-review-stage.test.tsx](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.test.tsx)
- [use-practice-session-review-stage.browser.spec.tsx](../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.browser.spec.tsx)

## Exact Decided Behavior

### 1. Keep the DEBT-350 contract; change structure, not behavior

Any decomposition must preserve the already-shipped behavior:

- `PostExamReviewView ↔ SessionSummaryView` stays inside `/app/practice/[sessionId]`
- `examResultsSubstage` remains the explicit source of truth for exam results routing
- summary re-entry continues to preserve or resolve the current reviewed question by the DEBT-350 cursor rules
- lazy hydration and retry behavior stay on the summary surface

### 2. Separate exam-results continuity from generic review-stage concerns

`usePracticeSessionReviewStage` should return to being a composition hub, not the sole home for every review/result concern. The exam-results continuity logic added by DEBT-350 should be isolated into a focused helper or sub-hook with a single responsibility:

- exam-results substage state
- post-exam review hydration/retry
- reviewed-question cursor resolution
- summary ↔ post-exam-review transitions

Generic review-stage behavior that already lives in `usePracticeSessionReviewStageState` should stay separate.

### 3. Reduce the page-view branch tree to explicit render intent

`PracticeSessionPageView` should not keep accumulating orchestration policy inline. The render selection for:

- tutor summary
- exam summary
- post-exam review
- review-stage loading/error
- practice question flow

should be made more explicit through local composition or a focused resolver so the component reads as view composition instead of a long procedural gate chain.

### 4. Add pure/unit seams where the contract is already deterministic

The cursor-resolution and substage-transition logic should be unit-testable without depending only on browser-mode hook orchestration. Browser specs remain necessary for async behavior, but the deterministic transition rules should also have stable pure/unit coverage.

## Acceptance Criteria

- `usePracticeSessionReviewStage` delegates exam-results continuity work to a focused unit instead of owning the full implementation inline.
- `PracticeSessionPageView` expresses results-surface branch selection with lower inline branching complexity than the current single-component tree.
- Existing DEBT-350 behavior and tests remain green.
- Pure/unit coverage exists for deterministic cursor/transition helpers, with browser specs retaining async integration coverage.

## Testing Requirements

- Preserve the current DEBT-350 browser coverage.
- Add or keep pure/unit coverage for deterministic exam-results helper logic.
- Add regression coverage for any newly extracted render resolver or exam-results sub-hook.

## Risks / Coupling

- This refactor touches the same seams that DEBT-350 hardened. Behavioral drift is the main risk.
- Over-abstracting the render tree or hook split would be as bad as leaving everything inline. The decomposition should follow existing review/result boundaries, not invent a mini-framework.
- This should land in a dedicated follow-up PR so the structural change can be reviewed independently from the continuity behavior.

## Non-Goals

- Re-litigating DEBT-350 product decisions
- Renaming `pendingExamSummary` just for taste
- Converting the session route into a reducer architecture unless the extracted seams prove that necessary
