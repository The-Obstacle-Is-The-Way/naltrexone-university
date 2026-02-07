# BUG-073: Tutor Mode Missing Per-Question Session Summary at End

**Status:** Resolved (via SPEC-020 / DEBT-123)
**Priority:** P1
**Date:** 2026-02-06
**Reclassified:** 2026-02-06
**Resolved:** 2026-02-06 (PR #64)

---

## Reclassification Decision

**Original (2026-02-06):** Reclassified from bug to tech debt (DEBT-123) — master_spec.md did not require per-question breakdown on the summary screen at the time.

**Updated (2026-02-06):** Promoted from Won't Fix to **Spec-Mandated**. Master spec SLICE-3 acceptance criteria now includes: "Session summary shows per-question breakdown alongside aggregate totals. (SPEC-020 Phase 2)". The spec was incomplete, not the implementation.

- SSOT reference: `docs/specs/master_spec.md` SLICE-3 acceptance criteria (amended)
- Spec: [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 2
- Debt tracking: [DEBT-123](../debt/debt-123-session-summary-missing-question-breakdown.md)

---

## Historical Context

The final summary view currently shows aggregate totals only (`answered`, `correct`, `accuracy`, `durationSeconds`).

Originally this was a product/UX enhancement request, not a correctness defect against SSOT. After the SPEC-020 amendments, it is now an explicit SSOT requirement and is tracked as implementation debt in DEBT-123.

---

## Related

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 2
- `docs/specs/master_spec.md`
- `docs/specs/spec-013-practice-sessions.md`
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- [DEBT-123](../debt/debt-123-session-summary-missing-question-breakdown.md)
