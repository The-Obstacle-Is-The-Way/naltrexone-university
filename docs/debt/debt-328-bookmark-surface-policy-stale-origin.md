# DEBT-328: Bookmark Surface Policy — Stale Summary-Review Origin Wording

**Priority:** P4
**Created:** 2026-03-19
**Source:** BS-058 post-implementation audit
**Related:** [bookmark-surface-policy.md](../frontend/bookmark-surface-policy.md)

---

## The Problem

`docs/frontend/bookmark-surface-policy.md` still references `from=history` as the origin for summary-launched question review. Production now uses `from=summary` (fixed in an earlier PR). The doc hasn't been updated to match.

## Proposed Fix

Update the origin reference from `from=history` to `from=summary` for summary-launched review paths. Docs-only change.

## Acceptance Criteria

- [ ] All `from=history` references in summary-review context updated to `from=summary`
