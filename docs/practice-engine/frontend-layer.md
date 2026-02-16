# Practice Engine: Frontend Layer

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Routes, hooks, data flow, shared UI components, error handling
> **Last Verified:** 2026-02-16

---

## 1. Routes

| Route | Type | Purpose | Status |
|-------|------|---------|--------|
| `/app/practice` | Server → Client | Landing page — decision point (session starter, incomplete session card). No question loads on mount. History lives at `/app/history`. | Implemented (SPEC-019 Phase 2) |
| `/app/practice/quick` | Server → Client | Quick Practice — ad-hoc question flow, random question, immediate feedback, no session tracking. | Implemented (SPEC-019 Phase 2) |
| `/app/practice/[sessionId]` | Server → Client | Session runner — progress, question flow, exam review stage, summary | Implemented |
| `/app/dashboard` | Server Component | Stats cards + recent activity (consumer of `getUserStats`) | Implemented |
| `/app/history` | Server → Client | History page — tabbed view of Sessions and Questions (consumer of `getSessionHistory` + `getAttemptedQuestions`) | Implemented (SPEC-021) |
| `/app/bookmarks` | Server Component | Bookmarked questions (consumer of `getBookmarks`) | Implemented |
| `/app/questions/[slug]` | Server → Client | Individual question page (attempt + review mode) | Implemented |

---

## 2. Practice Route Hook Architecture

```text
PracticePageClient (/app/practice)
└── usePracticeSessionControls (63 lines, composite)
    ├── usePracticeSessionStart (140 lines)
    ├── usePracticeSessionTags (34 lines)
    └── usePracticeIncompleteSession (66 lines)

QuickPracticeClient (/app/practice/quick)
└── usePracticeQuestionFlow (63 lines, composite)
    ├── usePracticeQuestionAnswerFlow (180 lines) ← over 150-line guideline
    └── usePracticeQuestionBookmarks (116 lines)
```

Note: Session history was moved to the dedicated `/app/history` route (SPEC-021) and is no longer embedded in the practice landing page.

---

## 3. Session Page Hook Architecture

```text
PracticeSessionPageClient
└── usePracticeSessionPageController (121 lines, composite)
    ├── usePracticeSessionQuestionFlow (238 lines) ← over 150-line guideline
    ├── usePracticeQuestionBookmarks (116 lines, reused)
    ├── usePracticeSessionReviewStage (133 lines)
    │   ├── usePracticeSessionReviewStageState (state machine for review stage)
    │   ├── usePracticeSessionNavigator (70 lines)
    │   └── usePracticeSessionSummaryReview (52 lines)
    └── usePracticeSessionMarkForReview (155 lines)
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

Client components import only **types** from controllers. Server actions are invoked either (a) directly in server components/pages, or (b) from client hooks for interactive flows. This is architecturally correct.

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
| Bookmark toggle failure | Toast notification | Auto-clears |
| Tag load failure | "Tags unavailable." static text | No action needed |
| Session end failure | `ErrorCard` + idempotency key rotation | Retry |
| Navigator load failure | `ErrorCard` + "Retry navigator" | Retry |
| Uncaught error | Next.js error boundary (`error.tsx`) | "Try again" / "Back to Dashboard" / "Report issue" |

Most failures surface via `ErrorCard`, inline error text, or toasts; a small number of fire-and-forget UI actions log errors to the console as a safety net (`fireAndForget`).
