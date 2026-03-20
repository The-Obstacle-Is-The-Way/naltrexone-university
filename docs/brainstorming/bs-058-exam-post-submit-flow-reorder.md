# BS-058: Exam Post-Submit Flow Reorder

**Date:** 2026-03-19
**Triggered by:** Manual walkthrough of the pre-BS-058 exam mode end-to-end flow; "summary sandwich" friction
**Status:** Implemented on 2026-03-19. The shipped flow now enters an in-session post-exam review stage before Session Summary. This document preserves the original analysis, records the implementation outcome, and notes follow-up debt discovered after ship.
**Scope:** Historical problem analysis for the old "Submit exam → Session Summary first" flow, plus the code-verified implementation outcome that replaced it
**Related:** [BS-055](../_archive/brainstorming/bs-055-exam-session-interaction-model-rethink.md) (exam interaction model), [interaction-contracts.md](../practice-engine/interaction-contracts.md) (§5 Post-Session Flows), AF-6 (Try Again in exam review)

---

## Current Shipped State

The current exam post-submit flow is:

```text
Questions → Review & Submit → [Submit exam] → Confirm submit → Post-Exam Review → [View Summary / Finish review] → Session Summary
```

Shipped implementation, verified against code:

- `PracticeSessionPageView` now has a dedicated `postExamSummary + postExamReview` branch before `summary` (`app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`)
- `usePracticeSessionReviewStage` defers the finalized summary, loads completed-session feedback in bulk, and only promotes Summary when `onViewSummary()` fires (`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`)
- `PostExamReviewView` renders the score banner, correctness-colored navigator, inline feedback, top-right `View Summary`, and `Finish review` on the last question (`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx`)
- The standalone question-review route now suppresses `Practice Again` / `Try Again` for exam-owned review attempts via `reviewSessionMode !== 'exam'` (`app/(app)/app/questions/[slug]/question-page-client.tsx`)
- DEBT-324 later removed the misleading `Practice missed questions` shortcut from `SessionSummaryView`, leaving the terminal summary focused on review re-entry and session exits

---

## 1. Original Problem Statement (Pre-BS-058 Audit)

### Pre-BS-058 audited flow

```text
Questions → Review & Submit → [Submit exam] → Session Summary → [Review your answers] or [question row link] → Question Review → [Back to Summary] → Session Summary
```

Three distinct friction points:

**P1 — The "summary sandwich."** The user visits Session Summary twice: once immediately after submission, and again after reviewing questions (via "Back to Summary"). The two visits are identical. The first feels premature; the second feels redundant.

**P2 — Explanations gated behind an extra action.** In exam mode, the user has seen zero explanations during the entire session. The feedback reveal — reading the rationale, clinical pearls, and why-other-answers breakdowns — is the climactic learning moment. But the current flow puts a stats page between them and that moment. The user must take a second action from Summary (`Review your answers` or a clickable question row) before seeing the full explanation content.

**P3 — The two summary-style screens are too similar.** The strongest visual resemblance is between **Review & Submit** and **Session Summary**: both lead with a heading, stat cards, a question list, and a CTA area. That makes the transition after submission feel flatter than it should. The question review page is more distinct, but the user does not reach it until after another click.

### How it contrasts with tutor mode

In tutor mode, the user has already seen every explanation during the session. Session Summary is a natural wrap-up — a retrospective on material they've already processed. "Review your answers" is an optional re-read.

In exam mode, the user has processed nothing yet. Session Summary is not a wrap-up; it's a roadblock before the actual learning begins.

---

## 2. Root Cause Analysis

### Why it worked that way before BS-058

Before BS-058, the practice-session page had no post-submit review branch. Finalizing the exam tore down the pre-submit review state and promoted `summary`, so the user transitioned directly from `ExamReviewView` to `SessionSummaryView`. There was no intermediate in-session state for "graded question review."

BS-058 fixed that by splitting finalization into two steps:

