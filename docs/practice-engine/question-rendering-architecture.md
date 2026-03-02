# Question Rendering Architecture

> **Type:** Canonical Reference Document (Living)
> **Last Verified:** 2026-03-01
> **Scope:** How questions are rendered, navigated, and state-managed across all viewing contexts

---

## 1. Overview

Questions appear in **6 distinct viewing contexts** across the application (plus multiple “origin” variants on the question page). Each context shares the same core display components (`QuestionCard`, `ChoiceButton`, `Feedback`) but differs in navigation chrome, action bars, state management, and data sources.

This document is the single source of truth for understanding how each context works today.

---

## 2. Viewing Contexts

| # | Context | Route Pattern | Entry Point |
|---|---------|---------------|-------------|
| A | **Tutor Mode** (active session) | `/app/practice/[sessionId]` | Practice landing → Start session (tutor) |
| B | **Exam Mode** (active session) | `/app/practice/[sessionId]` | Practice landing → Start session (exam) |
| C | **Exam Review Stage** (pre-submit review) | `/app/practice/[sessionId]` (same URL, different view) | Exam mode → click "Review answers" (top-right) |
| D | **History Session Review** (post-session) | `/app/questions/[slug]?from=history&mode=review&sessionId=...` | History → Sessions tab → View breakdown → click question |
| E | **History Individual Review** (standalone) | `/app/questions/[slug]?from=history&mode=review` | History → Questions tab → Review |
| F | **Quick Practice** (ad-hoc, no session) | `/app/practice/quick` | Practice → Quick Practice |

Additional minor contexts (use same `/app/questions/[slug]` route):
- **Bookmarks Review:** `?from=bookmarks&mode=review`
- **Dashboard Review:** `?from=dashboard&mode=review&attemptId=...`
- **Practice Session Review:** `?from=practice&mode=review&sessionId=...` (from Session Summary → breakdown)

---

## 3. Component Map

### 3.1 Shared Components (Single Implementation)

These three components are the **core question UI**, shared across all contexts:

| Component | File | Purpose |
|-----------|------|---------|
| `QuestionCard` | `components/question/question-card.tsx` | Question stem + choice list |
| `ChoiceButton` | `components/question/choice-button.tsx` | Individual radio-style answer option |
| `Feedback` | `components/question/feedback.tsx` | Correct/incorrect banner + explanation + per-choice explanations |

**How context differences are handled — purely through props:**

| Prop | Tutor (active) | Exam (active) | Review (all) |
|------|---------------|---------------|--------------|
| `correctChoiceId` | Set after submit | `null` (hidden) | Set from attempt data |
| `disabled` | `false` until submitted (also `true` during pending/loading) | `false` until submitted (also `true` during pending/loading) | `true` during pending/loading; effectively locked by `selectChoiceIfAllowed` guard when `submitResult` exists |
| `onSelectChoice` | Interactive | Interactive | Still wired, but choice changes are blocked by `selectChoiceIfAllowed` once `submitResult` exists |

Feedback is conditionally rendered by the parent:
- **Tutor active:** `{submitResult && !isExamMode ? <Feedback ... /> : null}` (`app/(app)/app/practice/components/practice-view.tsx:239`)
- **Exam active:** Hidden (feedback deferred until review)
- **Review modes:** `{submitResult ? <Feedback ... /> : null}` (`app/(app)/app/questions/[slug]/question-page-client.tsx:209`)

### 3.2 Navigator Components (Context-Specific)

