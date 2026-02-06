# DEBT-122: In-Run Question Navigation Gap (Tutor + Exam Answering Stage)

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

During active question answering, users can only move forward (`Next question`). They cannot navigate backward or jump to arbitrary questions until exam review.

This is not a current SSOT correctness bug, but it is a meaningful UX/pedagogy gap for session-based study.

---

## Impact

- Users cannot quickly revisit earlier questions while still in the answering stage.
- Tutor sessions have no intermediate cross-question navigation model.
- Session state (`questionStates`) contains enough information to support richer navigation, but the UI does not expose it during the run.

---

## SSOT Alignment

`master_spec.md` currently requires jump-to-question in **exam review stage**, which is implemented. It does not require in-run jump/back navigation.

This item is therefore tracked as debt, not a bug.

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

- `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- `src/application/use-cases/get-next-question.ts`
- `src/domain/entities/practice-session.ts`
- `docs/specs/master_spec.md`
- [BUG-072](../bugs/bug-072-no-question-navigation-in-practice-sessions.md)