1. finalize the exam and hold the resulting summary aside
2. bulk-load completed-session feedback and enter a dedicated `PostExamReviewView`

Only after the user clicks `View Summary` does the deferred summary become the terminal state. That current implementation lives in:

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts`
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx`

### The question review page is a separate route

`SessionSummaryView` exposes **two** routes into the question review page:
- the primary CTA: `Review your answers`
- each clickable question row inside `Question breakdown`

Both navigate to `/app/questions/[slug]?from=summary&mode=review&sessionId=...` — a completely different Next.js page (`question-page-client.tsx`). This is by design: the question review page is a shared component used by History, Bookmarks, Summary, and the Dashboard. It's not embedded within the practice session page.

This means the proposed flow change has two architectural options:
- **Option A:** Embed a question-by-question review within the practice session page (new in-session review stage)
- **Option B:** Auto-navigate to the existing question review route after submission

---

## 3. Severity Assessment

| Dimension | Assessment |
|-----------|------------|
| **User impact** | Medium-high. Every exam session ends with this friction. Users who want to learn from mistakes (the app's primary value) face a needless detour. |
| **Frequency** | Every completed exam session. |
| **Workaround** | User can click `Review your answers` or a question row in `Question breakdown` (still one extra action). Not broken, just suboptimal. |
| **Learning cost** | Some users may leave after the score screen without drilling into explanations. The default path still optimizes for "see score and go" rather than "learn from mistakes." |

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
5. A single **`View Summary`** escape hatch is visible from the start, but it should not create another overloaded four-button footer. Recommended pattern:
   - persistent top-right `View Summary` link during review
   - bottom bar focused on movement/utility (`Previous`, `Bookmark`, `Next`)
   - on the last reviewed question, the primary forward action becomes `Finish review` or `View Summary`
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

**Current:** The `QuestionNavigator` in `exam-review-view.tsx:59-63` styles buttons by: `isCurrent` → `default`, `row.isAnswered` → `secondary`, unanswered → `outline`. The `markedForReview` field only controls a small dot indicator, not the button variant.

**Needed:** After finalization, the navigator must switch to correctness-based colors. The `ReviewQuestionNavigator` in `review-question-navigator.tsx:15-21` already implements this pattern: `isCorrect === true` → `success`, `isCorrect === false` → `destructive`, `null` → `outline`.

**Implementation path:** Add a `mode` prop to `QuestionNavigator`: `'exam'` (current behavior) vs `'review'` (correctness-based). When `mode='review'`, derive the variant from `row.isCorrect` using the same `success`/`destructive`/`outline` mapping that `ReviewQuestionNavigator` uses. The data is already available — `GetPracticeSessionReviewOutput` includes `isCorrect` per row.

### G2 — Feedback data per question

**What the post-exam review needs per question** (to render `QuestionCard` + `Feedback`):
- `stemMd` — already in `GetPracticeSessionReviewOutput` rows
- `choices: Array<{ id, label, textMd }>` — **NOT in review output.** Currently fetched via `GetQuestionBySlug`.
- `selectedChoiceId: string | null` — **NOT in review output.** Currently fetched via `GetPreviousAttempt`.
- `correctChoiceId: string` — **NOT in review output.** Currently fetched via `GetPreviousAttempt`.
- `isCorrect: boolean` — already in review output (for completed exam sessions)
- `explanationMd: string | null` — **NOT in review output.** Currently fetched via `GetPreviousAttempt`.
- `referenceMd: string | null` — **NOT in review output.** Currently fetched via `GetPreviousAttempt`.
- `choiceExplanations: ChoiceExplanation[]` — **NOT in review output.** Currently fetched via `GetPreviousAttempt`.

**The current question review route loads 2 requests per question** (waterfall): `getQuestionBySlug` + `getPreviousAttempt`. For a 20-question exam with Option A, this would be 40 sequential fetches unless batched.

**Decision (Q2): Bulk fetch.** A new use case (e.g., `GetCompletedSessionQuestionsWithFeedback`) returns all questions for a completed session in one call. Each row extends the existing review row with: `choices`, `selectedChoiceId`, `correctChoiceId`, `explanationMd`, `referenceMd`, `choiceExplanations`. This eliminates all per-question loading spinners during the post-exam review.

### G3 — Exam answer secrecy timing

The [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md) gates correctness/explanation exposure on session completion. The finalization step (`FinalizeExamAnswers`) must complete before any feedback is rendered. This is already the case today — no change needed. But the code must be careful not to optimistically render feedback before the server confirms finalization.

### G4 — "Skip review" escape hatch

Some users want their score and want to leave. The new flow should always offer a quick path to Summary without requiring the user to navigate through every question. A persistent top-right `View Summary` link satisfies this without adding yet another always-visible footer action.

### G5 — Session reopen behavior

If a user closes the tab mid-review and returns to `/app/practice/[sessionId]`, the page needs to know whether to show:
- The post-exam review (if they haven't viewed the summary yet)
- The session summary (if they've already completed review)

Since the session is already `completed` in the database after finalization, the simplest approach: always show the summary on session reopen. The post-exam review is an ephemeral in-session state, not a persisted stage. This matches tutor mode behavior (reopening a completed tutor session shows the summary).

### G6 — AF-6: "Try Again" in exam review (code-verified)

**Pre-BS-058 / pre-AF-6 state:** the question review page rendered `Practice Again` / `Try Again` whenever `submitResult` existed, with no exam-session suppression.

**Shipped outcome:** this is now fixed. `QuestionView` computes:

```tsx
const shouldShowReattempt =
  (props.submitResult !== null || isSessionReviewUnansweredReveal) &&
  reviewSessionMode !== 'exam';
```

So exam-owned review attempts suppress reattempt on the standalone route as intended.

**What remains after ship:**

1. **Option A in-session review (BS-058):** The new post-exam review stage simply does not render a reattempt button. No conditional needed — it's a new component we control.

2. **Batch CTA replacement (Q8):** BS-058 initially shipped a **`Practice missed questions`** CTA on `SessionSummaryView`, but [DEBT-324](../debt/debt-324-session-scoped-practice-missed-questions.md) later removed it after post-ship audits confirmed the link opened the user's global latest-visible incorrect Quick Practice pool rather than a session-scoped follow-up.

### G7 — E2E test impact

The existing E2E test (`practice.spec.ts:73-109`) expects:
```text
Submit exam → Session Summary heading visible
```

Any flow change must update this test. If Option A is chosen, the test should verify:
```text
Submit exam → Score banner visible → Question feedback visible → View Summary → Session Summary heading
```

### G8 — "View in History" CTA relevance

**Pre-BS-058 state:** the Session Summary showed `View in History` as an outline CTA with too much visual weight for an immediate post-exam power-user action.

**Shipped outcome (Q9):** this landed. `SessionSummaryView` now renders `View in History` as a `variant="ghost"` button, visually subordinate to the primary follow-up actions.

### G9 — "Back to Summary" label implies backtracking

The label "Back to Summary" (code-verified at `question-page-client.tsx:118`) frames the action as regression — returning to a screen already visited. In the proposed Option A flow, the user hasn't visited Summary yet, making "Back to" factually wrong. Even in the current flow, the label encourages a mental model of looping rather than forward progression. Renaming to **"View Summary"** or **"Finish Review"** reframes the action as forward movement.

### G10 — Session Summary hydrates in two beats

The post-submit Summary does **not** arrive fully hydrated in one paint. `PracticeSessionPageView` switches to `SessionSummaryView` as soon as `props.summary` exists (`practice-session-page-view.tsx:116-123`), but the breakdown/CTA content depends on `summaryReview`. In the live walkthrough, the heading and stat cards appeared first, then the `Question breakdown` links and `Review your answers` CTA appeared after `summaryReview` resolved (`session-summary-view.tsx:22-32`, `75-127`).

This makes the current experience even more stats-first than a static screenshot suggests: the user first sees score tiles, then the review affordances hydrate a moment later.

### G11 — `Review your answers` is not the only path into explanations

The brainstorming claim that the CTA is the only route into explanations is inaccurate. `SessionBreakdownList` renders each question row as a direct review link when the question is available (`session-summary-view.tsx:92-99` + `session-breakdown-list.tsx:27-48`). The real friction is not button scarcity; it is that **any** explanation path requires a second action after submission.

### G12 — Question review currently has two separate "Back to Summary" exits

In the current summary-origin question review route, the same destination appears twice:
- top-right text link (`question-page-client.tsx:227-234`)
- bottom ghost action (`question-page-client.tsx:456-461`)

Any BS-058 implementation that renames or removes the summary exit needs to update **both** surfaces or intentionally collapse them into one.

---

## 6. Chosen Recommendation (Implemented)

**Option A (Inline Post-Exam Review Stage)** is the strongest choice despite larger scope, because:

1. It keeps the user on the same page — no jarring navigation after "Submit exam"
2. The navigator component already exists in the practice session page
3. It naturally addresses AF-6 (the practice session page controls what actions are available, not the shared question review route)
4. Session state (summary data) stays in memory — no need to refetch or pass via URL
5. The score banner + first question with feedback is the ideal "climactic reveal" moment
6. It lets us fix AF-6 and the duplicate summary exits at the same time, instead of carrying those quirks into a new route-based flow

**Important refinement:** do **not** preserve the current four-choice question-review footer by simply swapping `Try Again` for `View Summary`. That would keep most of the decision fatigue while only changing the label. The cleaner model is:
- top-right `View Summary` link from the start
- bottom bar centered on question-to-question movement and bookmarking
- final question uses a forward-completion CTA (`Finish review` or `View Summary`)

The implementation added a fourth state to `PracticeSessionPageView`:

```text
Pre-BS-058: active-question | review-and-submit | summary
Shipped:    active-question | review-and-submit | post-exam-review | summary
```

The shipped state transition is:
```text
onFinalizeReview():
  1. Call finalizeSession() → get summary data
  2. DON'T promote summary yet — store it aside
  3. Fetch review data (question details + feedback) for the completed session
  4. Enter post-exam-review stage
  5. User navigates questions, sees feedback
  6. User clicks "View Summary" → set summary → render SessionSummaryView
```

---

## 7. Resolved Product Decisions

| # | Question | Decision |
|---|----------|----------|
| Q1 | Should the score banner show accuracy + counts, or just the headline number? | **Compact.** Show something like `Score: 60% (3/5)` — concise but informative. |
| Q2 | Bulk fetch vs per-question fetch for feedback data? | **Bulk fetch.** One server call avoids loading spinners between reviewed questions. |
| Q3 | Should the post-exam review auto-start on Q1 or on the first incorrect question? | **Always Q1.** Predictable, linear, and avoids hidden ordering rules. |
| Q4 | Should the post-exam review be skippable from the start? | **Yes.** Keep `View Summary` visible from the beginning as a top-right escape hatch. Do not force completion. |
| Q5 | Should the question review route also suppress `Try Again` for exam sessions independently of BS-058? | **Yes.** AF-6 should be fixed independently as well, so reopened summary/history review paths do not keep reviving exam-inappropriate reattempt actions. |
| Q6 | Should the question breakdown in `SessionSummaryView` still show `Review your answers` after BS-058? | **Yes.** Keep `Review your answers` plus clickable question rows on the terminal summary for reopen and re-review scenarios. Summary is no longer the first post-submit surface, but it still needs re-entry paths. |
| Q7 | What happens on session reopen? | **Always show summary.** The post-exam review stage is ephemeral; a completed session reopens to Summary, matching tutor-mode expectations. |
| Q8 | Should AF-6 be replaced with a batch `Practice missed questions` CTA on Summary? | **Implemented, then removed by DEBT-324.** BS-058 briefly shipped this CTA, but post-ship audit confirmed it opened the user's global latest-visible incorrect Quick Practice pool rather than a session-scoped follow-up. |
| Q9 | Should `View in History` be deprioritized on the post-exam Summary? | **Yes.** Demote it to a subtle link; it is a power-user path, not the main post-exam outcome. |

---

## 8. Verification Notes

### Pre-implementation local Playwright walkthrough (2026-03-19)

A local Playwright walkthrough of the pre-BS-058 app was run against the checked-out code using the repo's Clerk E2E helpers. Screenshots were captured at each transition:

- `audit-screenshots/bs-058/01-practice-setup.png`
- `audit-screenshots/bs-058/02-q1-exam.png`
- `audit-screenshots/bs-058/03-q2-exam.png`
- `audit-screenshots/bs-058/04-review-and-submit.png`
- `audit-screenshots/bs-058/05-submit-confirm-modal.png`
- `audit-screenshots/bs-058/06-session-summary.png`
- `audit-screenshots/bs-058/07-question-review-q1.png`
- `audit-screenshots/bs-058/08-question-review-q2.png`
- `audit-screenshots/bs-058/09-session-summary-return.png`

Key confirmations from that historical walkthrough:

- After `Confirm submit`, the user lands on **Session Summary** before seeing explanations.
- `Review your answers` is **not** the only route into explanations; the question breakdown rows are also direct review links.
- `Back to Summary` returns to the same Summary screen already visited, producing the loop.
- `Finish exam` is visible in the header on every active exam question.
- The active exam navigator uses answered/unanswered styling, not correct/incorrect colors.
- The review-question navigator uses correctness colors (green/red/outline).
- The review screen shows **four bottom actions per question**, with the reattempt label varying by correctness:
  - Q1 in the walkthrough: `Practice Again`, `Bookmark`, `Next`, `Back to Summary`
  - Q2 in the walkthrough: `Previous`, `Try Again`, `Bookmark`, `Back to Summary`
- The review screen also duplicates the summary exit with a top-right `Back to Summary` link.

### Historical external review: Chrome Agent Walkthrough (2026-03-19)

An independent Claude-in-Chrome agent performed a full end-to-end exam walkthrough (2 questions, exam mode, submission through review). Its observations were verified against the codebase. Findings are integrated throughout this document. Key takeaways:

### Verified true positives (added to gotchas above)

- **AF-6 confirmed:** "Practice Again" / "Try Again" renders on every exam question review screen with zero suppression (`question-page-client.tsx:408-418`)
- **4-button decision fatigue in review:** Each question review screen shows 4 action buttons, creating choice overload at a moment when the user should focus on learning
- **Summary→Review→Summary loop:** Structural fact — the flow is a round-trip, not a funnel
- **"Back to Summary" label implies regression:** Confirmed exact label at `question-page-client.tsx:118`
- **"View in History" is low-value in post-exam context:** Leads to the same content via a longer path
- **Review & Submit and Session Summary are the visually similar pair:** This is the flatter transition, more than Summary vs Question Review

### Verified false positives (claims contradicted by code)

- **"All three CTAs have equal visual weight"** — FALSE. "Review your answers" uses `variant='default'` (filled primary button). "View in History" uses `variant='outline'`. "Back to Practice" is conditional: `variant='outline'` when "Review your answers" is present, `variant='default'` when it's not (i.e., no reviewable questions exist). When all three CTAs are visible, the hierarchy is correctly established (`session-summary-view.tsx:103-127`). The dark theme may reduce perceived contrast between filled and outline buttons, but the code is correct.
- **"No red/urgency for incorrect answers"** — FALSE. The breakdown list uses `text-destructive` (red) for "Incorrect" and `text-success` (green) for "Correct" (`session-breakdown-list.tsx:63-65`). Color coding exists and is correctly implemented.
- **"`Review your answers` is the only way into explanations"** — FALSE. The summary breakdown rows are also clickable review links (`session-summary-view.tsx:92-99` + `session-breakdown-list.tsx:27-48`).

### Historical suggestion later re-opened by debt audit

The Chrome agent proposed replacing per-question "Try Again" with a single **"Practice missed questions"** CTA on the Summary page, creating a new tutor-mode session filtered to incorrect questions only. BS-058 briefly shipped that CTA, but [DEBT-324](../debt/debt-324-session-scoped-practice-missed-questions.md) later removed it after confirming the link was misleading and not session-scoped.

### Disagreement on preferred option

The Chrome agent preferred a variant of **Option C** (single scrollable summary page with inline expandable explanations). This doc recommends **Option A** (separate post-exam review stage). The disagreement is acknowledged — Option C has the advantage of "one page, no navigation" simplicity, but fails to make feedback the default experience (stats still lead) and creates mobile UX issues at scale (10+ expandable cards).

### Current shipped verification (2026-03-19 code audit)

Current code confirms the implemented flow is now:

```text
Review & Submit → Submit exam → Post-Exam Review → View Summary / Finish review → Session Summary
```

Current-code confirmations:

- `PracticeSessionPageView` renders `PostExamReviewView` when `postExamSummary && postExamReview` are present, before `SessionSummaryView`
- `usePracticeSessionReviewStage` stores the finalized summary in `pendingExamSummary`, bulk-loads `GetCompletedSessionQuestionsWithFeedback`, and only promotes Summary on `onViewSummary()`
- `PostExamReviewView` keeps the bottom bar limited to `Previous`, `Bookmark`, `Next` / `Finish review`, with a separate top-right `View Summary` escape hatch
- `QuestionView` now suppresses reattempt for exam-owned review attempts
- `SessionSummaryView` no longer ships `Practice missed questions`; DEBT-324 removed that misleading shortcut after post-ship audit

---

## 9. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | Created BS-058 | Manual walkthrough revealed "summary sandwich" friction: feedback gated behind extra click, summary visited twice, visual confusion between screens |
| 2026-03-19 | Added Chrome agent review findings | Independent walkthrough confirmed AF-6, decision fatigue (4 buttons), loop structure, and "Back to Summary" regression label. Rejected false claims around CTA weight parity and missing color coding. Incorporated "Practice missed questions" batch CTA idea. |
| 2026-03-19 | Added local Playwright verification | Verified the live flow with captured screenshots, confirmed the summary hydration delay, confirmed duplicate summary exits on the question review screen, and corrected the claim that `Review your answers` is the only path into explanations. |
| 2026-03-19 | Finalized Q1-Q9 | No open product questions remained at implementation time. Chosen direction: Option A, compact score banner, bulk fetch, linear Q1 start, skippable review, standalone AF-6 suppression, terminal Summary, batch `Practice missed questions`, demoted `View in History`. |
| 2026-03-19 | Specified G1, G2, G6, G8 implementation details | G1: add `mode` prop to `QuestionNavigator` for correctness-based styling. G2: documented exact data gap (6 missing fields per question), specified bulk fetch use case shape. G6: split into three discrete fixes with suppression mechanism. G8: specified target variant (`ghost` or plain text link). |
| 2026-03-19 | Final accuracy audit after ship | Reframed the document so the original problem analysis reads as historical, added a current shipped-state section, recorded the AF-6 suppression as implemented, and linked DEBT-324 as the post-ship follow-up that re-opens the `Practice missed questions` decision. |
| 2026-03-19 | Implemented DEBT-324 follow-up | Removed the misleading `Practice missed questions` summary CTA after audit confirmed it opened the user's global latest-visible incorrect Quick Practice pool rather than a session-scoped follow-up. |