| Component | File | Context | Navigation Method |
|-----------|------|---------|-------------------|
| `QuestionNavigator` | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:24-85` | Active session (tutor + exam) during **answering** | **Callback-based** (`onNavigateQuestion(questionId)`) |
| `ReviewQuestionNavigator` | `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` | Post-session review (History, Practice) | **Link-based** (`<Link href={toQuestionRoute(...)}>`) |

**Key difference:** `QuestionNavigator` uses callbacks to change question within the same SPA page state. `ReviewQuestionNavigator` uses Next.js `<Link>` navigation to route between separate question pages.

### 3.3 Sequential Navigation

| Implementation | File | Location |
|----------------|------|----------|
| Inline Previous/Next links | `app/(app)/app/questions/[slug]/question-page-client.tsx:217-249` | Bottom action bar (`data-testid="bottom-action-bar"`) |

Sequential navigation renders as inline `<Link>` elements in the question page bottom action bar. It only appears when `sessionNavigation` is non-null (requires `sessionId` in URL).

### 3.4 Action Bars (Inline, Not Shared)

Action bars are **not abstracted** — each context renders its own buttons inline:

| Context | File:Lines | Buttons |
|---------|-----------|---------|
| Practice answering UI (active sessions + quick practice) | `app/(app)/app/practice/components/practice-view.tsx:247-307` | Previous (session only), Submit, Next Question, Bookmark (+ Mark for review in exam sessions only) |
| Exam Review Stage | `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:186-235` | Submit exam (with AlertDialog confirmation) |
| Session Summary | `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:95-104` | Back to Dashboard, View in History, Start another |
| Question page (all origins) | `app/(app)/app/questions/[slug]/question-page-client.tsx:217-283` | Previous/Next (session review only), Submit (pre-answer), Try Again (post-answer), Back link |

### 3.5 Back Links

Handled by `getOriginUi()` in `app/(app)/app/questions/[slug]/question-page-client.tsx:49-96`:

| Origin (`from=`) | `sessionId` present? | Back Label | Back Href |
|-------------------|---------------------|------------|-----------|
| `history` | Yes | "Back to History" | `historyHref` or `/app/history?tab=sessions` |
| `history` | No | "Back to History" | `historyHref` or `/app/history?tab=questions` |
| `practice` | Yes | "Back to Session" | `/app/practice/{sessionId}` |
| `practice` | No | "Back to Practice" | `/app/practice` |
| `bookmarks` | — | "Back to Bookmarks" | `/app/bookmarks` |
| default | — | "Back to Dashboard" | `/app/dashboard` |

`historyHref` is validated by `parseHistoryHref()` (`app/(app)/app/questions/[slug]/question-page-client.tsx:35-47`) to prevent open-redirect attacks — only `/app/history?tab=sessions|questions` URLs are allowed.

---

## 4. Context-by-Context Deep Dive

### Context A: Tutor Mode (Active Session)

```
Route:     /app/practice/[sessionId]
Server:    app/(app)/app/practice/[sessionId]/page.tsx
Client:    app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx → PracticeSessionPageView → PracticeView
Controller: app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts
State core: app/(app)/app/practice/shared/use-question-flow-core.ts
```

**Component hierarchy:**
```
PracticeSessionPage (server)
  └─ PracticeSessionPageClient
       └─ PracticeSessionPageView
            ├─ QuestionNavigator (if navigator data loaded; tutor + exam)
            └─ PracticeView
                 ├─ Header: "Tutor Session" / "Question X of Y — Explanations shown after each answer."
                 ├─ End session button (top-right)
                 ├─ QuestionCard (shared)
                 ├─ Feedback (shared) — shown immediately after submit
                 └─ Action bar: [← Previous] [Submit] [Next Question] [Bookmark]
