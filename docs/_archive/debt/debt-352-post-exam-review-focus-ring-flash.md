# DEBT-352: Post-Exam Review Focus-Ring Flash — Remove Forced Visible Ring Without Losing Focus Management

**Priority:** P3
**Created:** 2026-04-07
**Status:** Resolved (PR #274)
**Source:** [BS-061 Review Surface Divergence Audit](../../brainstorming/bs-061-review-surface-divergence-audit.md)
**Related:** [DEBT-326](./debt-326-post-exam-review-focus-management.md), [post-exam-review-view.tsx](../../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

## Resolution

Removed `{ focusVisible: true }` from the programmatic `focus()` call in `PostExamReviewView`, so the browser applies `:focus-visible` only when its own heuristics determine it's appropriate (keyboard/screen-reader input). All focus management infrastructure preserved: `useEffect` + `panelRef`, `tabIndex={-1}`, `focus-visible:ring-*` classes, `aria-label`. Added unit test for `tabIndex={-1}`. Browser spec confirming focus transfer passes unchanged. One line of production code changed.

---

## Problem Statement

`PostExamReviewView` currently calls `panelRef.current?.focus({ focusVisible: true })` whenever the reviewed question changes. Combined with the panel’s `focus-visible:ring-*` classes, that forces a visible ring/box on load and on review navigation. The user noticed this as a transient “barrier” or box flash.

The underlying focus handoff is correct. The forced visible-ring behavior is not.

## In Scope

- `PostExamReviewView` programmatic focus behavior
- visual flash caused by forced `focusVisible: true`
- preservation of keyboard/screen-reader focus management

## Out of Scope

- removing panel focus altogether
- redesigning the review panel ring style
- changing focus behavior on unrelated practice surfaces

## Current Code References

- [post-exam-review-view.tsx](../../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)
- [post-exam-review-view.test.tsx](../../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx)
- [post-exam-review-view.browser.spec.tsx](../../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.browser.spec.tsx)

## Exact Decided Behavior

- Keep programmatic focus on the reviewed-question panel when the current reviewed question changes.
- Remove the explicit `{ focusVisible: true }` option.
- Keep `tabIndex={-1}` on the panel.
- Keep the existing `focus-visible:*` classes so keyboard/screen-reader users still get a perceivable target when modality warrants it.

This debt removes the forced visible ring. It does not remove focus transfer.

## Implementation Notes

- This is a refinement of [DEBT-326](./debt-326-post-exam-review-focus-management.md), not a reversal of it.
- Pointer users should no longer see the forced ring on mount or question changes.
- Keyboard users must still be able to perceive where focus lands.

## Acceptance Criteria

- `PostExamReviewView` still transfers focus to the reviewed-question panel when the reviewed question changes.
- The implementation no longer calls `focus({ focusVisible: true })`.
- Pointer-driven page entry and post-exam navigation no longer force a visible ring/box flash.
- Keyboard/screen-reader focus affordance remains intact.

## Testing Requirements

- Add unit coverage that the focus call no longer passes `focusVisible: true`.
- Preserve or extend browser coverage proving focus still moves to the reviewed-question panel.
- Verify the panel keeps its focus target semantics (`tabIndex={-1}`, focus-visible ring classes).

## Risks / Coupling

- Removing focus entirely would regress the accessibility work shipped in DEBT-326.
- Visual-flash fixes are easy to “solve” by deleting the wrong thing. The focus target and focus transfer are part of the contract and must remain.

## Non-Goals

- Replacing the panel with a different focus target
- Moving focus into the navigator instead of the panel
- Changing bookmark, navigator, or summary behavior
