# DEBT-106: Exam Mode Missing "Mark for Review" Feature

**Status:** Open
**Priority:** P2
**Date:** 2026-02-05

---

## Description

In real board exams (USMLE, ABPN, etc.), test-takers can "mark" questions they're unsure about to review later before submitting. This feature is missing from our exam mode.

**Current Behavior:**
- User answers a question
- User moves to next question
- No way to flag uncertain answers for later review

**Expected Behavior (like UWorld/Kaplan/real exams):**
- "Mark for Review" button on each question
- Marked questions flagged in progress indicator
- At end of exam (before submitting):
  - List of all questions
  - Shows which are answered, unanswered, marked
  - Can jump to any question to review/change answer
- Final submit only after review screen

---

## Impact

- Users can't use effective test-taking strategies
- Competitive disadvantage vs UWorld/Kaplan
- Doesn't simulate real exam conditions

---

## Resolution

### Data Model

Add `marked_for_review` boolean to attempts table (or session_questions junction):

```sql
ALTER TABLE attempts ADD COLUMN marked_for_review BOOLEAN DEFAULT FALSE;
```

Or create new table for exam mode question state:

```sql
CREATE TABLE session_question_states (
  session_id UUID REFERENCES practice_sessions(id),
  question_id UUID REFERENCES questions(id),
  marked_for_review BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (session_id, question_id)
);
```

### Backend

1. Add `markQuestionForReview(sessionId, questionId)` action
2. Add `getSessionReviewState(sessionId)` to get all question states
3. Modify session summary to include marked questions

### Frontend (Exam Mode Only)

1. Add "Mark for Review" toggle button (star/flag icon)
2. Progress bar shows marked questions (different color)
3. Before final submit, show review screen:
   - All questions listed
   - Status: Answered / Unanswered / Marked
   - Click to jump to any question
4. "Submit Exam" button only on review screen

---

## Verification

- [ ] Can mark/unmark questions in exam mode
- [ ] Progress indicator shows marked questions
- [ ] Review screen shows all questions before submit
- [ ] Can navigate to any question from review screen
- [ ] Final results show which questions were marked
- [ ] Tutor mode unchanged (no mark feature needed)

---

## Related

- BUG-065: Exam Mode Shows Feedback When It Shouldn't
- DEBT-105: Missing Session Resume Functionality
- SPEC-019: Practice UX Redesign