```

**State management:**
- `question: NextQuestion | null` — current question from server
- `selectedChoiceId: string | null` — user's current selection
- `isAnswered: boolean` — whether answer is locked
- `submitResult: SubmitAnswerOutput | null` — correctness + explanation data
- `sessionInfo: { mode, index, total, isMarkedForReview, latestSelectedChoiceId, latestIsCorrect }`

**Data flow for "Next Question":**
1. User clicks "Next Question"
2. `onNextQuestion()` → `loadNextQuestion()` (`app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts`, which calls `runLoadQuestionFlow()` in `app/(app)/app/practice/shared/question-flow-actions.ts`)
3. State cleared: `setSelectedChoiceId(null)`, `setSubmitResult(null)` (`app/(app)/app/practice/shared/question-flow-actions.ts:47-48`)
4. Server action `getNextQuestion({ sessionId })` fetches next question
5. On success: `setLoadState({ status: 'ready' })` triggers `syncQuestionStateFromDraftOrSession()`
6. Sync restores `selectedChoiceId` and `isAnswered` from `session.latestSelectedChoiceId`
7. In tutor sessions with prior answers, sync restores `submitResult` from `session.previousSubmission` (`app/(app)/app/practice/shared/use-question-flow-core.ts:156-177`)

### Context B: Exam Mode (Active Session)

Same component tree as Tutor, differentiated by `sessionInfo.mode === 'exam'`:

**Differences from Tutor:**
- `correctChoiceId` forced to `null` (`app/(app)/app/practice/components/practice-view.tsx:90-92`) — no green/red highlighting during exam
- Feedback hidden: `{submitResult && !isExamMode ? ... : null}` (`app/(app)/app/practice/components/practice-view.tsx:239`)
- After submit, exam mode **auto-advances** to the next question (unless last) via `maybeAutoAdvanceAfterSubmit` in `usePracticeSessionPageController`
- "Mark for review" button visible (`app/(app)/app/practice/components/practice-view.tsx:277-288`)
- "End session" becomes "Review answers" (triggers exam review stage)
- QuestionNavigator does **not** reveal correctness in exam mode (answered buttons are labeled "Answered", not "Correct/Incorrect")

### Context C: Exam Review Stage

When the user clicks "Review answers" (top-right) in exam mode, `PracticeSessionPageView` loads review data and switches to `ExamReviewView`:

```
PracticeSessionPageView (app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:111 — if (review) → ExamReviewView)
  └─ ExamReviewView
       ├─ Header: "Review Questions"
       ├─ Stats cards: Answered / Unanswered / Marked
       ├─ Question list (each row: stem preview + "Open question" button)
       └─ Action bar: [Submit exam] (with AlertDialog confirmation)
```

**Navigation model:** This is a **checklist UI**, not sequential. "Open question" buttons call `onOpenReviewQuestion(questionId)` which navigates the session runner back to that question (re-entering PracticeView for that question). There is no "Previous/Next" here.

### Context D: Session Review (History/Practice/Dashboard Entry)

```
Entry:     /app/history?tab=sessions → "View breakdown" → click question link
Route:     /app/questions/[slug]?from=history&mode=review&sessionId={uuid}&historyHref={encoded}
Server:    app/(app)/app/questions/[slug]/page.tsx
Client:    app/(app)/app/questions/[slug]/question-page-client.tsx → QuestionView
Controller: app/(app)/app/questions/[slug]/use-question-page-controller.ts
```

**Component hierarchy:**
```
QuestionPage (server)
  └─ QuestionPageClient
       └─ QuestionView
            ├─ Header: "Question" / "Reviewing a question from your history." / "Back to History"
            ├─ ReviewQuestionNavigator (color-coded grid)
            ├─ Session progress label ("Question X of Y")
            ├─ QuestionCard (shared)
            ├─ Feedback (shared) — shown when `submitResult` exists
            └─ Action bar:
                 - [← Previous] / [Next →] when session navigation neighbors exist
                 - Hydrated answered question: [Try Again] (+ [Submit] after reset)
                 - `session_unanswered` reveal: [Try Again] (then [Submit] after reset)
                 - `hydration_error`: explicit fallback card [Retry load] / [Answer as new]
                 - [Back to History]
