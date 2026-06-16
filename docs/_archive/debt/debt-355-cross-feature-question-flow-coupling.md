# DEBT-355: Cross-Feature Question-Flow Coupling

**Priority:** P2
**Created:** 2026-04-08
**Status:** Resolved (PR #272, merged 2026-04-10)
**Source:** Follow-up from [DEBT-354](./debt-354-god-file-and-clean-code-audit.md)
**Related:** [question-page-logic.ts](../../app/(app)/app/questions/[slug]/question-page-logic.ts), [question-flow-actions.ts](../../app/(app)/app/practice/shared/question-flow-actions.ts), [practice-session-page-logic.ts](../../app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts)

### Resolution

Extracted `getActionResultErrorMessage`, `getThrownErrorMessage`, and `runTransitionedAsyncAction` from `practice/` to `app/(app)/app/shared/error-message-helpers.ts` and `app/(app)/app/shared/transitioned-async-action.ts`. Deleted `practice-logic.ts` entirely. Updated all 15 consumers. Zero cross-feature imports remain from `questions/` or `history/` into `practice/`.

---

## Problem Statement

The standalone question-review feature currently depends on practice-feature
internals for generic flow behavior:

- [`question-page-logic.ts`](../../app/(app)/app/questions/[slug]/question-page-logic.ts) imports error helpers from [`practice-logic.ts`](../../app/(app)/app/practice/practice-logic.ts)
- [`question-page-logic.ts`](../../app/(app)/app/questions/[slug]/question-page-logic.ts) imports `runTransitionedAsyncAction` from [`question-flow-actions.ts`](../../app/(app)/app/practice/shared/question-flow-actions.ts)
- [`question-flow-actions.ts`](../../app/(app)/app/practice/shared/question-flow-actions.ts) itself depends on `practice-logic.ts`

That makes the question feature depend on implementation details parked under
the practice feature path, even though the logic being reused is now feature-neutral.

## Why This Is Debt

This violates the codebase's intended "common closure" and stable-dependency
direction inside the app layer:

- shared flow helpers are physically owned by `practice/`
- question review is forced to import from a sibling feature instead of a neutral shared boundary
- future changes to generic load/submit/error behavior now look like practice-only edits even when they affect multiple surfaces

The coupling is currently one-way, which is better than a cycle, but it is
still the wrong ownership boundary.

## In Scope

- generic async load/submit helpers used by both practice and standalone question review
- generic action-result / thrown-error message helpers
- placement of feature-neutral helpers in the app layer

## Out of Scope

- domain/application layer refactors
- moving server actions or controllers
- changing route contracts or URL params
- rewriting the review/session UX tracked by [DEBT-350](./debt-350-exam-results-session-continuity.md)

## Desired End State

Feature-neutral question-flow utilities should live behind a neutral boundary,
for example under `app/(app)/app/shared/` or another feature-agnostic location.

The dependency direction should become:

- shared question-flow helpers may depend on `app/(app)/app/shared/**`
- practice may depend on shared helpers
- question review may depend on shared helpers
- question review should no longer import from `app/(app)/app/practice/**` for generic orchestration

## Implementation Notes

- `getActionResultErrorMessage(...)` and `getThrownErrorMessage(...)` are not practice-specific in current usage
- `runTransitionedAsyncAction(...)` is also no longer practice-specific
- extraction should avoid creating a vague "utils junk drawer"; the target boundary should still scream question-flow orchestration
- prefer moving the genuinely shared pieces, not wrapping them in pass-through re-export files

## Acceptance Criteria

- No production file under `app/(app)/app/questions/**` imports from `app/(app)/app/practice/**` for generic question-flow behavior
- Shared async flow helpers live under a feature-neutral path
- Practice and question-review features both consume the neutral shared helpers
- Tests move with the extracted helpers so behavior remains locked down

## Risks / Coupling

- A naive move can produce a new junk-drawer shared module with weak cohesion
- Moving only one helper without its sibling error/timeout helpers will leave the boundary half-fixed
- This should land before more logic accumulates in `question-page-logic.ts` and `use-question-page-controller.ts`
