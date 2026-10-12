# Practice Engine: Architecture Layers

> **Parent:** [Documentation map](../README.md)
> **Scope:** Clean Architecture layers — Domain, Application, Adapters
> **Last Verified:** 2026-04-25
> **Status:** Current shipped layer boundaries and use cases. Active exam mode uses draft-save plus finalization; see [Interaction Contracts](../product/practice/interaction-contracts.md) for the UI contract.

---

## 1. Domain Layer

### 1.1 Entities

All entities are pure TypeScript type aliases with no runtime behavior. They live in `src/domain/entities/`.

| Entity | Key Fields | Purpose |
|--------|-----------|---------|
| `Question` | `id`, `revisionId`, `isCurrentRevision`, `slug`, `stemMd`, `explanationMd`, `difficulty`, `status`, `choices[]`, `tags[]` | A board-prep question with markdown content |
| `Choice` | `id`, `questionId`, `label` (A–E), `textMd`, `isCorrect`, `explanationMd`, `sortOrder` | One answer choice; `explanationMd` is per-choice (beyond question-level explanation) |
| `Attempt` | `id`, `userId`, `questionId`, `questionRevisionId` (the revision graded, ADR-021), `practiceSessionId` (nullable), `selectedChoiceId`, `isCorrect`, `timeSpentSeconds`, `retryOfAttemptId` (nullable), `retryOrigin` (nullable), `retrySessionId` (nullable), `answeredAt` | A single answer submission with optional retry provenance lineage |
| `PracticeSession` | `id`, `userId`, `mode`, `questionIds[]`, `questionStates[]`, `tagFilters[]`, `difficultyFilters[]`, `startedAt`, `endedAt` (nullable) | A structured practice session (tutor or exam) |
| `PracticeSessionQuestionState` | `questionId`, `markedForReview`, `latestSelectedChoiceId` (nullable), `latestIsCorrect` (nullable), `latestAnsweredAt` (nullable), `draftSelectedChoiceId` (nullable), `draftSavedAt` (nullable), `draftCumulativeMs` | Per-question state within a session. Tutor writes finalized `latest*` state on submit; active exam writes mutable `draft*` state until `FinalizeExamAnswers` materializes final attempts and `latest*` state. |
| `Bookmark` | `userId`, `questionId`, `createdAt` | A user-saved question |
| `Tag` | `id`, `slug`, `name`, `kind` | A categorization label (topic, substance, treatment, diagnosis) |

### 1.2 Value Objects

All value objects provide union string types (derived from `All*` constants), validation functions, and "All" constants. They live in `src/domain/value-objects/`.

| Value Object | Values | Key Function |
|-------------|--------|-------------|
| `PracticeMode` | `'tutor'` \| `'exam'` | `shouldShowExplanationForMode()` |
| `QuestionDifficulty` | `'easy'` \| `'medium'` \| `'hard'` | `isValidDifficulty()` |
| `QuestionStatus` | `'draft'` \| `'published'` \| `'archived'` | `isValidQuestionStatus()` |
| `ChoiceLabel` | `'A'` \| `'B'` \| `'C'` \| `'D'` \| `'E'` | `isValidChoiceLabel()` |
| `TagKind` | `'topic'` \| `'substance'` \| `'treatment'` \| `'diagnosis'` | `isValidTagKind()` |
| `SubscriptionPlan` | `'monthly'` \| `'annual'` | `isValidSubscriptionPlan()` |
| `SubscriptionStatus` | 8 statuses | `isEntitledStatus()` — includes `'active'`, `'inTrial'`, `'pastDue'` |

### 1.3 Domain Services

Pure functions with zero side effects. They live in `src/domain/services/`.

