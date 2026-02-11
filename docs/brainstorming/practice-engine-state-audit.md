# Practice Engine State Management Audit

**Date:** 2026-02-09
**Scope:** Complete practice engine — server to client, tutor and exam modes, Quick Practice and Session Practice
**Triggered by:** Manual testing revealing inconsistencies in answer persistence, navigation, and session lifecycle

---

## Executive Summary

The practice engine has **strong server-side guards** (idempotency, optimistic locking, duplicate submission prevention) but **weak client-side state management** for the active question-answering flow. Three core problems:

1. **Unsubmitted answer selections are silently lost** when navigating between questions
2. **Already-answered questions show stale UI** on re-navigation (no submitted answer restored, CONFLICT error on re-submit)
3. **"Next Question" uses first-unanswered logic, not sequential advance** — clicking "Next Question" without submitting can show the same question again

Additionally: sessions can be abandoned indefinitely, concurrent sessions are not prevented, and there is no "Previous Question" button.

---

## Architecture: How the Practice Engine Works (First Principles)

### Two Practice Modes

| Mode | Route | Session? | State Persistence | Navigator |
|------|-------|----------|-------------------|-----------|
| **Quick Practice** | `/practice/quick` | No | None (stateless, infinite stream) | No |
| **Session Practice** | `/practice/[sessionId]` | Yes | DB (`paramsJson.questionStates`) | Yes (exam mode) |

Both share core code: `question-flow-actions.ts`, `use-question-flow-core.ts`, `practice-view.tsx`.

### Server-Side State (Source of Truth)

Each session stores `paramsJson.questionStates[]` in the `practice_sessions` table:

```
Per question:
  questionId: string
  markedForReview: boolean
  latestSelectedChoiceId: string | null    ← "answered" = this is not null
  latestIsCorrect: boolean | null
  latestAnsweredAt: ISO datetime | null
```

Updated only on **explicit Submit** via `recordQuestionAnswer()` with optimistic locking (3 retries).

### Client-Side State (Ephemeral)

All question state is React state, reset on every navigation:

```
question: NextQuestion | null
selectedChoiceId: string | null          ← LOST on navigation
submitResult: SubmitAnswerOutput | null  ← LOST on navigation
loadState: LoadState
```

There is **no client-side cache or map** of previous answers. Navigation destroys all per-question state.

### "Next Question" Algorithm

When clicking "Next Question" (or on auto-advance in exam mode):

1. Client calls `getNextQuestion({ sessionId })` with **no questionId**
2. Server finds **first question where `latestSelectedChoiceId === null`** (in session order)
3. If all answered, returns `null` (UI shows "No more questions found")

