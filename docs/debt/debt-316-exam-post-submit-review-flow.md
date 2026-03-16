# DEBT-316: Exam Session UX — Missing Explicit Review CTA and Review-Stage Navigation Gaps

**Priority:** P2
**Created:** 2026-03-15
**Status:** Open
**Source:** Manual QA + browser walkthrough, corrected by code audit, verified by second browser pass (2026-03-16)
**Scope:** Practice-session exam flow, with tutor-mode comparison where relevant

---

## Audit Status

This debt doc was corrected after tracing the actual codepaths. The initial browser-only writeup overstated the post-submit problem:

- The app **does not** hard-dead-end after exam submit.
- The Session Summary already renders **clickable question review links** once `summaryReview` finishes loading.
- The History page already lets the user click the **session row itself** to open review; chevron expansion is optional.

The real debt is narrower and more important:

1. The exam Session Summary has **no explicit primary CTA** that says "review your answers".
2. The only in-summary review affordance is a **lazy-loaded, visually subordinate** breakdown list with **no visual link styling** (no underline, no color differentiation — confirmed by browser verification).
3. Opening a question from the **pre-submit review checklist** drops the user into a stripped-down question view with no navigator and no Previous/Next context.
4. After the last exam answer is submitted, the bottom bar offers **no obvious finish/review CTA**.
5. Summary breakdown review links have a **broken return path** — browser back or "Back to Session" link lands on a dead-end "No more questions" state because the practice session page's summary state is not URL-addressable (Root Cause E).
6. Summary-review fetch failure shows an error with **no retry button**, leaving the user with only off-screen escape hatches (Root Cause F).

---

## Verified Current Behavior

### Tutor Mode

Normal tutor flow:

```text
Answer question -> explanation shown inline -> End session -> Session Summary
```

Code path:

- `PracticeSessionPageView` labels the header action `End session` in tutor mode: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:181-236`
- `onEndSession` finalizes tutor sessions directly when `sessionMode !== 'exam'` and the user is not already in review stage: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:150-160`
- After summary render, `createSummaryReviewEffect()` loads `getPracticeSessionReview()` and `SessionSummaryView` passes the rows into `SessionBreakdownList`: `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:284-343`, `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:71-95`

Implication:

- Tutor users already saw explanations inline.
- Tutor summary still gets per-question review links after the secondary review fetch completes.
- Tutor mode does **not** need the same priority fix as exam mode.

### Exam Mode

Normal exam flow:

```text
Answer question -> auto-advance until final question -> Review answers
-> Review Questions checklist -> Submit exam -> Confirm submit
-> Session Summary -> lazy-loaded Question breakdown links
```

Code path:

- Exam sessions label the header action `Review answers`: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:181-236`
- Clicking that action routes exam users into `loadReview()` instead of finalizing immediately: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:150-157`
- The checklist is `ExamReviewView`, which renders row-level `Open question` buttons plus `Submit exam`: `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:107-238`
- Confirming submit calls `onFinalizeReview()`, which clears the review state and then ends the session: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:143-148`
- `endSession()` stores the summary, and `createSummaryReviewEffect()` then performs a second `getPracticeSessionReview()` fetch for the summary breakdown: `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:166-218`, `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:284-343`

Implication:

- Exam users are shown a summary first, not an explicit review CTA.
- Review is already technically available from that summary, but only through the lazy-loaded breakdown list.

---

## Claim-by-Claim Audit

### 1. Post-submit dead-end / "the only way to review is 4 clicks through History"

**Verdict:** Inaccurate as written.

What is true:

- `SessionSummaryView` renders only three explicit action buttons: `Back to Dashboard`, `View in History`, and `Start another session`: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:98-106`
- There is **no dedicated summary CTA** labeled for answer review.

What is false:

