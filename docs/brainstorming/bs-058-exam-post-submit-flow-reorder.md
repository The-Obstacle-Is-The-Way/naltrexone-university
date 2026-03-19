# BS-058: Exam Post-Submit Flow Reorder

**Date:** 2026-03-19
**Triggered by:** Manual walkthrough of the exam mode end-to-end flow; "summary sandwich" friction
**Scope:** After clicking "Submit exam," the user lands on Session Summary before seeing any feedback — the highest-value learning moment is gated behind an extra click
**Related:** [BS-055](./bs-055-exam-session-interaction-model-rethink.md) (exam interaction model), [interaction-contracts.md](../practice-engine/interaction-contracts.md) (§5 Post-Session Flows), AF-6 (Try Again in exam review)

---

## 1. The Problem

### Current exam flow

```text
Questions → Review & Submit → [Submit exam] → Session Summary → [Review your answers] → Question Review → [Back to Summary] → Session Summary
```

Three distinct friction points:

**P1 — The "summary sandwich."** The user visits Session Summary twice: once immediately after submission, and again after reviewing questions (via "Back to Summary"). The two visits are identical. The first feels premature; the second feels redundant.

**P2 — Feedback gated behind an extra click.** In exam mode, the user has seen zero feedback during the entire session. The feedback reveal — seeing what they got right and wrong, reading explanations, clinical pearls — is the climactic learning moment. But the current flow puts a stats page between them and that moment. The user must scan the summary, find the "Review your answers" button, click it, and only then see what they actually got wrong.

**P3 — Visual confusion.** The Session Summary page and the Question Review page share similar visual structures (cards, question lists, stats). Landing on Session Summary immediately after the Review & Submit screen feels like "another screen that looks the same" — the user doesn't immediately register that the exam is over and learning mode has begun.

### How it contrasts with tutor mode

In tutor mode, the user has already seen every explanation during the session. Session Summary is a natural wrap-up — a retrospective on material they've already processed. "Review your answers" is an optional re-read.

In exam mode, the user has processed nothing yet. Session Summary is not a wrap-up; it's a roadblock before the actual learning begins.

---

## 2. Root Cause Analysis

### Why it works this way today

The state machine in `practice-session-page-view.tsx` has a strict priority chain (lines 116–179):

```text
1. if (props.summary)        → render SessionSummaryView   ← catches everything after finalize
2. if (reviewLoadState error) → render error card
3. if (review)                → render ExamReviewView       ← pre-submit review
4. else                       → render PracticeView         ← active question
```

When `onFinalizeReview` fires (`use-practice-session-review-stage-state.ts:147-152`):
1. `setReview(null)` — tears down the review stage
2. `setIsInReviewStage(false)`
3. Calls `finalizeSession()` → `endSession()` → sets `summary`

Because `review` is cleared and `summary` is set in the same logical flow, the page transitions directly from ExamReviewView → SessionSummaryView. There is no intermediate state for "graded question review."

### The question review page is a separate route

"Review your answers" navigates to `/app/questions/[slug]?from=summary&mode=review&sessionId=...` — a completely different Next.js page (`question-page-client.tsx`). This is by design: the question review page is a shared component used by History, Bookmarks, Summary, and the Dashboard. It's not embedded within the practice session page.

This means the proposed flow change has two architectural options:
- **Option A:** Embed a question-by-question review within the practice session page (new in-session review stage)
- **Option B:** Auto-navigate to the existing question review route after submission

---

## 3. Severity Assessment

