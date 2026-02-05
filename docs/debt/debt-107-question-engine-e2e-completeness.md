# DEBT-107: Question Engine E2E Completeness and State Management

**Status:** Open
**Priority:** P1
**Date:** 2026-02-05

---

## Description

The question engine is the **core business logic** of Addiction Boards. It manages:
- Question selection (which questions to serve)
- Attempt tracking (recording user answers)
- Progress state (what's done vs remaining)
- Review system (missed questions for reattempt)
- Session management (tutor/exam mode flows)

While individual components work, there is no **end-to-end verification** that the complete user journey functions correctly, and several **state visibility gaps** exist where users cannot see their full progress.

This debt document serves as the **connective tissue** that ties together the question engine subsystems and defines what "complete" looks like.

---

## Current Architecture

### How State is Tracked

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE TABLES                          │
├─────────────────────────────────────────────────────────────────┤
│ questions        │ 958 published questions (stem, explanation)  │
│ choices          │ 4 choices per question (one correct)         │
│ attempts         │ Every user answer (userId, questionId,       │
│                  │ isCorrect, timestamp, sessionId nullable)    │
│ practice_sessions│ Session metadata (mode, questionIds array)   │
│ bookmarks        │ User-saved questions                         │
│ tags             │ Multi-taxonomy (domain/topic/substance/etc)  │
└─────────────────────────────────────────────────────────────────┘
```

### Question Selection Logic

**Session-based (Tutor/Exam mode):**
1. Query published questions matching filters (tags, difficulty)
2. Shuffle deterministically (seed = userId + timestamp)
3. Select first N questions → store as immutable array
4. Serve questions in order, skip already-answered within session

**Ad-hoc (one-at-a-time):**
1. Query candidates matching filters
2. Prefer questions NEVER attempted
3. If all attempted, pick oldest last-attempt

### Review System

A question appears in Review if:
- User has attempted it AND
- Most recent attempt was `isCorrect = false`

Getting it right removes it from Review. Getting it wrong again re-adds it.

---

## What Works (Verified)

| Flow | Status | Verification |
|------|--------|--------------|
| Sign up → Subscribe | Working | Manual test |
| Start practice session | Working | Unit tests + manual |
| Answer question (tutor mode) | Working | Shows explanation immediately |
| Answer question (exam mode) | Working | Hides explanation until session end |
| Submit records attempt | Working | Database row created |
| Next question in session | Working | Progress increments |
| End session | Working | Sets endedAt timestamp |
| Review shows missed questions | Working | Filters by most-recent incorrect |
| Reattempt from Review | Working | Creates new attempt |
| Bookmarks save/remove | Working | Toggle functionality |
| Dashboard shows stats | Working | Total, accuracy, streak |

---

## Gaps Identified

### Gap 1: No E2E Test Coverage for Question Engine
**Impact:** Regressions can silently break the core user journey.

The question engine has unit tests but NO Playwright E2E tests that verify:
- [ ] Session creation → answering → completion flow
- [ ] Review page population after incorrect answers
- [ ] Question disappears from Review after correct reattempt
- [ ] Bookmarks persist across sessions
- [ ] Dashboard stats update after practice

**Resolution:** Create E2E test suite for authenticated question flows.

### Gap 2: No "Questions Remaining" Visibility
**Impact:** User has no sense of progress through the question bank.

User can see:
- "Total answered: 150"
- "Accuracy: 75%"

User CANNOT see:
- "150 / 958 questions attempted (16%)"
- "808 questions remaining"
- Coverage by tag/difficulty

**Resolution:** Add coverage stats to Dashboard.

### Gap 3: No "All Attempted Questions" View
**Impact:** User can only see missed OR bookmarked, not complete history.

Available views:
- Review: Only incorrect (most-recent basis)
- Bookmarks: Only manually saved
- Dashboard Recent: Only last 20

Missing view:
- "All questions I've ever attempted" with filters/sort

**Resolution:** Add "History" page with paginated attempt history.

### Gap 4: No Session Review After Completion
**Impact:** User cannot revisit a completed session.

When session ends:
- `practice_sessions.endedAt` is set
- But no UI to view "Session on Feb 5: 18/20 correct"

**Resolution:** Add `/app/sessions/[id]` page for post-session review.

### Gap 5: Sessions May Include Already-Done Questions
**Impact:** User may see the same question in multiple sessions.

Current behavior (by design):
- Session selection does NOT filter out previously-attempted questions
- Same question can appear in new session

This may or may not be desired. Needs product decision.

**Resolution:** Document as intentional OR add filtering option.

### Gap 6: No Stats Breakdown by Category
**Impact:** User cannot identify weak areas.

Missing:
- "Accuracy on Pharmacology: 60%"
- "Accuracy on Hard questions: 45%"

**Resolution:** Add category breakdown to Dashboard or new Analytics page.

---

## E2E Test Scenarios Required

### Scenario 1: Complete Practice Session Flow
```gherkin
Given I am a subscribed user
When I start a Tutor session with 5 questions
Then I should see "1/5" progress
When I answer all 5 questions
Then I should see session complete
And my Dashboard should show updated stats
```

### Scenario 2: Review Population
```gherkin
Given I answer a question incorrectly
When I navigate to Review
Then I should see that question in the list
When I reattempt and answer correctly
Then that question should disappear from Review
```

### Scenario 3: Exam Mode Feedback Timing
```gherkin
Given I start an Exam session
When I submit an answer
Then I should NOT see the explanation
When I complete all questions
Then I should see all explanations
```

### Scenario 4: Bookmark Persistence
```gherkin
Given I bookmark a question
When I sign out and sign back in
Then the bookmark should still exist
```

### Scenario 5: Dashboard Accuracy
```gherkin
Given I have answered 10 questions (7 correct, 3 incorrect)
When I view Dashboard
Then accuracy should show "70%"
And total answered should show "10"
```

---

## Resolution Checklist

### Phase 1: E2E Test Infrastructure
- [ ] Set up authenticated E2E test user (DEBT-104 dependency)
- [ ] Create test fixtures for question bank scenarios
- [ ] Implement test helpers for session management

### Phase 2: Core Flow E2E Tests
- [ ] Test: Start session → answer questions → complete
- [ ] Test: Tutor mode shows explanation immediately
- [ ] Test: Exam mode hides explanation until end
- [ ] Test: Review shows incorrect questions only
- [ ] Test: Reattempt removes from Review when correct

### Phase 3: State Visibility Gaps
- [ ] Add "X/Y questions attempted" to Dashboard
- [ ] Add "Questions by category" breakdown
- [ ] Consider "All Attempted" history page

### Phase 4: Session Review
- [ ] Add `/app/sessions` list page
- [ ] Add `/app/sessions/[id]` detail page
- [ ] Show session summary with per-question results

---

## Verification

- [ ] All E2E test scenarios pass
- [ ] No regressions in existing functionality
- [ ] User can see complete progress state
- [ ] Documentation updated

---

## Related

- DEBT-104: Missing E2E Test Credentials (blocks E2E tests)
- DEBT-105: Missing Session Resume Functionality
- DEBT-106: Exam Mode Missing "Mark for Review"
- SPEC-012: Core Question Loop
- SPEC-013: Practice Sessions
- SPEC-014: Review and Bookmarks
- SPEC-015: Dashboard

---

## Files Reference

| Component | File |
|-----------|------|
| Question Selection | `src/domain/services/question-selection.ts` |
| Start Session | `src/application/use-cases/start-practice-session.ts` |
| Get Next Question | `src/application/use-cases/get-next-question.ts` |
| Submit Answer | `src/application/use-cases/submit-answer.ts` |
| Missed Questions | `src/application/use-cases/get-missed-questions.ts` |
| User Stats | `src/application/use-cases/get-user-stats.ts` |
| Attempt Repository | `src/adapters/repositories/drizzle-attempt-repository.ts` |
| Practice Page | `app/(app)/app/practice/page.tsx` |
| Session Page | `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` |
| Review Page | `app/(app)/app/review/page.tsx` |
| Dashboard Page | `app/(app)/app/dashboard/page.tsx` |