```

**State management:**
- `useQuestionPageController` loads question via `getQuestionBySlug()`
- When `mode=review`, calls `loadPreviousAttempt()` and classifies one of four hydration outcomes:
  - `attempt`
  - `session_unanswered`
  - `no_prior_attempt`
  - `hydration_error`
- Session navigation loaded via `getPracticeSessionReview({ sessionId })` — cached per sessionId
- Inline retry in this context submits standalone attempts with provenance (`retryOrigin=session_review`)
- Retry marker (`wasRetried`) is maintained in session-scoped client navigation state for the current visit
- Navigation is URL-driven (`<Link>` elements) — fully supports browser back/forward

### Context E: History Individual Review

Same route and component tree as Context D, but **without `sessionId`**:

```
Entry:     /app/history?tab=questions → "Review" button
Route:     /app/questions/[slug]?from=history&mode=review&historyHref={encoded}
```

**Key differences from Context D:**
- `sessionNavigation` is `null` (no sessionId → no sibling questions)
- `ReviewQuestionNavigator` NOT rendered (`app/(app)/app/questions/[slug]/question-page-client.tsx:155` — `if (props.sessionNavigation)`)
- No sequential navigation (no `sessionId` → no sibling questions)
- Action flow: hydrated attempts show [Try Again], which unlocks [Submit] for a new standalone attempt; hydration errors require explicit [Answer as new]

### Context F: Quick Practice (Ad-hoc, No Session)

```
Route:     /app/practice/quick
Server:    app/(app)/app/practice/quick/page.tsx
Client:    app/(app)/app/practice/quick/quick-practice-client.tsx → PracticeView
Controller: app/(app)/app/practice/hooks/use-practice-question-flow.ts
State core: app/(app)/app/practice/shared/use-question-flow-core.ts
```

**Component hierarchy:**
```
QuickPracticePage (server)
  └─ QuickPracticeClient
       └─ PracticeView
            ├─ Header: "Quick Practice"
            ├─ Top-right link: "Back to Practice"
            ├─ QuestionCard (shared)
            ├─ Feedback (shared) — shown immediately after submit
            └─ Action bar: [Submit] [Next Question] [Bookmark]
