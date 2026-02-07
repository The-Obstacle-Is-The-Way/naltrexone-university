# SPEC-014: Review + Bookmarks

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Implemented
**Slice:** SLICE-4 (Review + Bookmarks)
**Depends On:** SLICE-3 (Practice Sessions)
**Implements:** ADR-001, ADR-003, ADR-011

---

## Objective

Implement review workflows for subscribed users:

- “Missed questions” list (based on **most recent** attempt only)
- Bookmarks list + toggle
- Reattempt from either list using the existing question loop

**SSOT:** `docs/specs/master_spec.md` (SLICE-4).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - SLICE-4 (acceptance criteria + implementation checklist)
- Schema/index assumptions:
  - `db/schema.ts` indexes for attempts + bookmarks

---

## Acceptance Criteria

- Missed questions page shows questions whose most recent attempt is incorrect.
- Bookmark toggle persists; bookmarks page lists bookmarked questions.
- From missed/bookmarked list, I can reattempt a question (records a new attempt).

---

## Test Cases

- `tests/integration/actions.questions.integration.test.ts`: missed query logic.
- `tests/e2e/review.spec.ts` and `tests/e2e/bookmarks.spec.ts`.

---

## Implementation Checklist (Ordered)

1. Implement `getMissedQuestions(limit, offset)`.
2. Build `/app/review` with pagination.
3. Build `/app/bookmarks`.
4. Add reattempt flow: open question view from list and submit answer.

---

## Files to Create/Modify

- `src/application/use-cases/get-missed-questions.ts`, `get-bookmarks.ts`
- `src/adapters/repositories/drizzle-bookmark-repository.ts`
- `src/adapters/controllers/review-controller.ts`, `bookmark-controller.ts`
- `app/(app)/app/review/page.tsx`
- `app/(app)/app/bookmarks/page.tsx`
- `components/question/*`
- `lib/container.ts` (add review/bookmark factories)

---

## Non-Negotiable Requirements

- **Missed definition:** a question is “missed” if the most recent attempt for that question by the user is incorrect.
- **No client trust:** lists are computed server-side from persisted attempts/bookmarks.
- **Pagination:** lists must support pagination (limit/offset for MVP).

---

## Demo (Manual)

Once implemented:

1. Ensure you have an entitled user (complete SLICE-1) with at least a few attempts (SLICE-2/3).
2. Visit `/app/review` and verify missed list matches “most recent attempt incorrect”.
3. Toggle a bookmark from the question view; verify it appears in `/app/bookmarks`.
4. From either list, reattempt a question; verify a new attempt is recorded and list updates accordingly.

---

## Cross-Page Navigation (SPEC-019 Phase 3)

The core SLICE-4 functionality is complete. The following cross-page UX improvements are specified in [SPEC-019](./spec-019-practice-ux-redesign.md) Phase 3:

- **Origin-aware question-detail navigation:** The question detail page (`/app/questions/[slug]`) uses static back links ("Back to Dashboard" in header, "Back to Review" after submit) and does not adapt to actual entry point (Bookmarks vs Review vs Dashboard).
- **Cross-linking:** Review and Bookmarks pages should link to each other, not just to Practice.
- **Review empty state:** When no missed questions exist, show helpful messaging with CTA.
- **Review filtering:** Add tag/difficulty filter to the missed questions list.

---

## Definition of Done

- Behavior matches SLICE-4 in `docs/specs/master_spec.md`.
- Missed/bookmarked lists are correct and performant for MVP scale.
- Integration tests validate query correctness; E2E smoke covers navigation + reattempt.
