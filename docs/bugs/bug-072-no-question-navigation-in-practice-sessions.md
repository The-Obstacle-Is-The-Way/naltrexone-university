# BUG-072: No Question Navigation in Practice Sessions (Both Modes)

**Status:** Won't Fix
**Priority:** P1
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Reclassification Decision

This was reclassified from a bug to technical debt.

Reason: `master_spec.md` does not require tutor-mode in-run navigation, and only requires jump-to-question during the **exam review stage** (already implemented).

- SSOT reference: `docs/specs/master_spec.md` acceptance criteria for SLICE-3
- Implemented behavior: `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`

Tracked as debt: [DEBT-122](../debt/debt-122-in-run-question-navigation-gap.md)

---

## Historical Context

Users currently cannot navigate backward or jump between questions during the active answering stage. Navigation to specific questions is available in exam mode review.

This is a UX/product enhancement gap, not a correctness violation of current SSOT.

---

## Related

- `docs/specs/master_spec.md`
- `docs/specs/spec-013-practice-sessions.md`
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- [DEBT-122](../debt/debt-122-in-run-question-navigation-gap.md)