| Service | Functions | Purpose |
|---------|----------|---------|
| `grading.ts` | `gradeAnswer(question, choiceId)` → `GradeResult` | Determines correctness of a submitted answer |
| `entitlement.ts` | `isEntitled(subscription, now)` | Checks subscription + period-end for access |
| `session.ts` | `computeSessionProgress()`, `shouldShowExplanation()`, `getNextQuestionId()` | Session state machine helpers |
| `statistics.ts` | `computeAccuracy()`, `computeStreak()`, `filterAttemptsInWindow()` | Dashboard stat computations |
| `shuffle.ts` | `shuffleWithSeed()`, `createSeed()`, `createQuestionSeed()` | Deterministic question/choice ordering |
| `session-stats.ts` | `computeSessionStats()`, `computeSessionDurationSeconds()` | Session-level stat computations |
| `scoring.ts` | `hadFairChanceAtEnd()`, `contentInDoubt()`, `countsTowardScore()`, `countsIfEndedNow()`, `computeSessionScore()` | ADR-022 Decision 3, as amended: which items a score counts, shared by every score |
| `question-selection.ts` | `selectNextQuestionId(candidates, history)` | Picks next question prioritizing least-recently-seen |

### 1.4 Domain Errors

| Code | Used For |
|------|---------|
| `INVALID_QUESTION` | Invalid question data (defensive) |
| `INVALID_CHOICE` | Invalid choice reference |

**Note:** Three error codes from SPEC-003 (`INVALID_SESSION`, `SESSION_ALREADY_ENDED`, `NO_QUESTIONS_MATCH`) were specified but intentionally not implemented — session validation is handled at the application layer via `ApplicationError`.

### 1.5 Test Coverage

Every service and value object has colocated `.test.ts` files (17+ files total, including factory tests). Most entity files are pure types, but `attempt.ts` includes runtime provenance validation helpers and is covered by unit tests. Domain test helpers provide factories: `createQuestion()`, `createChoice()`, `createAttempt()`, `createBookmark()`, `createPracticeSession()`, `createSubscription()`, `createUser()`, `createTag()`.

---

## 2. Application Layer

### 2.1 Use Cases

All use cases follow the pattern: constructor injection of port interfaces, single `execute()` method, `ApplicationError` with typed codes for all error paths. They live in `src/application/use-cases/`.

#### Core Question Loop

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `GetNextQuestion` | `{ userId, sessionId, questionId?, fromIndex? }` or `{ userId, filters }` | `NextQuestion` (stem, choices without `isCorrect`, session info) or `null` | `NOT_FOUND`, `VALIDATION_ERROR` |
| `SubmitAnswer` | `{ userId, questionId, choiceId, sessionId?, timeSpentSeconds?, retryOfAttemptId?, retryOrigin?, retrySessionId? }` | `{ attemptId, isCorrect: boolean \| null, correctChoiceId: string \| null, explanationMd: string \| null, referenceMd: string \| null, choiceExplanations[] }` | `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`, `VALIDATION_ERROR`; active exam sessions are rejected |
| `SaveExamDraftAnswer` | `{ userId, sessionId, questionId, selectedChoiceId, cumulativeMs }` | Updated `PracticeSessionQuestionState` draft fields | `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT` |
| `FinalizeExamAnswers` | `{ userId, sessionId }` | `PracticeSessionSummary` | `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL_ERROR` |

Answer-key exposure in active exam contexts is governed by the [Exam Answer Secrecy Policy](../product/practice/exam-answer-secrecy.md).

#### Practice Sessions

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `StartPracticeSession` | `{ userId, mode, count, tagSlugs, difficulties, statuses? }` | `{ sessionId, requestedCount, actualCount }` | `NOT_FOUND` (no matching questions), `CONFLICT` (incomplete session exists) |
| `CountAvailableQuestions` | `{ userId, tagSlugs, difficulties, statuses }` | `{ count }` | (propagates) |
| `EndPracticeSession` | `{ userId, sessionId }` | `{ sessionId, endedAt, totals }` | `INTERNAL_ERROR` |
| `GetIncompletePracticeSession` | `{ userId }` | Session summary or `null` | (propagates) |
| `GetPracticeSessionReview` | `{ userId, sessionId }` | Per-question breakdown with states | `NOT_FOUND` |
| `SetPracticeSessionQuestionMark` | `{ userId, sessionId, questionId, markedForReview }` | `{ questionId, markedForReview }` | `NOT_FOUND`, `CONFLICT` |
| `GetSessionHistory` | `{ userId, limit, offset }` | Paginated completed sessions | (propagates) |