- The Session Summary is **not** review-inert after the secondary review fetch succeeds.
- `SessionSummaryView` renders `SessionBreakdownList` when `summaryReview` is available: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:88-95`
- `SessionBreakdownList` wraps each available question stem in a review `Link` built with `toQuestionRoute(..., { from: 'practice', mode: 'review', sessionId })`: `app/(app)/app/shared/components/session-breakdown-list.tsx:34-48`
- Existing tests already assert those review links exist and include `sessionId` when provided: `app/(app)/app/shared/components/session-breakdown-list.test.tsx:66-107`

Also false (with qualification):

- History does **not** require chevron expansion to reach review — **when `firstQuestionSlug` is present**.
- The History Sessions tab links the session summary row to the first question review route, and row click pushes that route: `app/(app)/app/history/components/history-sessions-tab.tsx:167-205`
- However, `firstQuestionSlug` can be `null` (e.g., if all questions in a session have been deleted): `src/application/use-cases/get-session-history.ts:86`. In that case, the row is **not** clickable and the non-interactive case is tested: `app/(app)/app/history/components/history-sessions-tab.test.tsx:324`

Corrected description:

- The problem is **discoverability and prominence**, not total absence of a review path.
- Shortest supported path from Session Summary to review is currently **1 click** once the breakdown loads.
- If the user chooses History, it is **2 clicks** from the summary (`View in History` -> session row), not 4.
- If the secondary summary-review fetch fails, the screen falls back to generic CTAs plus an error message, so History becomes the only remaining path from that screen.

### 2. "Session Summary question breakdown rows are not clickable"

**Verdict:** False.

Evidence:

- Available rows are linked in `SessionBreakdownList`: `app/(app)/app/shared/components/session-breakdown-list.tsx:34-48`
- The test suite explicitly checks the generated `href`: `app/(app)/app/shared/components/session-breakdown-list.test.tsx:66-107`

Correction:

- The main text portion of each available row is clickable.
- The entire row is **not** a single tap target; the status label sits outside the link: `app/(app)/app/shared/components/session-breakdown-list.tsx:59-71`
- That is a weaker affordance than a primary CTA, but it is not "non-clickable".

Browser verification (2026-03-16):

- A second browser walkthrough confirmed the links are real `<a>` elements with correct `href` attributes.
- However, the links have **no visual link affordance**: no underline, no color differentiation from body text (`color: rgb(237, 237, 237)`, same as surrounding text), no hover underline. The only interactive hint is `cursor: pointer` on hover.
- This means the links are functionally present but **visually invisible as interactive elements** — reinforcing why the first browser audit and real users would miss them entirely.

### 3. No bottom-bar "Finish Exam" / "Review answers" CTA after the last answer

**Verdict:** Accurate.

Evidence:

- The only exam end-of-session CTA is the header button labeled `Review answers`: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:235-236`, `app/(app)/app/practice/components/practice-view.tsx:157-166`
- The bottom bar hides `Submit` once `submitResult` exists: `app/(app)/app/practice/components/practice-view.tsx:301-310`
- The bottom bar hides `Next` when `hasNextQuestion === false`: `app/(app)/app/practice/components/practice-view.tsx:312-324`

Result on the last answered exam question:

- Bottom bar: `Previous` (if available), `Bookmark`, `Mark for review`
- Not in bottom bar: no `Submit`, no `Next`, no explicit `Finish exam`, no explicit `Review answers`

Root cause:

- The finishing action exists, but only in the header.
- The bottom-action conditional logic never swaps in an end-of-exam CTA.

### 4. "Open question" from pre-submit review loses navigation context

**Verdict:** Accurate, with one wording correction.

Evidence:

