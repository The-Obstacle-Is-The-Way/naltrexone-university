# DEBT-327: Interaction Contracts Doc — Mixed Current/Proposed Status Cleanup

**Priority:** P4
**Created:** 2026-03-19
**Source:** BS-058 post-implementation audit
**Related:** [interaction-contracts.md](../practice-engine/interaction-contracts.md)

---

## The Problem

`docs/practice-engine/interaction-contracts.md` was written during BS-055 as a proposed target. After DEBT-321, DEBT-322, and BS-058, most sections now describe shipped behavior, but:

- The document header still says "Proposed — documents the target state from BS-055 decisions"
- Section 3 (Exam Mode) has "Current vs Proposed" tables that are now stale — the "Proposed" column is the current implementation
- Section 5 (Post-Session Flows) was updated for BS-058 but the surrounding sections weren't reconciled

## Proposed Fix

- Update header status to "Implemented" or "Current"
- Remove or collapse "Current vs Proposed" tables into single "Current" descriptions
- Verify each section against shipped code and remove any remaining proposed-future language
- Docs-only change, no production code

## Acceptance Criteria

- [ ] Header status reflects "Implemented" or "Current"
- [ ] No "Current vs Proposed" tables remain
- [ ] Every section accurately describes shipped behavior
