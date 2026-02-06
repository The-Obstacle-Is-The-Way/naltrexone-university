# BUG-073: Tutor Mode Missing Per-Question Session Summary at End

**Status:** Won't Fix
**Priority:** P1
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Reclassification Decision

This was reclassified from a bug to technical debt.

Reason: current SSOT requires session summary totals and exam review-stage behavior, but does not require a per-question breakdown on the final summary screen for tutor or exam mode.

- SSOT reference: `docs/specs/master_spec.md` SLICE-3 acceptance criteria
- Implemented behavior: `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`

Tracked as debt: [DEBT-123](../debt/debt-123-session-summary-missing-question-breakdown.md)

---

## Historical Context

The final summary view currently shows aggregate totals only (`answered`, `correct`, `accuracy`, `durationSeconds`).

This is a product/UX enhancement request, not a correctness defect against current spec requirements.

---

## Related

- `docs/specs/master_spec.md`
- `docs/specs/spec-013-practice-sessions.md`
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- [DEBT-123](../debt/debt-123-session-summary-missing-question-breakdown.md)
