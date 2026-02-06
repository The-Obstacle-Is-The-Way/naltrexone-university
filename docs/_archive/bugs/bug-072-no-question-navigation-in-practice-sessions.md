# BUG-072: No Question Navigation in Practice Sessions (Both Modes)

**Status:** Resolved (via SPEC-020 / DEBT-122)
**Priority:** P1
**Date:** 2026-02-06
**Reclassified:** 2026-02-06
**Resolved:** 2026-02-06 (PR #63)

---

## Reclassification Decision

**Original (2026-02-06):** Reclassified from bug to tech debt (DEBT-122) — master_spec.md did not require in-run navigation at the time.

**Updated (2026-02-06):** Promoted from Won't Fix to **Spec-Mandated**. Master spec SLICE-3 acceptance criteria now includes: "Users can navigate to any question during active answering (back/jump), not only forward. (SPEC-020 Phase 2)". The spec was incomplete, not the implementation.

- SSOT reference: `docs/specs/master_spec.md` SLICE-3 acceptance criteria (amended)
- Spec: [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 2
- Debt tracking: [DEBT-122](../debt/debt-122-in-run-question-navigation-gap.md)

---

## Historical Context

Users currently cannot navigate backward or jump between questions during the active answering stage. Navigation to specific questions is available in exam mode review.

Originally this was a UX/product enhancement gap, not a correctness violation of SSOT. After the SPEC-020 amendments, it is now an explicit SSOT requirement and is tracked as implementation debt in DEBT-122.

---

## Related

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 2
- `docs/specs/master_spec.md`
- `docs/specs/spec-013-practice-sessions.md`
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- [DEBT-122](../debt/debt-122-in-run-question-navigation-gap.md)
