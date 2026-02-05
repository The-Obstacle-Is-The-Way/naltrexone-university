# DEBT-105: Missing Session Resume Functionality

**Status:** Open
**Priority:** P2
**Date:** 2026-02-05

---

## Description

Users cannot resume an interrupted practice session. If a user starts a 20-question session, answers 5 questions, and leaves (closes browser, navigates away, etc.), they cannot continue where they left off.

**Current Behavior:**
- Sessions are created and tracked in database
- Progress is saved (questions answered, results stored)
- But no UI to resume an incomplete session

**Expected Behavior:**
- Dashboard or Practice page shows "Continue session" if incomplete session exists
- Clicking resume returns to the session at the next unanswered question
- Optionally: auto-prompt when returning to practice page

---

## Impact

- Poor user experience for longer study sessions
- Users may lose progress unexpectedly
- Competitive disadvantage vs UWorld/Kaplan which have robust session management

---

## Resolution

### Backend

1. Add `GetIncompleteSessionsUseCase` to fetch user's incomplete sessions
   - Query: `practice_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY created_at DESC`
   - Return session with progress info (answered count / total count)

2. Add controller action `getIncompleteSessions()` in `practice-controller.ts`

### Frontend

3. On `/app/practice` page load, check for incomplete sessions
4. If found, show "Resume Session" card:
   - Session mode (Tutor/Exam)
   - Progress (e.g., "5/20 questions answered")
   - "Resume" button → navigates to `/app/practice/[sessionId]`
   - "Abandon" button → ends session without completing

5. Consider: Session history page showing all past sessions with scores

---

## Verification

- [ ] Incomplete session detection works
- [ ] Resume button appears when session exists
- [ ] Resuming loads correct question
- [ ] Session summary works after resuming and completing

---

## Related

- SPEC-019: Practice UX Redesign
- SPEC-013: Practice Sessions
