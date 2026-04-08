# DEBT-356: Duplicate Question-Surface Renderers

**Priority:** P3
**Created:** 2026-04-08
**Source:** Follow-up from [DEBT-354](./debt-354-god-file-and-clean-code-audit.md)
**Related:** [question-page-client.tsx](../../app/(app)/app/questions/[slug]/question-page-client.tsx), [practice-view.tsx](../../app/(app)/app/practice/components/practice-view.tsx), [practice-session-page-view.tsx](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx), [BS-058](../_archive/brainstorming/bs-058-exam-post-submit-flow-reorder.md)

---

## Problem Statement

The repo now maintains two large, partially overlapping question-surface
renderers:

1. `QuestionView` inside [`question-page-client.tsx`](../../app/(app)/app/questions/[slug]/question-page-client.tsx)
2. `PracticeView` inside [`practice-view.tsx`](../../app/(app)/app/practice/components/practice-view.tsx)

Both compose the same core presentation pieces:

- heading / description framing
- loading and error cards
- `QuestionCard`
- `Feedback`
- bottom action bars
- back-navigation affordances

This was previously called out as a duplication risk in archived brainstorming.
Since then, both files have grown substantially and the duplication is no longer
just hypothetical maintenance risk.

## Evidence

Current overlapping regions include:

- loading/retry cards in both files
- near-identical `QuestionCard` composition
- near-identical `Feedback` composition
- action-bar branches that differ mainly by navigation/origin details

The result is that changes to question rendering behavior now require comparing
two large files before anyone can be confident they updated all relevant
surfaces.

## Why This Is Debt

This is a DRY and change-amplification problem:

- bookmark behavior diverges by surface
- back-link behavior diverges by surface
- loading/error copy can drift
- feedback visibility logic must be reasoned about in multiple places
- visual polish work on question cards tends to spread across two orchestration-heavy files

The cost is no longer just line count. It is duplicated product reasoning.

## In Scope

- shared question-body rendering
- shared feedback rendering composition
- shared loading / empty / retry surface primitives where appropriate
- reducing duplicated render branches between standalone review and in-session practice

## Out of Scope

- merging every review surface into one mega-component
- collapsing `ExamReviewView`, `PostExamReviewView`, and `SessionSummaryView` into a single abstraction
- changing route/origin semantics

## Desired End State

The code should have a smaller shared question-surface layer plus thinner
context-specific wrappers.

Examples of acceptable decomposition:

- shared `QuestionSurfaceBody` or equivalent for `QuestionCard` + `Feedback`
- shared loading/error primitives for the question surface
- context-specific action-bar components that remain separate
- route/origin-specific wrappers that stay thin

## Implementation Notes

- Do not solve this by creating one giant prop bag shared by every surface
- Keep context-specific action semantics separate; the duplication problem is mainly the repeated body/render shell
- `PracticeSessionPageView` should continue deciding which high-level surface is active; this debt is about duplicated render composition inside the active surface

## Acceptance Criteria

- The shared question body/feedback composition exists in one place
- `QuestionView` and `PracticeView` become materially smaller and thinner
- A future question-surface styling/content change can land by editing one shared rendering path instead of two large components
- Existing route- and session-specific action-bar behavior remains intact

## Risks / Coupling

- Over-abstracting the action bars will create a harder-to-read prop matrix
- Under-abstracting will keep the current duplication while merely moving code around
- This work should be done with strong render-output coverage because both surfaces are user-visible and easy to regress