- `onOpenReviewQuestion()` clears the checklist data, keeps `isInReviewStage = true`, and loads a specific question into the practice surface: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:133-140`
- `createNavigatorEffect()` clears the in-session navigator whenever `isInReviewStage` is true: `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:220-238`
- `PracticeSessionPageView` only renders the top `QuestionNavigator` when `navigator` is present: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:197-220`
- With `navigator === null`, both `previousQuestionId` and `nextQuestionId` collapse to `null`: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:67-99`
- `PracticeView` therefore renders placeholder spans instead of `Previous`/`Next`: `app/(app)/app/practice/components/practice-view.tsx:283-324`

The button-state correction:

- For already-answered exam questions, `GetNextQuestionUseCase` returns `latestSelectedChoiceId` but no `previousSubmission`: `src/application/use-cases/get-next-question.ts:208-230`
- `useQuestionFlowCore` syncs that into `isAnswered = true` and `submitResult = null`: `app/(app)/app/practice/shared/use-question-flow-core.ts:150-178`
- `PracticeView` locks the choices when `isAnswered` is true: `app/(app)/app/practice/components/practice-view.tsx:247-263`
- The per-question `Submit` button still renders when `submitResult` is null, but it is disabled because `canSubmit` is false: `app/(app)/app/practice/shared/use-question-flow-core.ts:99-107`, `app/(app)/app/practice/components/practice-view.tsx:301-309`

Corrected description:

- The user is not completely stranded because the header still offers `Review answers`, which reloads the checklist: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:150-157`
- But the user does lose the navigator, Previous/Next, and a strong sense of context.
- The earlier writeup should say the per-question `Submit` is **disabled**, not absent.

### 5. Auto-advance after submit has no durable feedback

**Verdict:** Partially accurate — overstated in original writeup.

Evidence:

- `usePracticeSessionPageController.onSubmit()` awaits the submit call and immediately invokes `maybeAutoAdvanceAfterSubmit()`: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:60-71`
- `maybeAutoAdvanceAfterSubmit()` calls `advance()` immediately for non-final exam questions when the submit succeeded and the load state is ready: `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:147-164`

Transient feedback does exist:

- The Submit button renders `Submitting…` while the answer is in flight: `app/(app)/app/practice/components/practice-view.tsx:308`
- The next-question load sets `loadState` to `loading`: `app/(app)/app/practice/shared/question-flow-actions.ts:70`

Correction:

- The original claim of "no feedback" is overstated. There **is** transient feedback (button text change + loading state).
- The real gap is no **durable** "answer saved" acknowledgment before auto-advancing — no toast, no badge, no intentional dwell. This is a polish concern, not a structural gap.

### 6. "Submit" label ambiguity

**Verdict:** Accurate as a copy overlap, but not a demonstrated flow break.

Evidence:

- Per-question action text is `Submit`: `app/(app)/app/practice/components/practice-view.tsx:301-309`
- Final review-stage action text is `Submit exam`: `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:189-195`

Correction:

- The two "Submit" variants render on **different screens** with different surrounding context (question view vs. review checklist). The overlap is real but the risk of actual user confusion is low.
- This is a polish concern, not structural debt. Deprioritize relative to the navigation/return-path issues above.

---

## Navigation Graph

### 1. Practice Session question view

Component: `app/(app)/app/practice/components/practice-view.tsx`

Header action:

- Tutor: `End session`
- Exam: `Review answers`
- Visibility: rendered whenever `onEndSession` is provided
- Behavior: calls `onEndSession`, which either finalizes the session or loads exam review depending on mode

Bottom bar:

- `Previous`
  - Visible only when `onPreviousQuestion` is provided
  - Actionable only when `hasPreviousQuestion` is true
- `Submit`
  - Visible when `submitResult` is null
  - Disabled when `!canSubmit || isPending`
- `Next`
  - Hidden when `hasNextQuestion === false`
  - Otherwise always rendered
- `Bookmark`
  - Always rendered while a question is visible
- `Mark for review`
  - Exam only
  - Visible when `isExamMode && onToggleMarkForReview`

### 2. Exam Review checklist (pre-submit)

Component: `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`

Buttons:

- `Open question`
  - Visible for each `row.isAvailable`
  - Action: `onOpenQuestion(row.questionId)`
- `Submit exam`
  - Always rendered at the bottom of the checklist
  - Opens confirmation dialog

### 3. Submit exam confirmation dialog

Component: `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`

Buttons:

- `Keep reviewing`
  - Dismisses dialog
- `Confirm submit`
  - Calls `onFinalizeReview()`
  - Ends the session and transitions to summary

### 4. Session Summary (post-submit)

Component: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Immediate explicit CTAs:

- `Back to Dashboard` -> `/app/dashboard`
- `View in History` -> `/app/history`
- `Start another session` -> `/app/practice`

Lazy-loaded review affordance:

- `createSummaryReviewEffect()` fetches `getPracticeSessionReview()` after summary render: `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:284-343`
- When ready, `SessionBreakdownList` renders per-question review links

### 5. History Sessions tab

Component: `app/(app)/app/history/components/history-sessions-tab.tsx`

Review entry points:

- Session summary link -> first question review route
- Session row click -> same first question review route
- Chevron button -> expands question breakdown
- Expanded breakdown -> per-question review links via `SessionBreakdownList`

### 6. Question review page

Components:

- `app/(app)/app/questions/[slug]/question-page-client.tsx`
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts`