```

---

## 5. Comparison Matrix

### 5.1 Feature Presence

| Feature | A: Tutor | B: Exam | C: Exam Review | D: Session Review | E: Individual Review | F: Quick Practice |
|---------|:--------:|:-------:|:--------------:|:-----------------:|:--------------------:|:----------------:|
| QuestionCard | Yes | Yes | No (list view) | Yes | Yes | Yes |
| Feedback (explanation) | Immediate | Hidden | No | Hydrated attempt/reveal | Hydrated attempt | Immediate |
| Can submit answer | Yes | Yes | No | Yes (after Try Again or explicit fallback) | Yes (after Try Again or explicit fallback) | Yes |
| Can reattempt | No | No | No | Yes (`attempt` and `session_unanswered`) | Yes (`attempt`) | No |
| Next Question button | Yes | Yes | No | No | No | Yes |
| Previous Question button | Yes (session-only) | Yes (session-only) | No | Yes (← Previous link) | No | No |
| Question Navigator grid | Yes | Yes | No (inline list) | Yes (color-coded) | No | No |
| Sequential nav (X of Y) | In description | In description | No | Yes (inline row) | No | No |
| Mark for review | No | Yes | View only | No | No | No |
| Bookmark button | Yes | Yes | No | No | No | Yes |
| Top-right control | End session | Review answers | None | Back to History (preserved) | Back to History (preserved) | Back to Practice |

### 5.2 State Persistence

| Aspect | Active Practice | Session Review | Individual Review |
|--------|:--------------:|:--------------:|:-----------------:|
| Answer selection restored on revisit | Full | Full (answered questions) | Full |
| Correct/incorrect highlighting | Preserved in tutor mode (hidden by design in exam mode) | Preserved | Preserved |
| Explanation visible on revisit | Preserved in tutor mode (hidden by design in exam mode) | Preserved | Preserved |
| Data source for restoration | `session.previousSubmission` + `session.latestSelectedChoiceId` | `getPreviousAttempt()` | `getPreviousAttempt()` |

---

## 6. Resolved: Tutor Mode State Persistence on Revisit

This behavior is resolved by SPEC-030 implementation.

- `NextQuestion` now includes optional `session.previousSubmission` (`src/application/use-cases/get-next-question.ts:30-51`), hydrated for answered tutor-session questions (`src/application/use-cases/get-next-question.ts:196-216`)
- `useQuestionFlowCore` restores `submitResult` from `previousSubmission` during question sync (`app/(app)/app/practice/shared/use-question-flow-core.ts:156-177`)
- Result: tutor-mode revisit preserves selected answer, correctness highlighting, and explanation

---

## 7. Navigation Architecture

### 7.1 Design Decisions

| Decision | Rationale | Source |
|----------|-----------|--------|
| Previous in active practice is session-scoped | Active session pages can render Previous via `onPreviousQuestion`; quick practice (no session ordering) has no Previous | Implementation (`PracticeView`) |
| Session context required for sequential nav | URL-driven: no sessionId = no sibling questions | SPEC-027 |
| Navigator grid above sequential nav | Hierarchy: random-access (grid) → linear (prev/next) → content | SPEC-028 |
| `historyHref` preservation | Carry pagination + filters through review navigation | DEBT-217 |
| Questions tab has no sequential nav | Question-level view, not session-level | SPEC-027 |

### 7.2 URL Parameters

| Param | Contexts | Purpose |
|-------|----------|---------|
| `from` | All question page contexts | Determines back link target (`history`, `practice`, `bookmarks`, `dashboard`) |
| `mode=review` | Review contexts | Enables review hydration semantics (`attempt` / `session_unanswered` / `no_prior_attempt` / `hydration_error`) |
| `sessionId` | Session-based contexts | Enables navigator grid + sequential nav |
| `historyHref` | History-based contexts | Preserves history page pagination/filter state |
| `attemptId` | Dashboard review | Specific attempt to load (attempt identity) |

### 7.3 Two Navigator Implementations

The codebase has two navigators that look similar but serve different contexts:

| Aspect | `QuestionNavigator` (exam-review-view.tsx) | `ReviewQuestionNavigator` (review-question-navigator.tsx) |
|--------|-------------------------------------------|---------------------------------------------------------|
| Renders in | Active session page | Standalone question page |
| Navigation | `onNavigateQuestion(questionId)` callback | `<Link href={toQuestionRoute(...)}>` routing |
| Color coding | default/secondary/outline (answered status) | success/destructive/outline (correctness) |
| Mark-for-review indicator | Red dot overlay | Not applicable |
| `aria-label` format | "Question N: Current, Marked for review, (Correct/Incorrect/Answered/Unanswered)" | "Question N: Correct/Incorrect/Unanswered, Current" |

---

## 8. State Management Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ACTIVE PRACTICE SESSION                          │
│                                                                     │
│  use-practice-session-page-controller.ts                           │
│    └─ use-question-flow-core.ts (shared state)                     │
│         ├─ question: NextQuestion | null                            │
│         ├─ selectedChoiceId: string | null                          │
│         ├─ isAnswered: boolean                                      │
│         ├─ submitResult: SubmitAnswerOutput | null                  │
│         ├─ loadState: LoadState                                     │
│         └─ canSubmit: boolean                                       │
│                                                                     │
│  On "Next Question":                                                │
│    question-flow-actions.ts:                                        │
│      setSelectedChoiceId(null)  ──► cleared before fetch            │
│      setSubmitResult(null)      ──► cleared before fetch            │
│    Server: getNextQuestion() → NextQuestion                         │
│      (includes session.previousSubmission in tutor when answered)    │
│    use-question-flow-core.ts syncQuestionStateFromDraftOrSession():  │
│      setSelectedChoiceId(latestSelectedChoiceId)  ──► restored      │
│      setIsAnswered(true)                          ──► restored      │
│      setSubmitResult(previousSubmission payload)    ──► restored    │
│      (exam mode intentionally hides feedback until review)           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    QUESTION REVIEW PAGE                              │
│                                                                     │
│  use-question-page-controller.ts                                    │
│    On mount (mode=review):                                          │
│      1. getQuestionBySlug() → question data                         │
│      2. loadPreviousAttempt() → one of 4 outcomes:                  │
│         ├─ attempt              ──► selectedChoiceId + submitResult │
│         ├─ session_unanswered   ──► reveal + Try Again path         │
│         ├─ no_prior_attempt     ──► fresh submit path               │
│         └─ hydration_error      ──► explicit fallback UI            │
│                                                                     │
│  On sequential nav (← Previous / Next →):                           │
│    Bottom action bar links (<Link>) → new page load → fresh fetch  │
│    All state restored from server on each page load.                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. File Index

### Pages & Route Handlers

| File | Role |
|------|------|
| `app/(app)/app/practice/[sessionId]/page.tsx` | Server component: passes sessionId to client |
| `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` | Client entry for practice session |
| `app/(app)/app/practice/quick/page.tsx` | Server component: quick practice |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Client entry for quick practice |
| `app/(app)/app/questions/[slug]/page.tsx` | Server component: passes slug + search params to client |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Client entry for question review + QuestionView (includes inline bottom-bar sequential nav links) |
| `app/(app)/app/history/page.tsx` | Server component: history page |
| `app/(app)/app/history/history-page-client.tsx` | Client entry for history tabs |

### View Components

| File | Component | Used By |
|------|-----------|---------|
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | `PracticeSessionPageView` | Practice session client |
| `app/(app)/app/practice/components/practice-view.tsx` | `PracticeView` | Active answering (sessions + quick practice) |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | `ExamReviewView`, `QuestionNavigator` | Exam review stage + active-session navigator grid |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | `SessionSummaryView` | Post-session summary |
| `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx` | `ReviewQuestionNavigator` | Session-based question review |
| `app/(app)/app/history/components/history-sessions-tab.tsx` | `HistorySessionsTab` | History sessions list |
| `app/(app)/app/history/components/history-questions-tab.tsx` | `HistoryQuestionsTab` | History questions list |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | `SessionBreakdownList` | Session summary + history breakdown |

### Shared UI Components

| File | Component | Purpose |
|------|-----------|---------|
| `components/question/question-card.tsx` | `QuestionCard` | Question stem + choice list (all contexts) |
| `components/question/choice-button.tsx` | `ChoiceButton` | Individual answer choice (all contexts) |
| `components/question/feedback.tsx` | `Feedback` | Correct/incorrect + explanation (all contexts) |
| `components/error-card.tsx` | `ErrorCard` | Error display (all contexts) |

### Hooks & State Management

| File | Hook/Function | Role |
|------|---------------|------|
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` | `usePracticeSessionPageController` | Master controller for practice session |
| `app/(app)/app/practice/shared/use-question-flow-core.ts` | `useQuestionFlowCore` | Shared question state (selection, submission, loading) |
| `app/(app)/app/practice/shared/question-flow-actions.ts` | `runLoadQuestionFlow`, `runSubmitAnswerFlow` | Async action flows with timeout |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts` | `usePracticeSessionQuestionFlow` | Session-specific question flow (next, navigate, submit) |
| `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` | `loadNextQuestion`, `createLoadNextQuestionAction`, `submitAnswerForQuestion`, `maybeAutoAdvanceAfterSubmit`, `endSession`, `createNavigatorEffect`, `createSummaryReviewEffect` | Session runner async flows + review/navigator wiring |
| `app/(app)/app/practice/hooks/use-practice-question-flow.ts` | `usePracticeQuestionFlow` | Quick practice/ad-hoc question flow (filters-based) |
| `app/(app)/app/practice/practice-page-logic.ts` | `loadNextQuestion`, `submitAnswerForQuestion` | Quick practice async flows (filters-based) |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts` | `usePracticeSessionMarkForReview` | Mark-for-review toggle (exam only) |
| `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts` | `usePracticeQuestionBookmarks` | Bookmark toggle + status |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | `useQuestionPageController` | Master controller for question page |
| `app/(app)/app/questions/[slug]/question-page-logic.ts` | `loadPreviousAttempt` | Pure logic for question page (previous attempt hydration) |

