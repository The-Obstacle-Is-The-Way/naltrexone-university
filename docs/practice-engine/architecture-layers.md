# Practice Engine: Architecture Layers

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Clean Architecture layers — Domain, Application, Adapters
> **Last Verified:** 2026-02-11

---

## 1. Domain Layer

### 1.1 Entities

All entities are pure TypeScript type aliases with no runtime behavior. They live in `src/domain/entities/`.

| Entity | Key Fields | Purpose |
|--------|-----------|---------|
| `Question` | `id`, `slug`, `stemMd`, `explanationMd`, `difficulty`, `status`, `choices[]`, `tags[]` | A board-prep question with markdown content |
| `Choice` | `id`, `questionId`, `label` (A/B/C/D), `textMd`, `isCorrect`, `explanationMd`, `sortOrder` | One answer choice; `explanationMd` is per-choice (beyond question-level explanation) |
| `Attempt` | `id`, `userId`, `questionId`, `practiceSessionId?`, `selectedChoiceId`, `isCorrect`, `timeSpentSeconds`, `answeredAt` | A single answer submission |
| `PracticeSession` | `id`, `userId`, `mode`, `questionIds[]`, `questionStates[]`, `tagFilters[]`, `difficultyFilters[]`, `startedAt`, `endedAt?` | A structured practice session (tutor or exam) |
| `PracticeSessionQuestionState` | `questionId`, `markedForReview`, `latestSelectedChoiceId?`, `latestIsCorrect?`, `latestAnsweredAt?` | Per-question state within a session |
| `Bookmark` | `userId`, `questionId`, `createdAt` | A user-saved question |
| `Tag` | `id`, `slug`, `name`, `kind` | A categorization label (domain/exam section, topic, substance, treatment, diagnosis) |

### 1.2 Value Objects

All value objects provide branded string types, validation functions, and "All" constants. They live in `src/domain/value-objects/`.

| Value Object | Values | Key Function |
|-------------|--------|-------------|
| `PracticeMode` | `'tutor'` \| `'exam'` | `shouldShowExplanationForMode()` |
| `QuestionDifficulty` | `'easy'` \| `'medium'` \| `'hard'` | `isValidDifficulty()` |
| `QuestionStatus` | `'draft'` \| `'published'` \| `'archived'` | `isVisibleStatus()` |
| `ChoiceLabel` | `'A'` \| `'B'` \| `'C'` \| `'D'` | `isValidChoiceLabel()` |
| `TagKind` | `'domain'` \| `'topic'` \| `'substance'` \| `'treatment'` \| `'diagnosis'` | `isValidTagKind()` |
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
| `session-stats.ts` | `computeSessionStats()`, `computeSessionDurationSeconds()`, `createDefaultQuestionState()` | Session-level stat computations |
| `question-selection.ts` | `selectNextQuestionId(candidates, history)` | Picks next question prioritizing least-recently-seen |

### 1.4 Domain Errors

| Code | Used For |
|------|---------|
| `INVALID_QUESTION` | Invalid question data (defensive) |
| `INVALID_CHOICE` | Invalid choice reference |

**Note:** Three error codes from SPEC-003 (`INVALID_SESSION`, `SESSION_ALREADY_ENDED`, `NO_QUESTIONS_MATCH`) were specified but intentionally not implemented — session validation is handled at the application layer via `ApplicationError`.

### 1.5 Test Coverage

Every service and value object has colocated `.test.ts` files (16 test files total). Entity files are pure types with no runtime behavior, so they correctly have no tests. Domain test helpers provide factories: `createQuestion()`, `createChoice()`, `createAttempt()`, `createBookmark()`, `createPracticeSession()`, `createSubscription()`, `createUser()`, `createTag()`.

---

## 2. Application Layer

### 2.1 Use Cases

All use cases follow the pattern: constructor injection of port interfaces, single `execute()` method, `ApplicationError` with typed codes for all error paths. They live in `src/application/use-cases/`.

#### Core Question Loop

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `GetNextQuestion` | `{ userId, sessionId?, questionId? }` or `{ userId, filters }` | `NextQuestion` (stem, choices without `isCorrect`, session info) or `null` | `NOT_FOUND` |
| `SubmitAnswer` | `{ userId, questionId, choiceId, sessionId?, timeSpentSeconds? }` | `{ attemptId, isCorrect, correctChoiceId, explanationMd?, choiceExplanations[] }` | `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR` |

