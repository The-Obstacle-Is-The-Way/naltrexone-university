# DEBT-316: Exam Session UX — Post-Submit Dead-End and In-Session Navigation Gaps

**Priority:** P2
**Created:** 2026-03-15
**Status:** Open
**Source:** Manual QA + Claude-in-Chrome browser walkthrough (2026-03-15)
**Scope:** Exam session end-to-end flow: in-session navigation, pre-submission review, session summary, post-submit review path

---

## Context

After submitting an exam, the user lands on the Session Summary page with three options: "Back to Dashboard", "View in History", and "Start another session". None of these provide a direct path to review the questions with explanations — which is the single most important learning action after an exam.

To actually review questions with explanations, the user must:

1. Click "View in History" → lands on `/app/history` (sessions tab)
2. Find the session they just completed in the list
3. Click the chevron to expand the session breakdown
4. Click an individual question → lands on `/app/questions/[slug]?mode=review&...`

That's **4 clicks** to reach the review screen after exam submission. For a learning app, this is a critical UX gap — the moment a student finishes an exam is exactly when they're most motivated to review what they got wrong.

**Tutor mode** is less affected because explanations are shown inline during the session, but the same dead-end exists on the session summary page.

---

## Current Flow

### Tutor Mode
```
Answer Q1 → see explanation → Answer Q2 → see explanation → "End session"
  → Session Summary (stats + breakdown)
  → [Back to Dashboard | View in History | Start another session]
```
**Verdict:** Acceptable — user already reviewed explanations inline. Session summary is a natural endpoint.

### Exam Mode
```
Answer Q1 (no explanation) → auto-advance → Answer Q2 → "Review answers"
  → Exam Review page (pre-submission checklist: answered/unanswered/marked)
  → "Submit exam" → confirmation dialog → "Confirm submit"
  → Session Summary (stats + breakdown)
  → [Back to Dashboard | View in History | Start another session]   ← DEAD END for learning
```
**Problem:** The user has never seen any explanations. The session summary shows correct/incorrect status but no explanations. The only way to review is through the history page (4 clicks away).

---

## In-Session UX Issues (Browser Walkthrough Findings)

Beyond the post-submit dead-end, a full browser walkthrough uncovered several related UX issues during the exam session itself:

### 1. No "Finish Exam" Button After All Questions Answered

After submitting the last question, the bottom bar shows only **Previous, Bookmark, Mark for review** — the Submit button disappears. The only forward path is the **"Review answers" button at the top right**, which is easy to miss. Users who just finished their last question have no obvious call-to-action guiding them to end the exam.

**Fix:** Add a prominent "Finish Exam" or "Review & Submit" button to the bottom bar once all questions have been submitted.

### 2. "Open question" From Pre-Submission Review Is a Dead-End

On the Review Questions screen (pre-submission), clicking "Open question" navigates back to the question view, but:
- The **Question navigator disappears**
- There are **no Previous/Next buttons** to move between questions
- The only way back is the "Review answers" button at the top right
- Answer choices are grayed out (already locked), so there's nothing actionable

The user loses their navigation context. They went to inspect a question but got stranded.

**Fix:** Restore Previous/Next navigation and the question navigator when opening a question from the review screen.

### 3. "Submit" Label Ambiguity

"Submit" is used for two different actions: locking in an individual answer during the session, and "Submit exam" for finalizing the entire exam. Users may hesitate on their first question thinking "Submit" ends the whole exam.

**Fix:** Consider renaming the per-question action to "Confirm Answer" or "Lock Answer" to disambiguate from "Submit exam."

### 4. No Feedback When Answer Is Locked (Auto-Advance)

After clicking Submit on a non-final question, the app auto-advances to the next question with no confirmation toast or "answer saved" feedback. The transition is silent and abrupt.

**Fix:** Add a brief toast (e.g., "Answer saved") or subtle visual acknowledgment before auto-advancing.

### 5. Session Summary Question Breakdown Is Not Clickable

The question breakdown list on the Session Summary shows each question with Correct/Incorrect labels, but the rows are **not clickable**. Users instinctively try to tap a question to see the explanation — nothing happens.

**Fix:** Make each breakdown row link directly to that question's review page with explanations.

---

## Recommended Direction

