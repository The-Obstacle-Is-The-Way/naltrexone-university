# DEBT-351: Review & Submit Affordance Cleanup — Whole-Card Rows, No Default “Not Marked” Noise

**Priority:** P3
**Created:** 2026-04-07
**Source:** [BS-061 Review Surface Divergence Audit](../brainstorming/bs-061-review-surface-divergence-audit.md)
**Related:** [exam-review-view.tsx](../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx), [Pattern Registry — Review Surface Map](../frontend/pattern-registry.md)

---

## Problem Statement

`ExamReviewView` currently renders a static card plus a nested `Open question` button. That wastes horizontal space, fragments the hit target, and makes the row feel heavier than the action warrants. The same surface also emits `Not marked` on every unmarked row, which turns the default state into noise.

This debt cleans up the exam-mode `Review & Submit` surface before final submission.

## In Scope

- `ExamReviewView` row interaction model
- available-row click target semantics
- unavailable-row non-interactive treatment
- metadata-line cleanup for the unmarked default state

## Out of Scope

- `PostExamReviewView`
- `SessionSummaryView`
- `question-page-client.tsx`
- bookmark icon-toggle exploration tracked separately in [BS-052](../brainstorming/bs-052-bookmark-icon-toggle-replacement.md)

## Current Code References

- [exam-review-view.tsx](../../app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx)

## Exact Decided Behavior

### 1. One interactive target per available row

Each available review row becomes exactly one semantic `button` target for the whole card.

- no nested `Open question` button
- no pointer-only `div` click hack
- the full visible row opens the question through the existing `onOpenQuestion(questionId)` callback

### 2. Keyboard and focus semantics are mandatory

The whole-card target must be:

- keyboard focusable
- activatable with Enter and Space
- visibly focused using the repo-standard focus treatment

If `Card` cannot render as a button directly, compose button semantics around the card chrome. Do not nest buttons.

### 3. Unavailable rows stay static

Rows for unavailable questions remain non-interactive and do not pretend to be clickable.

### 4. Metadata line renders only positive states

Keep:

- `Answered` or `Unanswered`
- `Marked for review` only when true
- `Correct` or `Incorrect` when answer correctness is available

Remove:

- `Not marked`

Separator bullets must collapse cleanly when the marked state is absent.

## Implementation Notes

- The current implementation places the interaction on a trailing `Button` only. The outer `Card` stays static. That division is the problem.
- The row copy already contains enough information to support a whole-card target; the CTA text is redundant.
- Keep the current stem preview and status wording. This debt changes affordance and noise level, not the content model.

## Acceptance Criteria

- Every available row in `ExamReviewView` is opened by one whole-row interactive target.
- No row contains a nested `Open question` button.
- Unavailable rows remain static and non-focusable.
- `Not marked` never appears.
- Marked rows still explicitly show `Marked for review`.
- Separator bullets render correctly whether the row is marked or unmarked.

## Testing Requirements

- Add render-output coverage for the metadata line so the default unmarked state stays silent.
- Add browser coverage proving the whole-card target is keyboard-focusable and Enter/Space activate `onOpenQuestion`.
- Add regression coverage proving unavailable rows do not expose the row as an interactive target.

## Risks / Coupling

- Replacing the nested CTA with a whole-card target changes semantics, focus behavior, and spacing at the same time. Coverage needs to lock all three.
- If implementation uses a styled `div` plus `onClick`, accessibility regresses immediately. The semantic control choice is part of the debt, not an implementation detail to hand-wave away.

## Non-Goals

- Reordering the summary or history breakdown rows
- Changing the submit confirmation dialog
- Changing the meaning of `Marked`
