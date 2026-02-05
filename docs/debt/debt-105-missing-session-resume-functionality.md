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

1. Add `getIncompleteSession()` use case to check for unfinished sessions
2. Add UI on `/app/practice` to show "Resume session" button
3. Navigate to `/app/practice/[sessionId]` with correct question index
4. Consider adding session list page showing all past/active sessions

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