#### Bookmarks & Review

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `ToggleBookmark` | `{ userId, questionId }` | `{ bookmarked: boolean }` | `NOT_FOUND` |
| `GetBookmarks` | `{ userId }` | Bookmarked questions with availability | (graceful degradation) |
| `GetAttemptedQuestions` | `{ userId, limit, offset, filters? }` | Paginated attempted questions with result/source filters | (graceful degradation) |
| `GetPreviousAttempt` | `{ userId, questionId, attemptId?, sessionId? }` | `attempt` state, `session_unanswered` reveal state, or `null` | (propagates); returns `null` when no applicable prior state exists |

#### Dashboard

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `GetUserStats` | `{ userId }` | Stats (total, accuracy, streak, recent activity with session context) | (graceful degradation) |

### 2.2 Ports (Interfaces)

Ports define what the application layer needs from the outside world. The actual `AttemptRepository` is composed of 7 segregated sub-interfaces following ISP:

- `AttemptWriter` — `insert`
- `AttemptHistoryReader` — `findByUserId` (paginated)
- `AttemptSessionReader` — `findBySessionId`
- `AttemptStatsReader` — counts, recent, streak data
- `AttemptAllQuestionsReader` — paginated attempted question summaries with result/source filters
- `AttemptSingleQuestionReader` — most recent attempt for a specific question (review mode)
- `AttemptMostRecentAnsweredAtReader` — for question selection ordering

Other ports: `QuestionRepository` (5 methods), `PracticeSessionRepository` (9 methods with CAS concurrency), `BookmarkRepository` (4 methods), `TagRepository` (1 method).

### 2.3 Test Coverage

Every practice-engine use case has a colocated test file. All tests use fakes from `src/application/test-helpers/fakes/`. Zero `vi.mock()` on application code.

---

## 3. Adapters Layer

### 3.1 Repositories (Drizzle ORM)

| Repository | Port Interface | Methods | Key Patterns |
|-----------|---------------|---------|-------------|
| `DrizzleQuestionRepository` | `QuestionRepository` | 5 | Relational loading with `with:` clause; tag-filtered candidate query uses `INNER JOIN + GROUP BY` |
| `DrizzleAttemptRepository` | `AttemptRepository` (composite) | 15 | `row_number()` window function selects latest attempt per question (attempted-question summaries); partial unique index `(practiceSessionId, questionId)` prevents duplicate session answers |
| `DrizzlePracticeSessionRepository` | `PracticeSessionRepository` | 9 | Optimistic concurrency (CAS) with 3 retries for `recordQuestionAnswer`, `saveDraftAnswer`, `finalizeDraftAnswer`, and `setQuestionMarkedForReview`; Zod validation on `paramsJson` read/write |
| `DrizzleBookmarkRepository` | `BookmarkRepository` | 4 | `ON CONFLICT DO NOTHING` for idempotent add |
| `DrizzleTagRepository` | `TagRepository` | 1 | `SELECT DISTINCT` with join to published questions only |

### 3.2 Controllers (Server Actions)

Every practice-related server action:
1. Validates input with Zod `.safeParse()`
2. Checks auth + entitlement via `requireEntitledUserId()`
3. Calls a use case
4. Returns `ActionResult<T>` (never leaks raw errors)

| Controller | Actions | Rate Limited | Idempotent |
|-----------|---------|-------------|-----------|
| `question-controller` | `getNextQuestion`, `submitAnswer` | submitAnswer: yes | submitAnswer: yes |
| `question-view-controller` | `getQuestionBySlug`, `getPreviousAttempt` | no | no |
| `practice-controller` | `startPracticeSession`, `countAvailableQuestions`, `getIncompletePracticeSession`, `endPracticeSession`, `finalizeExamAnswers`, `saveExamDraftAnswer`, `getPracticeSessionReview`, `getSessionHistory`, `setPracticeSessionQuestionMark` | startPracticeSession: yes | start/end/finalize/mark: yes |
| `bookmark-controller` | `toggleBookmark`, `getBookmarks` | toggleBookmark: yes | toggleBookmark: yes |
| `tag-controller` | `getTags` | no | no |
| `review-controller` | `getAttemptedQuestions` | no | no |
| `stats-controller` | `getUserStats` | no | no |

### 3.3 Database Schema

Practice-related tables in `db/schema.ts`:

