# DEBT-316: Exam Post-Submit Flow Skips Question Review

**Priority:** P2
**Created:** 2026-03-15
**Status:** Open
**Source:** Manual QA — exam mode walkthrough
**Scope:** Practice session completion flow, session summary page, question review navigation

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
- Modifying the history page
- Changing the exam review (pre-submission) stage
- Adding new API endpoints (existing `getPracticeSessionReview` provides all needed data)

---

## Test Plan

### Unit Coverage
1. Session summary renders "Review Your Answers" button for exam sessions
2. Review button constructs correct URL with session question sequence
3. Review button links to first question in the session's question order
4. For tutor sessions, review button is either absent or demoted (TBD based on implementation)

### Manual Visual QA
1. Complete a 2-question exam → submit → verify "Review Your Answers" button appears prominently
2. Click "Review Your Answers" → verify it opens question 1 with explanation visible
3. Navigate through all questions → verify Previous/Next work correctly
4. Click "Back to History" from review → verify it returns to appropriate page
5. Complete a tutor session → verify session summary still works as expected
