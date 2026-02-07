# DEBT-123: Session Summary Is Aggregate-Only (No Per-Question Breakdown)

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-06 (PR #64)
**Spec Mandate:** [SPEC-020](../specs/spec-020-practice-engine-completion.md) Phase 2

---

## SPEC-020 Reclassification

This debt item has been promoted from discretionary UX debt to a **spec-mandated requirement**. Master spec SLICE-3 acceptance criteria now includes: "Session summary shows per-question breakdown alongside aggregate totals." Implementation calls `getPracticeSessionReview` after `endPracticeSession` — the data already exists via the existing review use case. No new use case needed.

**Phase:** 2 (Core Navigation + Enriched Summary)
**Blocked by:** SPEC-020 Phase 1 (DEBT-115, DEBT-116 refactoring)
**Blocks:** SPEC-020 Phase 3

---

## Description

The final session summary screen shows only aggregate totals (`answered`, `correct`, `accuracy`, `durationSeconds`) with no per-question breakdown.

This affects:

- tutor mode end screen
- exam mode post-submit end screen

---

## Impact

- Users cannot review which specific questions were right/wrong/skipped from the final summary view.
- Session reflection is less useful for learning and remediation.
- The app already has session review data (`GetPracticeSessionReviewUseCase`), but that detail is not carried into final summary UX.

---

## SSOT Alignment

Master spec SLICE-3 acceptance criteria now includes: "Session summary shows per-question breakdown alongside aggregate totals. (SPEC-020 Phase 2)". This was added as part of the SPEC-020 master spec amendment.

Previously, only score and total duration were required. The spec gap has been closed.

---

## Resolution

### Option A: Enriched Summary View (Recommended)

Render summary totals plus an optional per-question breakdown list sourced from `getPracticeSessionReview`.

### Option B: Dedicated Results Route

Redirect to a `results` page after finalization that loads both summary metrics and full per-question detail.

---

## Verification

- [ ] Tutor-mode end summary includes per-question outcomes
- [ ] Exam-mode post-submit summary includes per-question outcomes
- [ ] Aggregate metrics remain unchanged and correct
- [ ] Existing tests pass with added summary-detail coverage

---

## Related

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 2
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- `src/application/use-cases/end-practice-session.ts`
- `src/application/use-cases/get-practice-session-review.ts`
- `docs/specs/master_spec.md`
- [BUG-073](../bugs/bug-073-tutor-mode-missing-session-summary-detail.md)
