# Practice Engine: Frontend Layer

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Routes, hooks, data flow, shared UI components, error handling
> **Last Verified:** 2026-03-17

---

## 1. Routes

| Route | Type | Purpose | Status |
|-------|------|---------|--------|
| `/app/practice` | Server → Client | Landing page — decision point (session starter, incomplete session card). No question loads on mount. History lives at `/app/history`. | Implemented (SPEC-019 Phase 2) |
| `/app/practice/quick` | Server → Client | Quick Practice — ad-hoc, filter-driven question flow with daily-seeded candidate shuffle (`shuffleWithSeed` + `selectNextQuestionId`), immediate feedback, no session tracking. | Implemented (SPEC-019 Phase 2) |
| `/app/practice/[sessionId]` | Server → Client | Session runner — progress, question flow, exam review stage, summary | Implemented |
| `/app/dashboard` | Server Component | Stats cards + recent activity (consumer of `getUserStats`) | Implemented |
| `/app/history` | Server → Client | History page — tabbed view of Sessions and Questions (consumer of `getSessionHistory` + `getAttemptedQuestions`) | Implemented (SPEC-021) |
| `/app/bookmarks` | Server Component | Bookmarked questions (consumer of `getBookmarks`) | Implemented |
| `/app/questions/[slug]` | Server → Client | Individual question page (attempt + review mode) | Implemented |

Route-level correctness/explanation exposure rules are centralized in the [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md).

---

## 2. Practice Route Hook Architecture

```text
PracticePageClient (/app/practice)
└── usePracticeSessionControls (composite)
    ├── usePracticeSessionStart ← large-hook watchlist
    ├── usePracticeAvailableQuestionsCount
    ├── usePracticeSessionTags
    └── usePracticeIncompleteSession

QuickPracticeClient (/app/practice/quick)
└── usePracticeQuestionFlow (composite)
    ├── usePracticeQuestionAnswerFlow ← large-hook watchlist
    └── usePracticeQuestionBookmarks
```

Note: Session history was moved to the dedicated `/app/history` route (SPEC-021) and is no longer embedded in the practice landing page.

---

## 3. Session Page Hook Architecture

```text
PracticeSessionPageClient
└── usePracticeSessionPageModel (composite, large-hook watchlist)
    ├── usePracticeSessionQuestionFlow ← large-hook watchlist
    ├── usePracticeQuestionBookmarks (reused)
    ├── usePracticeSessionReviewStage ← large-hook watchlist
      │   ├── usePracticeSessionReviewStageState (state machine for review stage)
      │   ├── usePracticeSessionNavigator
      │   └── usePracticeSessionSummaryReview
    └── usePracticeSessionMarkForReview ← large-hook watchlist
```

---

## 4. Data Flow

```text
Server Actions (controllers)
    ↓
Pure Logic Modules (practice-page-logic.ts, practice-session-page-logic.ts, shared/question-flow-actions.ts)
    ↓
Hooks (state holders, compose logic + controller calls)
    ↓
Composite Hooks (orchestrate sub-hooks)
    ↓
Page Components (thin orchestrators)
    ↓
View Components (presentational, receive props, never call server actions)
```

View components import only **types** from controllers. Interactive client hooks import the server actions they need (`getNextQuestion`, `submitAnswer`, `startPracticeSession`, etc.), while keeping server-action calls out of presentational components. This matches the current Clean Architecture boundary in the app layer.

---

## 5. Shared UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `QuestionCard` | `components/question/question-card.tsx` | Renders question stem + choice buttons with `<fieldset>` a11y |
| `ChoiceButton` | `components/question/choice-button.tsx` | Radio-style choice with correctness states |
| `Feedback` | `components/question/feedback.tsx` | Correct/incorrect banner with explanation markdown |
| `ErrorCard` | `components/error-card.tsx` | Styled error alert with `role="alert"` |
| `Markdown` | `components/markdown/Markdown.tsx` | `react-markdown` + `remark-gfm` + `rehype-sanitize` |

---

## 6. Error Handling

Interactive hooks typically wrap async calls in try/catch and check `ActionResult` for controller responses. Error display:

| Error | Display | Recovery |
|-------|---------|---------|
| Question load failure | `ErrorCard` + "Try again" + "Return to dashboard" | Retry or navigate |
| Answer submit failure | Same `ErrorCard` | Same |
| Session start failure | `role="alert"` inline error | Retry |
| Bookmark toggle failure | Notification message | Auto-clears |
| Bookmark bootstrap failure | `ErrorCard` ("Bookmarks unavailable.") + retry action | Retry bookmarks |
| Tag load failure | "Tags unavailable." static text | No action needed |
| Session end failure | `ErrorCard` + idempotency key rotation | Retry |
| Navigator load failure | `ErrorCard` + "Retry navigator" | Retry |
| Uncaught error | Next.js error boundary (`error.tsx`) | "Try again" / "Back to Dashboard" / "Report issue" |

Most failures surface via `ErrorCard`, inline error text, or notifications. Fire-and-forget UI actions report through `reportClientError()` via `fireAndForget`; they do not rely on raw `console` logging anymore.