When `sessionId` is present:

- `useQuestionPageController` fetches `getPracticeSessionReview({ sessionId })` and builds sequential `sessionNavigation`: `app/(app)/app/questions/[slug]/use-question-page-controller.ts:187-293`
- `QuestionView` renders `ReviewQuestionNavigator` plus bottom `Previous` / `Next` links when `sessionNavigation` exists: `app/(app)/app/questions/[slug]/question-page-client.tsx:215-225`, `app/(app)/app/questions/[slug]/question-page-client.tsx:343-419`
- `loadPreviousAttempt()` hydrates answered review state or an unanswered-session reveal using `sessionId`: `app/(app)/app/questions/[slug]/question-page-logic.ts:319-409`
- `GetPreviousAttemptUseCase` allows session-based review after the exam has ended and can reveal unanswered items with explanations: `src/application/use-cases/get-previous-attempt.ts:96-189`

---

## Root Causes

### Root Cause A: The summary lacks a purpose-built exam review CTA

The summary screen has the data-loading path for review, but no first-class CTA in the action row. The existing review path is hidden inside the breakdown list, which arrives later and reads like supporting detail rather than the primary next step.

Source:

- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:71-106`

### Root Cause B: Navigator state is suppressed too broadly during review stage

The practice-session navigator is disabled for the entire review stage, not just the checklist screen. That makes sense for the checklist itself, but it also removes navigation when the user opens a specific question from that checklist.

Source:

- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:220-238`

### Root Cause C: End-of-exam completion affordance lives only in the header

The UI already has an end-of-exam action (`Review answers`), but it only exists in the header. The bottom bar never reflects "you finished the last question; here is how you complete the exam".

Source:

- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:235-236`
- `app/(app)/app/practice/components/practice-view.tsx:283-348`

### Root Cause D: Auto-advance is immediate and unacknowledged by design

The controller submits, then immediately advances if the question is not final. No other UI state is inserted between those two steps.

Source:

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts:60-71`
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts:147-164`

### Root Cause E: Summary breakdown review links have a broken return path

The summary breakdown links use `from=practice`, which makes the question review page render "Back to Session" linking to `/app/practice/[sessionId]`: `app/(app)/app/questions/[slug]/question-page-client.tsx:117`. But the practice session route is a client-side state machine — `summary` only exists when in-memory state was set by `endSession()`: `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:116`. On fresh load (browser back, or direct navigation), the page calls `getNextQuestion` instead: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:138`. `GetNextQuestionUseCase` does not reconstruct the summary; it returns an unanswered question or `null`: `src/application/use-cases/get-next-question.ts:158`.

Result: browser back from question review lands on a "No more questions found" dead-end, not the Session Summary. Confirmed by browser walkthrough (2026-03-16).

### Root Cause F: Summary-review fetch failure has no retry path

