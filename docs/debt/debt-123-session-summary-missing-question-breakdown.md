# DEBT-123: Session Summary Is Aggregate-Only (No Per-Question Breakdown)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

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

Current SSOT requires score and total duration after final submit and does not require per-question detail on the final summary screen.

This is therefore product/UX debt, not a correctness bug.

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

- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- `src/application/use-cases/end-practice-session.ts`
- `src/application/use-cases/get-practice-session-review.ts`
- `docs/specs/master_spec.md`
- [BUG-073](../bugs/bug-073-tutor-mode-missing-session-summary-detail.md)