#### Practice Sessions

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `StartPracticeSession` | `{ userId, mode, count, tagSlugs, difficulties }` | `{ sessionId }` | `NOT_FOUND` (no matching questions) |
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
| `GetPreviousAttempt` | `{ userId, questionId }` | Previous attempt state with shuffled choice views, or `null` | `NOT_FOUND` |

#### Dashboard

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `GetUserStats` | `{ userId }` | Stats (total, accuracy, streak, recent activity with session context) | (graceful degradation) |

### 2.2 Ports (Interfaces)

Ports define what the application layer needs from the outside world. The actual `AttemptRepository` is composed of 7 segregated sub-interfaces following ISP:

- `AttemptWriter` — `insert`, `deleteById`
- `AttemptHistoryReader` — `findByUserId` (paginated)
- `AttemptSessionReader` — `findBySessionId`
- `AttemptStatsReader` — counts, recent, streak data
- `AttemptAllQuestionsReader` — paginated attempted question summaries with result/source filters
- `AttemptSingleQuestionReader` — most recent attempt for a specific question (review mode)
- `AttemptMostRecentAnsweredAtReader` — for question selection ordering

Other ports: `QuestionRepository` (4 methods), `PracticeSessionRepository` (7 methods with CAS concurrency), `BookmarkRepository` (4 methods), `TagRepository` (1 method).

### 2.3 Test Coverage

**100% — every use case has a colocated test file.** All tests use fakes from `src/application/test-helpers/fakes/`. Zero `vi.mock()` on application code.

---

## 3. Adapters Layer

### 3.1 Repositories (Drizzle ORM)

| Repository | Port Interface | Methods | Key Patterns |
|-----------|---------------|---------|-------------|
| `DrizzleQuestionRepository` | `QuestionRepository` | 4 | Relational loading with `with:` clause; tag-filtered candidate query uses `INNER JOIN + GROUP BY` |
| `DrizzleAttemptRepository` | `AttemptRepository` (composite) | 14 | `ROW_NUMBER()` window function for missed questions; partial unique index `(practiceSessionId, questionId)` prevents duplicate session answers |
| `DrizzlePracticeSessionRepository` | `PracticeSessionRepository` | 7 | Optimistic concurrency (CAS) with 3 retries for `recordQuestionAnswer` and `setQuestionMarkedForReview`; Zod validation on `paramsJson` read/write |
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
| `practice-controller` | `startPracticeSession`, `getIncompletePracticeSession`, `endPracticeSession`, `getPracticeSessionReview`, `getSessionHistory`, `setPracticeSessionQuestionMark` | startPracticeSession: yes | start/end/mark: yes |
| `bookmark-controller` | `toggleBookmark`, `getBookmarks` | toggleBookmark: yes | toggleBookmark: yes |
| `tag-controller` | `getTags` | no | no |
| `review-controller` | `getAttemptedQuestions` | no | no |
| `stats-controller` | `getUserStats` | no | no |

### 3.3 Database Schema

Practice-related tables in `db/schema.ts`:

| Table | Indexes | Notes |
|-------|---------|-------|
| `questions` | `slug` (unique), `status+difficulty`, `status+createdAt` | Published questions only served to users |
| `choices` | `questionId`, `question+label` (unique), `question+sortOrder` (unique) | Always 4 choices per question (A/B/C/D) |
| `tags` | `slug` (unique), `kind+slug` | 5 kinds: domain, topic, substance, treatment, diagnosis |
| `question_tags` | Composite PK, `tagId`, `questionId` | Many-to-many |
| `practice_sessions` | `user+startedAt`, `user+endedAt` | `paramsJson` stores questionIds + questionStates |
| `attempts` | 7 indexes covering all query patterns | Partial unique on `(sessionId, questionId)` prevents duplicate session answers |
| `bookmarks` | Composite PK, `user+createdAt`, `questionId` | Idempotent add via `ON CONFLICT DO NOTHING` |

### 3.4 Test Coverage

All 5 repositories have colocated unit tests (48 test cases total) plus shared integration tests in `tests/integration/repositories.integration.test.ts`.