| Dimension | Assessment |
|-----------|------------|
| **User impact** | Medium-high. Every exam session ends with this friction. Users who want to learn from mistakes (the app's primary value) face a needless detour. |
| **Frequency** | Every completed exam session. |
| **Workaround** | User can click "Review your answers" (one extra click). Not broken, just suboptimal. |
| **Learning cost** | Some users may not click "Review your answers" at all, missing the feedback entirely. The default path (summary → leave) optimizes for "see score and go" rather than "learn from mistakes." |

---

## 4. Proposed Flows

### Option A: Inline Post-Exam Review Stage (Recommended)

```text
Questions → Review & Submit → [Submit exam] → Score Banner + Question Review (in-session) → [Finish Review] → Session Summary
```

After "Submit exam" finalizes the session:
1. A **score banner** appears at top (e.g., "3 of 5 correct — 60%") giving the headline number immediately
2. The page enters a new **post-exam review stage** that shows the first question with full feedback (correct/incorrect pill, explanation, clinical pearl, "Why Other Answers Are Wrong")
3. The existing `QuestionNavigator` component (already used during the exam) stays visible, now color-coded by correctness (green/red/gray)
4. Previous/Next navigate between questions with feedback revealed
5. **"View Summary"** button replaces "Back to Summary" — takes user to Session Summary as the final destination
6. No "Try Again" button (addresses AF-6)

**Pros:**
- Linear flow with no bouncing
- Feedback reveal is the default post-submission experience
- Score is visible immediately via banner (no information loss)
- Reuses existing components (`QuestionNavigator`, `QuestionCard`, `Feedback`)
- Navigator already exists in the practice session page — just needs to stay visible with updated styling
- Session Summary becomes a satisfying conclusion rather than an interruption

**Cons:**
- **New state in the practice session page.** The page currently has: active question | review-and-submit | summary. This adds a fourth state: post-exam-review. The state machine becomes more complex.
- **Data requirements.** The post-exam review needs the full feedback data (explanations, choice explanations, references) for each question. Today this data only lives in the question review route via `useQuestionPagePreviousAttempt`. The practice session page would need to fetch it.
- **Component duplication risk.** The question review route (`question-page-client.tsx`) already renders `QuestionCard` + `Feedback` + navigator. Building the same in the practice session page means rendering the same UI from different state sources. Need to extract shared rendering or accept duplication.
- **Larger implementation scope.**

### Option B: Auto-Navigate to Question Review Route

```text
Questions → Review & Submit → [Submit exam] → (auto-navigate) → /app/questions/[slug]?from=exam-results&mode=review → [Finish Review] → Session Summary
```

After "Submit exam" finalizes the session:
1. Instead of setting `summary` and rendering SessionSummaryView, the page auto-navigates to the first question's review route with a new `from=exam-results` origin
2. The question review page renders as it does today, but with `from=exam-results` meaning:
   - "Back to Summary" becomes "View Summary"
   - "Try Again" is hidden (AF-6)
   - A score banner could appear at top
3. After reviewing, "View Summary" navigates to the session summary route

**Pros:**
- Reuses the existing question review infrastructure entirely
- No new state in the practice session page
- Smaller implementation scope

**Cons:**
- **Full page navigation after submission.** The user clicks "Submit exam" and the page navigates away — a jarring transition. The practice session URL changes to `/app/questions/...`. This breaks the mental model of "I'm still in my exam session."
- **Session state loss.** The practice session page's in-memory state (summary data, navigator) is lost on navigation. The question review page must independently fetch everything.
- **Back button confusion.** Browser back from the question review page goes to... the practice session URL, which might try to reload the (now completed) session. Could cause stale state issues.
- **Summary access.** The session summary data needs to be accessible from the question review route, either via URL params, a fetch, or localStorage. Today it's only in-memory on the practice session page.

### Option C: Summary with Embedded Expandable Review

```text
Questions → Review & Submit → [Submit exam] → Session Summary (with expandable question review inline)
```

Session Summary stays the first screen, but each question in the breakdown is expandable to show full feedback inline.

**Pros:**
- Smallest change. Summary page stays first; questions are just more accessible.
- No new state machine states.
- No navigation changes.

**Cons:**
- Doesn't solve the core problem. The user still lands on a stats page first, not the learning content.
- Expanding 10+ questions inline makes a very long page.
- Mobile UX suffers with many expanded cards.
- Doesn't feel like a proper review flow — feels like a long scrollable summary.

---

## 5. Hidden Gotchas

### G1 — Navigator color coding

During the active exam, the `QuestionNavigator` uses answer status (answered/unanswered) for styling. After finalization, it needs correctness data (correct/incorrect/unanswered) for color coding. The `GetPracticeSessionReviewOutput` already contains `isCorrect` per row, so the data is available — but the navigator component currently only uses `isAnswered` and `markedForReview` for styling. It would need a variant or mode prop to switch to correctness-based styling.

### G2 — Feedback data per question

The `Feedback` component needs: `isCorrect`, `explanationMd`, `referenceMd`, `choiceExplanations`, and `selectedChoiceId`. During the active exam, this data isn't loaded (exam answer secrecy policy). After finalization, the data must be fetched.

Two paths:
- **Bulk fetch:** A new use case that returns all questions with feedback for a completed session (avoids N+1 loads as the user navigates)
- **Per-question fetch:** Reuse the existing `GetQuestionBySlug` + previous attempt hydration (what the question review route does today)

The bulk fetch is better for Option A (in-session review); per-question is what Option B gets for free.

### G3 — Exam answer secrecy timing

The [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md) gates correctness/explanation exposure on session completion. The finalization step (`FinalizeExamAnswers`) must complete before any feedback is rendered. This is already the case today — no change needed. But the code must be careful not to optimistically render feedback before the server confirms finalization.

### G4 — "Skip review" escape hatch

Some users want their score and want to leave. The new flow should always offer a quick path to Summary without requiring the user to navigate through every question. A persistent "View Summary" / "Skip to Summary" link satisfies this.

### G5 — Session reopen behavior

If a user closes the tab mid-review and returns to `/app/practice/[sessionId]`, the page needs to know whether to show:
- The post-exam review (if they haven't viewed the summary yet)
- The session summary (if they've already completed review)

Since the session is already `completed` in the database after finalization, the simplest approach: always show the summary on session reopen. The post-exam review is an ephemeral in-session state, not a persisted stage. This matches tutor mode behavior (reopening a completed tutor session shows the summary).

### G6 — AF-6: "Try Again" in exam review (code-verified)

The question review page renders "Practice Again" / "Try Again" unconditionally whenever `submitResult` exists (`question-page-client.tsx:408-418`). There is **no mode-aware or origin-aware suppression** — the button shows identically whether the review came from an exam session, a tutor session, bookmarks, or history. This weakens exam finality and adds decision fatigue (4 buttons per question in review: Reattempt + Bookmark + Next/Previous + Back to Summary).

**Fix:** Suppress reattempt actions when `from=summary` and the session mode is exam. Consider replacing per-question reattempt with a single **"Practice missed questions"** CTA on the Session Summary page that creates a new tutor-mode session filtered to only the questions answered incorrectly. This preserves the learning loop while respecting exam finality.

### G7 — E2E test impact

The existing E2E test (`practice.spec.ts:73-109`) expects:
```text
Submit exam → Session Summary heading visible
```

Any flow change must update this test. If Option A is chosen, the test should verify:
```text
Submit exam → Score banner visible → Question feedback visible → View Summary → Session Summary heading
```

---

## 6. Recommendation

**Option A (Inline Post-Exam Review Stage)** is the strongest choice despite larger scope, because:

1. It keeps the user on the same page — no jarring navigation after "Submit exam"
2. The navigator component already exists in the practice session page
3. It naturally addresses AF-6 (the practice session page controls what actions are available, not the shared question review route)
4. Session state (summary data) stays in memory — no need to refetch or pass via URL
5. The score banner + first question with feedback is the ideal "climactic reveal" moment

The implementation would add a fourth state to `PracticeSessionPageView`:

```text
Current:  active-question | review-and-submit | summary
Proposed: active-question | review-and-submit | post-exam-review | summary
```

The state transition becomes:
```text
onFinalizeReview():
  1. Call finalizeSession() → get summary data
  2. DON'T set summary yet — store it aside
  3. Fetch review data (question details + feedback) for the completed session
  4. Enter post-exam-review stage
  5. User navigates questions, sees feedback
  6. User clicks "View Summary" → set summary → render SessionSummaryView
```

---

## 7. Open Questions

| # | Question | Options | Leaning |
|---|----------|---------|---------|
| Q1 | Should the score banner show accuracy + counts, or just the headline number? | (a) Full stats (b) Just accuracy (c) Compact | **Decided: (c)** — "Score: 60% (3/5)", concise but informative |
| Q2 | Bulk fetch vs per-question fetch for feedback data? | (a) Bulk fetch (b) Per-question | **Decided: (a)** — single server call, no loading spinners between questions |
| Q3 | Should the post-exam review auto-start on Q1 or on the first incorrect question? | (a) Always Q1 (b) First incorrect (c) First incorrect or Q1 | **Decided: (a)** — predictable, linear, review everything in order |
| Q4 | Should the post-exam review be skippable from the start? | (a) "View Summary" visible from the beginning (b) Only after viewing all questions (c) Always visible + "Skip" label initially | Open — leaning (a), respect user autonomy |
| Q5 | Should the question review route also suppress "Try Again" for exam sessions independently of BS-058? | Yes (AF-6 is a standalone fix) / No (bundle with BS-058) | Open — leaning Yes |
| Q6 | Should the question breakdown in SessionSummaryView still show "Review your answers" after BS-058? | (a) Keep it (b) Remove it (c) Keep but label "Review again" | Open — leaning (a), keep for History-launched and reopen scenarios |
| Q7 | What happens on session reopen? | (a) Always show summary (post-exam review is ephemeral) (b) Track review completion in session state | Open — leaning (a), simpler, matches tutor mode |
| Q8 | Should AF-6 be replaced with a batch "Practice missed questions" CTA on Summary? | (a) Just suppress (b) Suppress + add batch CTA (c) Keep per-question but relabel | **Decided: (b)** — suppress per-question "Try Again", add "Practice missed questions" on Summary, demote "View in History" to subtle link |
| Q9 | Should "View in History" be deprioritized on the post-exam Summary? | (a) Keep as-is (b) Demote to subtle link (c) Remove entirely | **Decided: (b)** — bundled with Q8 decision |

### G8 — "View in History" CTA relevance

The Session Summary shows "View in History" as one of three CTAs. Immediately after finishing an exam, this is a power-user action — most students want to either review their mistakes or start a new session. Clicking it navigates to the full history list page, and clicking the session from there opens the same question review content the user just saw (with "Back to History" instead of "Back to Summary"). It's redundant in the post-exam context. Consider deprioritizing to a subtle link or relocating to a less prominent position.

### G9 — "Back to Summary" label implies backtracking

The label "Back to Summary" (code-verified at `question-page-client.tsx:118`) frames the action as regression — returning to a screen already visited. In the proposed Option A flow, the user hasn't visited Summary yet, making "Back to" factually wrong. Even in the current flow, the label encourages a mental model of looping rather than forward progression. Renaming to **"View Summary"** or **"Finish Review"** reframes the action as forward movement.

---

## 8. External Review: Chrome Agent Walkthrough (2026-03-19)

An independent Claude-in-Chrome agent performed a full end-to-end exam walkthrough (2 questions, exam mode, submission through review). Its observations were verified against the codebase. Findings are integrated throughout this document. Key takeaways:

### Verified true positives (added to gotchas above)

- **AF-6 confirmed:** "Practice Again" / "Try Again" renders on every exam question review screen with zero suppression (`question-page-client.tsx:408-418`)
- **4-button decision fatigue in review:** Each question review screen shows 4 action buttons, creating choice overload at a moment when the user should focus on learning
- **Summary→Review→Summary loop:** Structural fact — the flow is a round-trip, not a funnel
- **"Back to Summary" label implies regression:** Confirmed exact label at `question-page-client.tsx:118`
- **"View in History" is low-value in post-exam context:** Leads to the same content via a longer path

### Verified false positives (claims contradicted by code)

- **"All three CTAs have equal visual weight"** — FALSE. "Review your answers" uses `variant='default'` (filled primary button). "Back to Practice" and "View in History" use `variant='outline'`. The hierarchy is correctly established in code (`session-summary-view.tsx:103-127`). The dark theme may reduce perceived contrast between filled and outline buttons, but the code is correct.
- **"No red/urgency for incorrect answers"** — FALSE. The breakdown list uses `text-destructive` (red) for "Incorrect" and `text-success` (green) for "Correct" (`session-breakdown-list.tsx:63-65`). Color coding exists and is correctly implemented.

### Novel suggestion worth considering

The Chrome agent proposed replacing per-question "Try Again" with a single **"Practice missed questions"** CTA on the Summary page, creating a new tutor-mode session filtered to incorrect questions only. This is a stronger AF-6 fix than simple suppression — it preserves the reattempt pathway while respecting exam finality and reducing per-question decision fatigue. Added to G6 above.

### Disagreement on preferred option

The Chrome agent preferred a variant of **Option C** (single scrollable summary page with inline expandable explanations). This doc recommends **Option A** (separate post-exam review stage). The disagreement is acknowledged — Option C has the advantage of "one page, no navigation" simplicity, but fails to make feedback the default experience (stats still lead) and creates mobile UX issues at scale (10+ expandable cards).

---

## 9. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | Created BS-058 | Manual walkthrough revealed "summary sandwich" friction: feedback gated behind extra click, summary visited twice, visual confusion between screens |
| 2026-03-19 | Added Chrome agent review findings | Independent walkthrough confirmed AF-6, decision fatigue (4 buttons), loop structure, and "Back to Summary" regression label. Rejected 2 false claims (CTA weight parity, missing red color coding). Incorporated "Practice missed questions" batch CTA idea. |
| 2026-03-19 | Decided Q1 (compact score banner), Q2 (bulk fetch), Q3 (start at Q1), Q8+Q9 (suppress Try Again + add batch CTA + demote View in History) | User confirmed all recommended options. 4 of 9 questions remain open (Q4-Q7) — all have clear leanings and can be finalized during implementation spec. |