### Route Utilities

| File | Export | Purpose |
|------|--------|---------|
| `lib/routes.ts` | `toQuestionRoute()`, `toPracticeSessionRoute()` | Build URLs with search params |
| `lib/routes.ts` | `ROUTES` constant | All app route paths |

---

## 10. Follow-Up Debt

### 10.1 Resolved in This Slice

**Status:** Resolved in SPEC-030.
**Implementation:** Tutor revisit state restores from `session.previousSubmission` in `NextQuestion`, hydrated into `submitResult` by `useQuestionFlowCore`.

### 10.2 Potential Unification: Action Bars

The bottom action bar is implemented inline in 4 different places. A future spec could extract a shared `QuestionActionBar` component that takes mode/context props. Currently low priority — each context has different enough buttons that unification may add complexity without reducing bugs.

### 10.3 Navigator Convergence

`QuestionNavigator` (active session) and `ReviewQuestionNavigator` (question page review) have similar visual layouts but different data sources and navigation methods. A shared base component with pluggable navigation (callback vs link) could reduce duplication, but the current approach is clear and well-tested.

### 10.4 Retry Observability and Persistence Policy

- Structured telemetry is implemented for:
  - retry submissions (`retry_submitted`)
  - review hydration outcomes (`review_hydration_outcome`)
  - mixed-id normalization (`review_identifier_normalized`)