### Option A: Add "Review Questions" Button to Session Summary (Minimal Change)

Add a prominent "Review Questions" CTA to the session summary that links directly into the sequential question review page (`/app/questions/[slug]?mode=review&sessionId=...&historySeq=...&historyIndex=0`), pre-populated with the session's question sequence.

**Pros:** Small change, reuses existing review infrastructure.
**Cons:** User still sees session summary first, which may feel anticlimactic after an exam.

### Option B: Auto-Navigate to Question Review After Exam Submit (Proposed)

After exam submission:
1. Submit exam → brief Session Summary interstitial (or skip entirely)
2. Auto-navigate to the question review page starting at question 1
3. User reviews all questions with explanations, navigating with Previous/Next
4. At the end of the review sequence, show a "View Session Summary" button (or navigate automatically)

**Flow:**
```
Submit exam → Question Review (Q1 with explanation) → Next → Q2 → ... → Qn
  → "View Session Summary" or auto-redirect
  → Session Summary with [Back to Dashboard | Start another session]
```

**Pros:** Mirrors real exam UX (submit → immediately see results). Maximum learning value.
**Cons:** Larger change. Requires building the review sequence URL from the session data in the `onFinalizeReview` handler or the session summary page. Need to handle the case where user wants to skip review.

### Option C: Hybrid — Session Summary with Prominent Review CTA (Recommended)

Show Session Summary first but with a **primary CTA** "Review Your Answers" that navigates directly into the sequential question review. Demote "Back to Dashboard" and "Start another session" to secondary actions.

**Flow:**
```
Submit exam → Session Summary
  → [**Review Your Answers** (primary)] [Back to Dashboard | Start another session (secondary)]
```

**Pros:** User sees their score first (natural expectation), then immediately has a one-click path to review. Non-breaking change to existing flow. Works for both exam and tutor modes.
**Cons:** Still requires constructing the review sequence URL.

---

## Implementation Notes

### Building the Review Sequence URL

The existing question review page at `/app/questions/[slug]` already supports sequential navigation via query params:
- `mode=review`
- `sessionId=[id]`
- `historySeq=[slug1,slug2,...]` (comma-separated question slugs)
- `historyIndex=0` (start at first question)
- `from=history`
- `historyHref=[return URL]`

The Session Summary page already lazy-loads the question breakdown via `getPracticeSessionReview()`, which returns all question data. The slugs and ordering are available in that response.

### Key Files

| File | Role |
|------|------|
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | Session summary UI — add Review CTA here |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts` | Review stage state — `onFinalizeReview()` exit point |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | Session logic — `endSession()` |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Question review page — already supports sequential review |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | Breakdown list — already builds review links |
| `lib/routes.ts` | Route constants — may need a helper for review sequence URL |

### Out of Scope

- Changing the tutor mode flow (already adequate)
- Modifying the history page layout or functionality
- Adding new API endpoints (existing `getPracticeSessionReview` provides all needed data)
- Renaming "Submit" to "Confirm Answer" (cosmetic, can be a separate follow-up)

---

## Test Plan

### Unit Coverage
1. Session summary renders "Review Your Answers" primary CTA button for exam sessions
2. Review button constructs correct URL with session question sequence
3. Review button links to first question in the session's question order
4. For tutor sessions, review button is either absent or demoted (TBD based on implementation)
5. Question breakdown rows on session summary are clickable and link to the correct question review URL
6. "Finish Exam" button renders in the bottom bar when all questions have been submitted
7. Pre-submission "Open question" view retains Previous/Next navigation and question navigator

### Manual Visual QA
1. Complete a 2-question exam → submit → verify "Review Your Answers" button appears as primary CTA
2. Click "Review Your Answers" → verify it opens question 1 with explanation visible
3. Navigate through all questions → verify Previous/Next work correctly
4. Click "Back to History" from review → verify it returns to appropriate page
5. Complete a tutor session → verify session summary still works as expected
6. After answering all exam questions, verify "Finish Exam" button appears in the bottom bar
7. On pre-submission review, click "Open question" → verify question navigator and Previous/Next are present
8. On session summary, click a question in the breakdown → verify it opens the explanation review
9. Verify answer submission shows brief feedback before auto-advancing to next question