This means: clicking "Next Question" without submitting shows **the same question again** (it's still the first unanswered).

### Navigation: "Next Question" vs Navigator Grid

| Action | Behavior |
|--------|----------|
| **"Next Question" button** | Server picks first unanswered question. No explicit `questionId` sent. |
| **Navigator grid click** | Client sends explicit `questionId`. Server loads that question regardless of answered state. |
| **Auto-advance (exam)** | Same as "Next Question" — server picks first unanswered. |

### No "Previous Question" Button

The UI has no back/previous button. The only way to revisit a question is the navigator grid (session mode only). Quick Practice has no back navigation at all.

---

## ~~Finding 1: Unsubmitted Answer Selections Are Silently Lost~~ (FIXED)

**Severity: P1 (High) — silent data loss from user's perspective**

> **Status: FIXED (verified 2026-02-10).** Draft selections are preserved + restored via `draftSelectedChoicesRef` (`app/(app)/app/practice/shared/use-question-flow-core.ts:63,139-141,156-160`).

### What happens

1. User selects answer "B" on question 3 (radio button click)
2. User navigates to question 5 via the navigator (without clicking Submit)
3. User navigates back to question 3
4. **Result:** Radio buttons are all unselected. "B" is gone.

### Why it happens

**Client-side:** `selectedChoiceId` lives in React state only. Every time `runLoadQuestionFlow` runs (on any question navigation), it resets state:

```
question-flow-actions.ts:42-46
  input.setLoadState({ status: 'loading' });
  input.setSelectedChoiceId(null);      // Selection lost
  input.setSubmitResult(null);
  input.setSubmitIdempotencyKey(null);
  input.setQuestionLoadedAt(null);
```

**Server-side:** The `NextQuestion` return type does NOT include previously selected choice info:

```
get-next-question.ts:129-142
  return {
    questionId, slug, stemMd, difficulty, choices,
    session: { sessionId, mode, index, total, isMarkedForReview }
    // latestSelectedChoiceId is NOT here
  };
```

Before submission, the selection exists only in React state. After submission, it exists in the DB but is never sent back to the client.

### Impact

- **Exam mode:** Users selecting answers on multiple questions then navigating around will lose unsubmitted selections. The navigator actively encourages this behavior.
- **Tutor mode:** Less impactful because users typically submit immediately, but the bug still exists.
- **Quick Practice:** Same bug exists in shared code, but no navigator means users are less likely to trigger it.
- **No warning:** The navigator buttons have zero guards — no confirmation dialog, no "unsaved changes" warning.

### What already works correctly

- Once an answer IS submitted, it persists to the database via `recordQuestionAnswer()`
- Submitted answers survive page refresh (session resumes from first unanswered question)
- The `selectChoiceIfAllowed` guard prevents changing a selection after submit

### Fix options

| Option | Approach | Effort | Trade-offs |
|--------|----------|--------|------------|
| **A** | **Warn before navigating away from unsubmitted selection** | Small | Still loses the selection, but user is informed |
| **B** | **Auto-save draft selection to client-side map** (React state, not DB) | Medium | Selections survive navigation within the session, but not page refresh |
| C | Persist draft selection to server (`questionStates.draftSelectedChoiceId`) | Large | Full persistence, survives refresh, but adds server round-trip per selection |
| D | Auto-submit on navigate (common in standardized testing platforms) | Medium | Changes exam semantics — user can no longer "skip" a question |

### Recommended: Option B (client-side draft map)

**Rationale:** Option A (warn) adds friction to every navigation — users will get fatigued clicking through dialogs. Option B is the right balance: a simple `Map<questionId, choiceId>` in React state (scoped to the session hook) preserves draft selections across navigation with zero server cost. It doesn't survive page refresh, but that's acceptable — users expect some state loss on refresh. The map is trivial to implement (add state, write on select, read on load) and aligns with how real testing platforms (USMLE, bar exam) handle draft answers.

Option C (server persistence) is over-engineered — it adds a round-trip on every radio button click. Option D (auto-submit) changes the fundamental semantics of "skipping" a question in exam mode.

---

## ~~Finding 2: Already-Answered Question Re-Navigation Shows Stale UI~~ (FIXED)

**Severity: P1 (High) — user hits cryptic CONFLICT error**

> Upgraded from P2. This is the most user-facing bug: user sees a "fresh" question, tries to answer it, and gets an error.

> **Status: FIXED (verified 2026-02-10).** `getNextQuestion` now returns `latestSelectedChoiceId` + `latestIsCorrect` in `NextQuestion.session` (`src/application/use-cases/get-next-question.ts:37-38,168-169`), and the client restores selection + answered state on load (`app/(app)/app/practice/shared/use-question-flow-core.ts:126-137`).

### What happens

1. User answers Q3 correctly in exam mode, auto-advanced to Q4
2. User clicks Q3 in the navigator to go back
3. UI shows Q3 as if it's unanswered — no selection, Submit button enabled
4. User selects an answer and clicks Submit
5. **Server throws CONFLICT** ("duplicate attempt") — user sees error card

### Root cause

`getNextQuestion.executeForSession` returns the question data but **doesn't return the existing answer state**. The `NextQuestion` type has no field for "this question was already answered with choice X".

The server already has `latestSelectedChoiceId` and `latestIsCorrect` in `questionStates` — it just never sends them to the client.

### What should happen

When loading an already-answered question:
- Radio should show the previously selected choice (pre-selected, disabled)
- Submit button should be hidden
- A label like "Answered" should appear
- In tutor mode: also show the explanation

### Fix options

| Option | Approach | Effort |
|--------|----------|--------|
| **A** | **Return `latestSelectedChoiceId` + `latestIsCorrect` from `getNextQuestion`, restore in client** | Medium |
| B | Block navigation to answered questions in the navigator (disable those buttons) | Small |
| C | Client-side answered map (track locally which questions were submitted) | Medium |

### Recommended: Option A (return answer state from server)

**Rationale:** The server is the source of truth for answered state. Returning `latestSelectedChoiceId` and `latestIsCorrect` in the `NextQuestion.session` object is a clean, minimal change that:

1. Lets the client know the question is already answered
2. Provides the selected choice to pre-fill the radio
3. Provides `isCorrect` to show correct/incorrect styling
4. Works correctly even after page refresh (server always has the data)

Option B (block navigation) is too restrictive — users should be able to review their answers. Option C (client map) doesn't survive refresh and duplicates server state.

**Implementation (two layers):**

1. **Application layer** (`get-next-question.ts`): Add `latestSelectedChoiceId` and `latestIsCorrect` to the `session` object of `NextQuestion`
2. **Client layer** (`question-flow-actions.ts`): On load, if `latestSelectedChoiceId` is present, pre-set `selectedChoiceId` and set an explicit `isAnswered` / `isLocked` flag — do NOT overload `submitResult` for this, because exam mode needs different semantics (no explanation shown) and tutor mode needs explanation replay. A dedicated flag keeps the state machine clean.

---

## ~~Finding 3: "Next Question" Shows Same Question When User Hasn't Submitted~~ (FIXED)

**Severity: P2 (Medium) — confusing behavior, not a data loss bug**

> **Status: FIXED (verified 2026-02-10).** "Next Question" now advances sequentially by sending `fromIndex` (`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:154-175`), which the server honors (`src/application/use-cases/get-next-question.ts:102,119-122`).

### What happens

1. User is on Q3, selects an answer but does NOT submit
2. User clicks "Next Question"
3. **Result:** Q3 loads again (the selection is lost, and it's the same question)

### Why it happens

"Next Question" calls `getNextQuestion({ sessionId })` with no `questionId`. The server finds the **first question where `latestSelectedChoiceId === null`**. Since Q3 was never submitted, Q3 is still the first unanswered — so the server returns Q3 again.

The client resets all state on load, so the user sees Q3 freshly loaded with no selection. From the user's perspective, "Next Question" did nothing.

### What should happen

"Next Question" should advance **sequentially** (current index + 1), not jump to first unanswered. The "first unanswered" logic makes sense only for resume-after-refresh, not for explicit "next" navigation.

### Fix options

| Option | Approach | Effort |
|--------|----------|--------|
| **A** | **Client sends `currentIndex + 1` as a hint to the server** | Small |
| B | Client navigates to `questionIds[currentIndex + 1]` directly (needs question ID list) | Medium |
| C | Keep first-unanswered logic but pair with Finding 1 fix (draft map means selection is preserved, so question becomes "answered" client-side) | Depends on F1 |

### Recommended: Option A (sequential advance hint)

**Rationale:** The cleanest fix is to pass the current question index to the server and let it return the next question in sequence (wrapping or stopping at the end). This is what users expect from "Next Question" — go to the next one, not jump to some other unanswered question.

The server already knows `questionIds` order and `session.questionStates`. Adding a `fromIndex` parameter to `getNextQuestion` that says "start searching from this index + 1" is minimal. The existing "first unanswered from beginning" logic remains the default for initial load / resume.

---

## ~~Finding 4: Session Abandonment — Sessions Stay in_progress Forever~~ (FIXED)

**Severity: P2 (Medium) — data integrity issue, no user-facing error**

> **Status: FIXED (verified 2026-02-10).** Backend guard added in `start-practice-session.ts` — rejects with CONFLICT if an incomplete session exists. The UI incomplete session card + backend guard together prevent accumulation.

### What happens

1. User starts a 20-question exam session
2. User closes the browser tab at question 6
3. The session row stays `endedAt = NULL` in the database forever
4. User can return to the session URL and resume (via `GetIncompletePracticeSessionUseCase`)
5. But there is no timeout — a session started 6 months ago is still "in progress"

### Why it happens

`StartPracticeSessionUseCase` creates a new session unconditionally — no backend guard checks for existing incomplete sessions. `GetIncompletePracticeSessionUseCase` finds only the latest incomplete session. Older abandoned sessions are orphaned.

> **Note (2026-02-09):** The UI already partially mitigates this. `practice-page-client.tsx:18-21` hides the session starter when an incomplete session exists, showing "Resume or abandon your current session to start a new one" with explicit Resume/Abandon buttons (incomplete-session-card.tsx). However, this is a **soft UI-only constraint** — the backend has no validation, so API callers or race conditions could still create duplicate incomplete sessions.

### Fix options

| Option | Approach | Effort |
|--------|----------|--------|
| **A** | **Backend guard in `StartPracticeSessionUseCase` — reject or auto-end existing incomplete before creating new** | Small |
| B | Auto-end sessions after 24h via background job | Medium |
| C | Add "End session" button to Recent Sessions panel for incomplete sessions | Small |

### Recommended: Option A (backend guard on new session start)

**Rationale:** The UI prevention is good but insufficient — it's a soft constraint that can be bypassed. Adding a backend guard in `StartPracticeSessionUseCase.execute()` makes the invariant airtight. Two sub-options:

- **A1 (strict):** Check for incomplete sessions and throw CONFLICT if one exists — forces explicit abandon first. This matches the existing UI flow.
- **A2 (auto-end):** Auto-end any existing incomplete sessions before creating a new one. Simpler but could surprise users who expected to resume.

Option A1 is preferred since the UI already enforces the abandon-first pattern. The backend guard just hardens it.

Option C (UI button) is a nice addition but doesn't prevent the accumulation problem. Option B (background job) is infrastructure overhead for a problem that can be solved at the application layer.

---

## Finding 5: Concurrent Sessions Not Prevented

**Severity: P3 (Low) — unlikely but possible**

### What happens

A user could (via direct URL manipulation or race condition) have multiple `endedAt = NULL` sessions simultaneously. No database constraint or application guard prevents this.

### Recommended fix

**Partial unique index:** `UNIQUE(userId) WHERE endedAt IS NULL` — one incomplete session per user at the database level. Combined with Finding 4's guard in the use case, this becomes airtight.

**Rationale:** Belt and suspenders. The use-case guard (Finding 4) handles the normal case. The DB constraint handles the race condition case. Both are small changes.

---

## Finding 6: Page Refresh Loses Navigator Position

**Severity: P3 (Low) — mostly acceptable, but worth documenting**

### Current behavior

On page refresh: all React state is destroyed. Page re-mounts, loads first unanswered question. If the user was on Q15 and answered Q1-Q14 sequentially, they land on Q15 (correct). If they were jumping around via navigator, they land on the first unanswered (could be Q3).

### Recommended: Defer (acceptable for now)

**Rationale:** The first-unanswered-on-refresh behavior is correct for sequential answering (the common case). The navigator-jumping case is uncommon enough that this is low priority. If we implement Finding 3 (sequential "Next" advance), we could also store `lastViewedQuestionId` in session state, but that's a separate enhancement.

---

## ~~Finding 7: Exam Auto-Advance Fires Wasteful Server Call on Last Question~~ (FIXED)

**Severity: P3 (Low) — one wasted server round-trip, no user-facing error**

> **Status: FIXED (verified 2026-02-10).** `isLastQuestion` guard added at `practice-session-page-logic.ts:141-146`. When `sessionInfo.index >= sessionInfo.total - 1`, auto-advance returns early — no wasteful server call.

> **Correction (2026-02-09):** Originally described as a "loop." Verified that no loop occurs — `submitResult` is reset to `null` during the load (question-flow-actions.ts:44), which breaks the effect dependency chain. The auto-advance guard `if (!input.submitResult) return` (practice-session-page-logic.ts:131) prevents re-advancing. The issue is a single wasteful `getNextQuestion` call on the last question, not a loop.

### What happens

When submitting the last question in exam mode:
1. `maybeAutoAdvanceAfterSubmit` fires in the effect hook (use-practice-session-page-controller.ts:45-60)
2. Calls `onNextQuestion()` which calls `getNextQuestion()`
3. Server returns `null` (all answered) — **this call was unnecessary**
4. UI shows "No more questions found"
5. The effect runs again because `submitResult` changed (was set to `null` during load), but the guard prevents another `advance()` call

### Root cause

The auto-advance logic (`practice-session-page-logic.ts:123-133`) doesn't check whether the current question is the last one before calling `advance()`. On the last question, this results in one wasted server round-trip that always returns `null`.

### Recommended: Add guard before advance

Check `sessionInfo.index < sessionInfo.total - 1` before calling `advance()`. Prevents the unnecessary server call on the last question.

---

## ~~Finding 8: Navigator Not Updated After Mark-for-Review Toggle~~ (INVALID)

**Status: INVALID (verified 2026-02-09)**

> **Correction:** This finding was verified against the current source code and found to be **incorrect**. The navigator DOES refresh after a mark-for-review toggle. The data flow is:
>
> 1. Mark toggle succeeds → `applySessionInfo()` updates `sessionInfo.isMarkedForReview` (use-practice-session-mark-for-review.ts:103-109)
> 2. `applySessionInfo` calls `setSessionInfo()` (use-practice-session-question-flow.ts:128-132)
> 3. `sessionInfo` is in the navigator effect's dependency array (use-practice-session-navigator.ts:58)
> 4. Effect re-runs → navigator refreshes → pink dot appears
>
> This finding may have reflected an older version of the code. No fix needed.

---

## Finding 9: Client Can Attempt Submit on Ended Session (No Client Guard)

**Severity: P3 (Low) — server catches it, but UX is poor**

### What happens

If a session ends (from another tab, or session state becomes stale), the client UI still allows selecting choices and clicking Submit. The server correctly rejects with CONFLICT, but the user sees a loading spinner followed by a cryptic error.

### Root cause

`canSubmitAnswer()` checks `loadState`, `question`, `selectedChoiceId`, and `submitResult` — but not whether the session is still active. The client has no mechanism to detect session end from another tab.

### Recommended: Defer (acceptable for now)

**Rationale:** Multi-tab session management is a complex problem. The server guard is solid. The error message could be improved ("This session has already ended" instead of a generic error), but adding cross-tab session detection (BroadcastChannel, polling) is over-engineered for the current user base.

---

## Finding 10: Subscription Expiry Mid-Session Not Handled Gracefully

**Severity: P3 (Low) — edge case, but real for month-to-month users**

### What happens

1. User starts exam session with active subscription
2. Subscription expires mid-session (payment lapsed)
3. Next server action (`getNextQuestion` or `submitAnswer`) calls `requireEntitledUserId()`, which throws
4. User sees entitlement error
5. Session is orphaned — can't submit, can't end cleanly

### Recommended: Defer (acceptable for now)

**Rationale:** This is an edge case (subscription expires during the exact window of a practice session). The current behavior — showing an error — is acceptable. A graceful handling would allow finishing an in-progress session even after subscription lapses, but that requires changing the entitlement check to allow "in-session" users, which is a broader design decision.

---

## ~~Finding 11: Session Start Button Never Shows Loading State~~ (FIXED)

**Severity: P1 (High) — allows double-click, no visual feedback**

> **Status: FIXED (verified 2026-02-10).** `startSession()` sets `sessionStartStatus` to `loading` immediately (`app/(app)/app/practice/practice-page-session-start.ts:57`), and `PracticeSessionStarter` disables + shows "Starting…" based on `sessionStartStatus === 'loading'` (`app/(app)/app/practice/components/practice-session-starter.tsx:204-207`).

### What happens

1. User clicks "Start session" on the practice landing page
2. Button never shows "Starting..." or becomes disabled
3. User can click again (and again) before navigation completes

### Root cause (historical)

The button state was not driven by the async session start flow, so users got no visual feedback that their click was registered.

### Fix (implemented)

- `startSession()` sets `sessionStartStatus` to `'loading'` immediately (`app/(app)/app/practice/practice-page-session-start.ts:57`).
- `PracticeSessionStarter` uses `sessionStartStatus === 'loading'` to disable the button and render the loading label (`app/(app)/app/practice/components/practice-session-starter.tsx:204-207`).

---

## ~~Finding 12: Choices Still Clickable After Exam Mode Submit~~ (FIXED)

**Severity: P1 (High) — misleading UI, user thinks they can change answer**

> **Status: FIXED (verified 2026-02-10).** `practice-view.tsx:88` now computes `isAnswerLocked = props.isAnswered || props.submitResult !== null` and passes it to `QuestionCard` disabled prop. Choices are disabled after submit in all modes.

### What happens

1. User in exam mode selects choice A and submits
2. Submit succeeds, auto-advance fires
3. If user clicks on Q3 in navigator before auto-advance completes, choices are still clickable
4. User can select a different choice — UI shows it as selected
5. But the answer is already locked server-side

### Root cause

In `question-card.tsx:58`, choice buttons are disabled when:

```
disabled={disabled || correctChoiceId !== null}
```

In exam mode, `practice-view.tsx:84-86` sets `correctChoiceId` to `null` (because exam shouldn't reveal the correct answer). So the second condition is always false in exam mode — choices are never disabled after submit.

The `submitResult` exists (answer was accepted), but the choice buttons don't check `submitResult` for disabling — they only check `correctChoiceId`.

### Recommended fix

Add a `submitted` or `isAnswered` prop to `QuestionCard` that disables all choices regardless of mode. Or: pass `submitResult !== null` as part of the `disabled` prop.

---

## ~~Finding 13: Server Returns `correctChoiceId` to Client in Exam Mode~~ (FIXED)

**Severity: P1 (High) — exam integrity issue for medical education app**

> **Status: FIXED (verified 2026-02-10).** `submit-answer.ts:169` now applies `shouldShowExplanation` guard: `correctChoiceId: shouldShowExplanation ? grade.correctChoiceId : null`. In exam mode, `correctChoiceId` is withheld from the HTTP response.

### What happens

`submit-answer.ts:166-172` always returns `correctChoiceId` in the response:

```
return {
  attemptId: attempt.id,
  isCorrect: grade.isCorrect,
  correctChoiceId: grade.correctChoiceId,  // ← ALWAYS returned
  explanationMd,  // ← correctly nulled in exam mode
  choiceExplanations,  // ← correctly emptied in exam mode
};
```

The frontend hides it via `practice-view.tsx:84-86` by passing `null` to `QuestionCard`. But the data is in the HTTP response — visible in browser DevTools Network tab.

### Why it matters

This is a medical education exam platform. `explanationMd` and `choiceExplanations` are correctly withheld. But `correctChoiceId` uses the same `shouldShowExplanation` decision logic and should be withheld too. A motivated student could open DevTools, read the response, and know the correct answer for every question before ending the exam.

### Recommended fix

In `submit-answer.ts`, apply the same `shouldShowExplanation` guard to `correctChoiceId`:

```
correctChoiceId: shouldShowExplanation ? grade.correctChoiceId : null,
```

The frontend already handles `null` — it passes `correctChoiceId` as `null` in exam mode regardless.

---

## Finding 14: Exam Review Data Stale After Changing Answer from Review

**Severity: P2 (Medium) — user sees inconsistent data**

### What happens

1. User in exam review sees Q3 as "Unanswered"
2. User clicks Q3 to open it from review
3. User selects and submits an answer
4. User clicks "Review answers" again
5. **Review still shows Q3 as "Unanswered"** (old data)

### Root cause

`use-practice-session-review-stage-state.ts:93-101` — when opening a question from review:

```
const onOpenReviewQuestion = useCallback((questionId: string): void => {
  setReview(null);  // ← clears review
  setReviewLoadState({ status: 'idle' });
  setIsInReviewStage(true);
  input.loadSpecificQuestion(questionId);
}, [input.loadSpecificQuestion]);
```

The review is cleared when opening a question. But when the user ends up back at the review stage (after answering), `loadReview()` is called again — the issue is that `onEndSession` calls `loadReview()`, but returning from a single question doesn't reliably trigger a fresh review load.

### Recommended fix

After submitting an answer from a review-opened question, trigger `loadReview()` before showing the review screen again.

---

## Finding 15: "No More Questions Found" Dead-End State

**Severity: P2 (Medium) — user has no navigation options**

### What happens

When all questions are answered and `question === null`, `practice-view.tsx:180-184` shows:

```
"No more questions found."
```

But the action buttons (Submit, Next, Bookmark, etc.) are only rendered when `question !== null` (line 213). The "End session" button in the header IS still visible, but the main content area has zero action buttons. The user may not notice the small header button.

### Recommended fix

When `question === null` and we're in session mode, show an explicit "Review answers" or "End session" button in the main content area — not just the header.

---

## Finding 16: End Session Blocked During Bookmark Operations

**Severity: P2 (Medium) — user can't exit when bookmark is slow**

### What happens

The "End session" / "Review answers" button in `practice-view.tsx:128-136` is disabled when `isPending` is true. But `isPending` is shared between bookmark toggling and answer submission. If a bookmark toggle is slow (network latency), the user can't end their session.

### Recommended fix

Separate `isPending` into `isSubmitPending` and `isBookmarkPending`. Only disable "End session" during answer submission, not during bookmark operations.

---

## Finding 17: Double-Click "Submit Exam" in Review

**Severity: P2 (Medium) — UX issue, idempotency protects data**

### What happens

In `exam-review-view.tsx:193-203`, the "Confirm submit" button in the AlertDialog:

```
<AlertDialogAction
  disabled={isPending}
  onClick={() => {
    if (isPending) return;
    onFinalizeReview();
  }}
>
```

There's a race window between the click and React updating `isPending` to true. Fast double-clicks can fire `onFinalizeReview()` twice. The idempotency key prevents duplicate end-session on the server, but the user may see confusing loading/error states.

### Recommended fix

Use a ref-based guard: `if (isFinalizingRef.current) return;` before `onFinalizeReview()`.

---

## Finding 18: No Warning When Submitting Exam with Unanswered Questions

**Severity: P2 (Medium) — accidental incomplete submission**

### What happens

In exam review, the "Submit exam" button is always enabled regardless of how many questions are answered. The review shows "Answered: 5 / Unanswered: 15" but the user can submit immediately.

### Current state

The review stats are displayed, but there's no confirmation or warning saying "You have 15 unanswered questions. Are you sure?"

### Recommended fix

Add a warning in the confirmation dialog when `answeredCount < totalCount`: "You have X unanswered questions that will be scored as incorrect."

---

## Finding 19: Loading State Missing `aria-live`

**Severity: P2 (Medium) — accessibility gap**

### What happens

`practice-view.tsx:169-173` uses `<output>` for loading state but doesn't set `aria-live`:

```
<output>Loading question...</output>
```

The description on line 122 correctly uses `aria-live="polite"`, but the loading state doesn't. Screen readers won't announce the loading/ready transition.

### Recommended fix

Add `aria-live="polite"` to the loading output element. Consistent with the existing pattern on line 122.

---

## Finding 20: Bookmark Error Card Never Auto-Dismisses

**Severity: P2 (Medium) — persistent error clutters UI**

### What happens

When `bookmarkStatus === 'error'`, `practice-view.tsx:176-178` shows:

```
{props.bookmarkStatus === 'error' ? (
  <ErrorCard>Bookmarks unavailable.</ErrorCard>
) : null}
```

This error card persists on screen with no way to dismiss it and no retry mechanism visible in the card itself. Even if the user successfully bookmarks on a subsequent attempt (bookmark status resets), the card only disappears on the next render cycle.

### Recommended fix

Either auto-dismiss after 5 seconds, or add a "Retry" button on the error card.

---

## Finding 21: sessionInfo Cleared When getNextQuestion Returns Null

**Severity: P2 (Medium) — exam session mis-labeled as tutor, navigator drops**

> **Added (2026-02-09):** Discovered during verification pass. Not in original audit.

### What happens

1. User in exam mode answers the last question
2. Auto-advance fires, `getNextQuestion` returns `null` (all answered)
3. `sessionInfo` is set to `null` because `onLoaded` receives `null`
4. `practice-session-page-view.tsx:110` defaults: `const mode = props.sessionInfo?.mode ?? 'tutor'` — exam session now shows as "Tutor Session"
5. `practice-session-page-logic.ts:196` early-returns when `!sessionInfo` — navigator is cleared

### Root cause

In `question-flow-actions.ts:52-53`, the `onLoaded` callback unconditionally overwrites `sessionInfo`:

```
onLoaded: (question) => {
  input.setSessionInfo(question?.session ?? null);
},
```

When `question` is `null`, `sessionInfo` becomes `null`. The function doesn't distinguish between "no question available" (sessionInfo should persist) and "fresh question loaded" (sessionInfo should update).

### Impact

- **Exam mode end-of-session:** Title changes from "Exam Session" to "Tutor Session", navigator disappears
- **"No more questions" state:** Already missing action buttons (Finding 15), now also loses session context
- **Exam review flow:** If user navigates to review from this state, the mode is wrong

### Recommended fix

Preserve `sessionInfo` when `question` is `null`. In `question-flow-actions.ts`, change the `onLoaded` callback to only update `sessionInfo` when a question is actually returned:

```
onLoaded: (question) => {
  if (question) {
    input.setSessionInfo(question.session);
  }
  // When question is null, keep existing sessionInfo
},
```

This ensures session mode, index, total, and other metadata persist through the end-of-session transition.

---

## Verified: What Works Well

These areas are solid and well-guarded:

| Area | Guard | Evidence |
|------|-------|----------|
| Duplicate submission | DB unique index + idempotency key + optimistic locking | BUG-105, `practice-session-question-state-updater.ts` |
| Submit after session end | Application check + repository WHERE clause | `submit-answer.ts:90-92`, `question-state-updater.ts:39-41` |
| End session twice | Idempotency + WHERE clause + double-check pattern | `drizzle-practice-session-repository.ts:200-232` |
| Question unavailability | `findPublishedById` throws NOT_FOUND, UI shows error | `get-next-question.ts:124-127` |
| Mark for review in tutor mode | Use case throws CONFLICT, UI hides button | `set-practice-session-question-mark.ts:30-35` |
| Explanation visibility | Domain function `shouldShowExplanationForMode` | Tutor: always; Exam: only after `endedAt` set |
| Out-of-order responses | Request sequence ID guards | BUG-085 fix |
| Stale closure prevention | React ref-based `isMounted` checks | BUG-083 fix |
| Choice selection after submit | `selectChoiceIfAllowed` returns early if `submitResult` exists | `question-guards.ts:3-10` |
| Concurrent mark-for-review | `isMarkingRef.current` prevents double calls | `use-practice-session-mark-for-review.ts:57-65` |
| Concurrent answer submission | `canSubmit` disabled during `isPending` | `practice-view.tsx:196-200` |
| Optimistic locking (DB) | JSON equality WHERE clause + 3 retries | `practice-session-question-state-updater.ts` |
| Attempt rollback on session update failure | Deletes orphaned attempt if session state update fails | `submit-answer.ts:124-156` |

---

## Priority Summary & Implementation Order

> **Verified 2026-02-10** via source audit (and Playwright E2E audit of running app). Findings 1, 2, 3, 4, 7, 11, 12, 13, and 21 have been fixed since this doc was written. Updated table below.

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| ~~2~~ | ~~Already-answered question shows stale UI~~ | ~~P1~~ | **FIXED** | Answer state returned + restored (`latestSelectedChoiceId`, `latestIsCorrect`) |
| ~~1~~ | ~~Unsubmitted selections silently lost~~ | ~~P1~~ | **FIXED** | Client-side draft map restores selection across navigation |
| ~~11~~ | ~~Session start button never shows loading~~ | ~~P1~~ | **FIXED** | `sessionStartStatus === 'loading'` drives button disabled + label |
| ~~12~~ | ~~Choices clickable after exam submit~~ | ~~P1~~ | **FIXED** | `isAnswerLocked = isAnswered \|\| submitResult !== null` now disables choices |
| ~~13~~ | ~~Server returns correctChoiceId in exam~~ | ~~P1~~ | **FIXED** | `correctChoiceId: shouldShowExplanation ? ... : null` in `submit-answer.ts:169` |
| ~~21~~ | ~~sessionInfo cleared when question is null~~ | ~~P2~~ | **FIXED** | `if (!question?.session) return;` guard in `practice-session-page-logic.ts:59` |
| ~~3~~ | ~~"Next Question" shows same question~~ | ~~P2~~ | **FIXED** | Sequential advance via `fromIndex` hint |
| ~~4~~ | ~~Sessions stay in_progress forever~~ | ~~P2~~ | **FIXED** | Backend guard in `start-practice-session.ts` rejects if incomplete exists |
| ~~8~~ | ~~Navigator not updated after mark toggle~~ | ~~P2~~ | **INVALID** | Navigator already refreshes via sessionInfo dependency |
| 5 | Concurrent sessions not prevented | **P3** | **OPEN** | Deferred — app-layer guard already prevents, DB hardening optional |
| ~~7~~ | ~~Auto-advance wasteful call on last question~~ | ~~P3~~ | **FIXED** | `isLastQuestion` guard in `practice-session-page-logic.ts:141-146` |
| 6 | Page refresh loses position | **P3** | Defer | — |
| 9 | Client can attempt submit on ended session | **P3** | Defer | — |
| 10 | Subscription expiry mid-session | **P3** | Defer | — |

### Remaining implementation order

**Phase 1 (P3 hardening — deferred):**
1. Finding 5: Partial unique DB index for concurrent sessions (optional)

---

## Files Involved

### Application Layer (use cases)
| File | Role | Needs Change |
|------|------|------|
| `src/application/use-cases/get-next-question.ts` | Returns next question data (now includes answer state for session questions) | No (F2 fixed) |
| `src/application/use-cases/submit-answer.ts` | Persists answer — has all guards | No |
| `src/application/use-cases/start-practice-session.ts` | Creates session — rejects if incomplete exists | No (F4 fixed) |
| `src/application/use-cases/get-incomplete-practice-session.ts` | Finds latest incomplete — returns only one | No |
| `src/application/use-cases/end-practice-session.ts` | Ends session — fully guarded | No |
| `src/application/use-cases/set-practice-session-question-mark.ts` | Mark for review — exam only | No |

### Client State Management
| File | Role | Needs Change |
|------|------|------|
| `app/(app)/app/practice/shared/question-flow-actions.ts` | Core load/submit orchestration | No (F1/F2/F21 fixed) |
| `app/(app)/app/practice/shared/use-question-flow-core.ts` | Core state + draft/restore behavior | No (F1/F2 fixed) |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | Session orchestration — auto-advance, navigator, review | No (F3/F7 fixed) |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` | Hook wiring — navigate handler | No (F3 fixed) |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` | Controller — wires auto-advance | No (F7 fixed) |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts` | Mark toggle handler | No (F8 invalidated — navigator already refreshes) |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-navigator.ts` | Navigator effect | No (F8 invalidated) |

### Domain Layer
| File | Role | Needs Change |
|------|------|------|
| `src/domain/value-objects/practice-mode.ts` | `shouldShowExplanationForMode` | No |
| `src/domain/services/session.ts` | `shouldShowExplanation`, `computeSessionStats` | No |

### Infrastructure
| File | Role | Needs Change |
|------|------|------|
| `db/schema.ts` | DB schema | **Yes** (F5: partial unique index) |

---

## Relationship to Other Work

- **PR #84** (session view layout): Visual fixes only — doesn't touch state management
- **SPEC-020** (practice engine completion): Marked as implemented — these are post-implementation bugs
- **BUG-105** (duplicate submissions): Already fixed — the DB guard works, but Finding 2 fixes the UX gap
- **DEBT-107** (question engine E2E): Accepted — should cover these scenarios when E2E is expanded
- **Quick Practice** shares core code (`question-flow-actions.ts`) — Findings 1 and 2 fixes will benefit both modes automatically