| Table | Indexes | Notes |
|-------|---------|-------|
| `questions` | `slug` (unique), `status+difficulty`, `status+createdAt` | Published questions only served to users |
| `choices` | `questionId`, `question+label` (unique), `question+sortOrder` (unique) | 2–5 choices per question (A–E) validated at seed time; most questions are 4 choices |
| `tags` | `slug` (unique), `kind+slug` | 4 kinds: topic, substance, treatment, diagnosis (the legacy `domain` kind is gone; see [the content taxonomy](../product/content-taxonomy.md)) |
| `question_tags` | Composite PK, `tagId`, `questionId` | Many-to-many |
| `practice_sessions` | `user+startedAt`, `user+endedAt` | `paramsJson` stores `count`, the `tagSlugs` and `difficulties` filters, and the ordered `questionIds`; `mode` is its own column |
| `practice_session_question_states` | `(session, question)` unique, `(session, position)` unique, `questionId` | One row per session question: `position` mirrors `paramsJson.questionIds` (DEBT-433), mark-for-review, finalized `latest*` answer, exam `draft*` answer and `draftCumulativeMs`, the bound `questionRevisionId` (ADR-021), `fairChanceAtEnd` (ADR-022), and a `version` for compare-and-swap updates |
| `attempts` | 8+ indexes covering query patterns | Partial unique on `(practiceSessionId, questionId)` prevents duplicate session answers; includes retry lineage fields (`retryOfAttemptId`, `retryOrigin`, `retrySessionId`) and retry-parent index |
| `bookmarks` | Composite PK, `user+createdAt`, `questionId` | Idempotent add via `ON CONFLICT DO NOTHING` |

### 3.4 Test Coverage

All five core practice-engine repositories have colocated unit tests plus domain-scoped integration tests in `tests/integration/` (for example `question-repository.integration.test.ts` and `session-attempt-repository.integration.test.ts`).

## The Frontend Layer

### 1. Routes

| Route | Type | Purpose | Status |
|-------|------|---------|--------|
| `/app/practice` | Server → Client | Landing page — decision point (session starter, incomplete session card). No question loads on mount. History lives at `/app/history`. | Implemented (SPEC-019 Phase 2) |
| `/app/practice/quick` | Server → Client | Quick Practice — ad-hoc, filter-driven question flow with daily-seeded candidate shuffle (`shuffleWithSeed` + `selectNextQuestionId`), immediate feedback, no session tracking. | Implemented (SPEC-019 Phase 2) |
| `/app/practice/[sessionId]` | Server → Client | Session runner — progress, question flow, exam review stage, summary | Implemented |
| `/app/dashboard` | Server Component | Stats cards + recent activity (consumer of `getUserStats`) | Implemented |
| `/app/history` | Server → Client | History page — tabbed view of Sessions and Questions (consumer of `getSessionHistory` + `getAttemptedQuestions`) | Implemented (SPEC-021) |
| `/app/bookmarks` | Server Component | Bookmarked questions (consumer of `getBookmarks`) | Implemented |
| `/app/questions/[slug]` | Server → Client | Individual question page (attempt + review mode) | Implemented |

Route-level correctness/explanation exposure rules are centralized in the [Exam Answer Secrecy Policy](../product/practice/exam-answer-secrecy.md).

---

### 2. Practice Route Hook Architecture

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

### 3. Session Page Hook Architecture

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

### 4. Data Flow

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

### 5. Shared UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `QuestionCard` | `components/question/question-card.tsx` | Renders question stem + choice buttons with `<fieldset>` a11y |
| `ChoiceButton` | `components/question/choice-button.tsx` | Radio-style choice with correctness states |
| `Feedback` | `components/question/feedback.tsx` | Correct/incorrect banner with explanation markdown |
| `ErrorCard` | `components/error-card.tsx` | Styled error alert with `role="alert"` |
| `Markdown` | `components/markdown/Markdown.tsx` | `react-markdown` + `remark-gfm` + `rehype-sanitize` |

---

### 6. Error Handling

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
| Uncaught error | Next.js error boundary (`error.tsx`) | "Try again" / "Back to Dashboard" / "Contact support" |

Most failures surface via `ErrorCard`, inline error text, or notifications. Fire-and-forget UI actions report through `reportClientError()` via `fireAndForget`; they do not rely on raw `console` logging anymore.