- Session-review retry marker persistence policy is explicitly **visit-scoped** by product decision (Option A).

### 10.5 Previous-Attempt Identifier Contract

- `GetPreviousAttempt` now rejects mixed `attemptId + sessionId` at controller and use-case layers.
- Route/client normalization remains in place as defense-in-depth.

---

## 11. Related Documentation

| Document | Relevance |
|----------|-----------|
| [Frontend Layer](./frontend-layer.md) | Routes, hook architecture, data flow |
| [Practice Modes](./practice-modes.md) | Tutor vs Exam behavior differences |
| [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md) | Canonical correctness/explanation exposure timing contract |
| [Retry Logic](./retry-logic.md) | Retry/reattempt SSOT including provenance, hydration states, and inline session-review retry contract |
| [Frontend Standards](../frontend/standards.md) | Component inventory (Appendix) |
| [SPEC-027](../_archive/specs/spec-027-session-review-navigation.md) | Session review navigation (implemented) |
| [SPEC-028](../_archive/specs/spec-028-status-filter-segmented-control.md) | Status filter segmented control (implemented) |
| [SPEC-028b](../_archive/specs/spec-028-review-question-navigator.md) | Review question navigator (implemented) |
| [DEBT-217](../_archive/debt/debt-217-history-href.md) | History back link state preservation |
| [DEBT-265](../_archive/debt/debt-265-retry-lineage-and-review-practice-unification.md) | Retry lineage and inline session-review retry implementation contract |
| [DEBT-266](../_archive/debt/debt-266-retry-observability-and-session-review-marker-persistence.md) | Retry observability + marker-persistence policy (resolved) |
| [DEBT-267](../_archive/debt/debt-267-get-previous-attempt-identifier-contract-hardening.md) | Mixed `attemptId + sessionId` contract hardening (resolved) |

---

## 12. Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Linked canonical Exam Answer Secrecy Policy for cross-context correctness/explanation exposure rules. |
| 2026-03-01 | Closed DEBT-266 and DEBT-267: documented server telemetry events, accepted visit-scoped retry-marker policy, and synced previous-attempt mixed-id contract hardening. |
| 2026-03-01 | Synced to DEBT-265 implementation: updated review route ownership, hydration outcome model, session-review submit/reattempt matrix, and `mode=review` semantics. Added follow-up debt references for retry observability and marker-persistence policy (DEBT-266). |
| 2026-02-17 | Accuracy pass for BUG-145: removed stale `SessionNavigationBar` references, updated action-bar/state-persistence docs to current `previousSubmission` restoration behavior, replaced Section 6 with resolved status, and refreshed file index references. |
| 2026-02-16 | Initial version — comprehensive audit of question-viewing contexts. Documented state persistence bug in Tutor Mode, navigation architecture, shared vs context-specific components. |
| 2026-02-16 | Accuracy pass — fixed `disabled` prop table (was oversimplified), removed non-existent `buildSessionNavigation` export from file index (logic is inline in controller). |
| 2026-02-16 | Accuracy pass — corrected QuestionNavigator usage (not exam-only), fixed Bookmarks query params, documented unanswered “review mode” fallback behavior, and added Quick Practice context. |
