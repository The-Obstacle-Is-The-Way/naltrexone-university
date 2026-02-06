# DEBT-122: In-Run Question Navigation Gap (Tutor + Exam Answering Stage)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06
**Spec Mandate:** [SPEC-020](../specs/spec-020-practice-engine-completion.md) Phase 2

---

## SPEC-020 Reclassification

This debt item has been promoted from discretionary UX debt to a **spec-mandated requirement**. Master spec SLICE-3 acceptance criteria now includes: "Users can navigate to any question during active answering (back/jump), not only forward." The backend already supports `questionId` param in `getNextQuestion` (master_spec 4.5.3 Case A step 3) — only UI work is needed.

**Phase:** 2 (Core Navigation + Enriched Summary)
**Blocked by:** SPEC-020 Phase 1 (DEBT-115, DEBT-116 refactoring)
**Blocks:** SPEC-020 Phase 3

---

## Description

During active question answering, users can only move forward (`Next question`). They cannot navigate backward or jump to arbitrary questions until exam review.

This was originally treated as UX/pedagogy debt. With SPEC-020 amendments, it is now an explicit SSOT requirement that remains unimplemented.

---

## Impact

- Users cannot quickly revisit earlier questions while still in the answering stage.
- Tutor sessions have no intermediate cross-question navigation model.
- Session state (`questionStates`) contains enough information to support richer navigation, but the UI does not expose it during the run.

---

## SSOT Alignment

`master_spec.md` SLICE-3 acceptance criteria now includes in-run navigation: "Users can navigate to any question during active answering (back/jump), not only forward. (SPEC-020 Phase 2)". This was added as part of the SPEC-020 master spec amendment.

Previously, only exam review stage jump-to-question was required. The spec gap has been closed.

---

## Resolution

### Option A: Session Navigator (Recommended)

Add an in-run navigator showing all question numbers with status markers:

- unanswered
- answered
- marked (exam mode)

Clicking a number calls `getNextQuestion({ sessionId, questionId })`.

### Option B: Minimal Prev/Next

Add `Previous` and `Next` buttons with deterministic question index traversal.

---

## Verification

- [ ] Users can navigate backward during active session flow
- [ ] Users can jump to specific questions during active session flow
- [ ] Session progress and persisted question state remain correct
- [ ] Exam review flow continues to behave correctly
- [ ] Existing tests pass with added navigation coverage

---

## Related

- [SPEC-020: Practice Engine Completion](../specs/spec-020-practice-engine-completion.md) — Phase 2
- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- `src/application/use-cases/get-next-question.ts`
- `src/domain/entities/practice-session.ts`
- `docs/specs/master_spec.md`
- [BUG-072](../bugs/bug-072-no-question-navigation-in-practice-sessions.md)