When the secondary `getPracticeSessionReview()` fetch fails after session end, the Session Summary shows an error message but offers **no retry button**: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:83-86`. In this state, the only review paths are the off-screen History escape hatches (generic CTAs).

Source: `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:83`, `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-summary-review.ts:37`

---

## Recommended Direction

### Option A: Summary-first, exam-only primary CTA

Add an exam-only primary button on Session Summary:

- Label: `Review your answers`
- Target: first available question review route for the just-finished session

Why this is the best fit:

- Minimal behavioral change
- Aligns with the existing summary-first product shape
- Fixes the real discoverability problem without pretending review infrastructure is missing

### Exact route construction

This is simpler than the initial debt doc suggested.

The existing route helper already supports everything needed:

- `toQuestionRoute(slug, { from: 'practice', mode: 'review', sessionId })`: `lib/routes.ts:25-49`

The question page already knows how to:

- build sequential navigation from `sessionId`: `app/(app)/app/questions/[slug]/use-question-page-controller.ts:187-293`
- hydrate prior answers and explanations from `sessionId`: `app/(app)/app/questions/[slug]/question-page-logic.ts:319-409`

That means:

- No new route helper is required for the minimal fix
- No `historySeq` is required for the summary CTA
- No new endpoint is required

### Best implementation detail

There are two viable ways to get the first reviewable slug:

1. **Reuse the pre-submit exam review rows before they are cleared**
   - `onFinalizeReview()` currently clears `review` immediately: `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts:143-148`
   - Those rows already contain ordered slugs before submit
   - This gives the summary CTA an immediate target without waiting for the secondary summary-review fetch

2. **Use `summaryReview.rows` after the summary fetch completes**
   - Simpler to wire into `SessionSummaryView`
   - Slightly weaker because the CTA cannot exist until the second fetch resolves

Recommended approach:

- Preserve the first available slug across finalization for exam sessions, then fall back to `summaryReview.rows` if needed.

**Important caveat (from adversarial audit):** Option A alone is insufficient. The summary breakdown links already use `from=practice`, which creates a broken return path (Root Cause E). The new primary CTA would use the same route helper and inherit the same problem. The return-path fix (Root Cause E) should ship alongside Option A.

### Option B: Add a bottom-bar completion CTA on the last exam question

When the user has just answered the final question, the bottom bar should render:

- `Review answers` or `Finish exam`

This should call the existing `onEndSession` handler rather than introducing new flow logic.

### Option C: Keep navigator/pager when opening a question from the checklist

When a user opens a specific question from pre-submit review:

- keep the existing `QuestionNavigator`
- keep `Previous` / `Next`
- optionally add an explicit `Back to review list` button for clarity

The most direct code change is to stop suppressing the navigator for all review-stage states. Suppress it only for the checklist screen itself, not for the "opened specific question from checklist" state.

Practical implementation direction:

- thread `questionId` into `createNavigatorEffect()`
- change the guard from `if (summary || isInReviewStage || !sessionInfo)` to a narrower condition such as "hide navigator only when in review stage and no specific question is open"

---

## Not Actually Debt Here

These should be removed from DEBT-316 as primary claims:

- "Session Summary breakdown rows are non-clickable" -> already implemented
- "History requires chevron expansion to reach review" -> already false in current code
- "A new route helper is needed to build the review route" -> not required for the minimal fix

---

## Test Plan

### New coverage to add

1. Session Summary renders an exam-only `Review your answers` CTA when a reviewable slug is available.
2. That CTA links to `toQuestionRoute(firstSlug, { from: 'practice', mode: 'review', sessionId })`.
3. After answering the last exam question, the bottom bar renders `Review answers` or `Finish exam`.
4. Opening a question from the pre-submit review checklist preserves the navigator and Previous/Next controls.
5. Summary-review fetch failure renders a retry button.
6. Question review "Back to Session" link returns the user to the Session Summary (not a dead-end state).

### Existing coverage to keep in mind

1. `SessionBreakdownList` already has route-contract tests for summary/history review links: `app/(app)/app/shared/components/session-breakdown-list.test.tsx:66-107`
2. Question review routing already supports session-based sequential navigation: `app/(app)/app/questions/[slug]/use-question-page-controller.ts:187-293`

### Manual QA

1. Complete a 2-question exam, submit it, and verify the summary has an obvious `Review your answers` CTA.
2. Click the CTA and verify question 1 opens with explanations and session navigation.
3. Submit the last question of an exam and verify the bottom bar exposes an obvious completion CTA.
4. From `Review Questions`, click `Open question` and verify the navigator plus Previous/Next remain visible.
5. Verify tutor mode remains unchanged except for any intentional summary CTA decisions.
6. From Session Summary, click a breakdown link to open question review, then press browser back — verify the user returns to Session Summary (not a dead-end "No more questions" state).
