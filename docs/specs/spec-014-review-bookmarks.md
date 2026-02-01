# SPEC-014: Review + Bookmarks

**Status:** Ready
**Slice:** SLICE-4 (Review + Bookmarks)
**Depends On:** SLICE-3 (Practice Sessions)
**Implements:** ADR-001, ADR-003, ADR-011

---

## Objective

Implement review workflows for subscribed users:

- “Missed questions” list (based on **most recent** attempt only)
- Bookmarks list + toggle
- Reattempt from either list using the existing question loop

This spec is intentionally **DRY**: the **exact** behavior and file list live in `docs/specs/master_spec.md` (SLICE-4).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - SLICE-4 (acceptance criteria + implementation checklist)
- Schema/index assumptions:
  - `db/schema.ts` indexes for attempts + bookmarks

---

## Non-Negotiable Requirements

- **Missed definition:** a question is “missed” if the most recent attempt for that question by the user is incorrect.
- **No client trust:** lists are computed server-side from persisted attempts/bookmarks.
- **Pagination:** lists must support pagination (limit/offset for MVP).

---

## Definition of Done

- Behavior matches SLICE-4 in `docs/specs/master_spec.md`.
- Missed/bookmarked lists are correct and performant for MVP scale.
- Integration tests validate query correctness; E2E smoke covers navigation + reattempt.
