# Practice Engine: Architecture Layers

> **Parent:** [Practice Engine Index](./index.md)
> **Scope:** Clean Architecture layers — Domain, Application, Adapters
> **Last Verified:** 2026-03-17

---

## 1. Domain Layer

### 1.1 Entities

All entities are pure TypeScript type aliases with no runtime behavior. They live in `src/domain/entities/`.

| Entity | Key Fields | Purpose |
|--------|-----------|---------|
| `Question` | `id`, `slug`, `stemMd`, `explanationMd`, `difficulty`, `status`, `choices[]`, `tags[]` | A board-prep question with markdown content |
| `Choice` | `id`, `questionId`, `label` (A–E), `textMd`, `isCorrect`, `explanationMd`, `sortOrder` | One answer choice; `explanationMd` is per-choice (beyond question-level explanation) |
| `Attempt` | `id`, `userId`, `questionId`, `practiceSessionId` (nullable), `selectedChoiceId`, `isCorrect`, `timeSpentSeconds`, `retryOfAttemptId` (nullable), `retryOrigin` (nullable), `retrySessionId` (nullable), `answeredAt` | A single answer submission with optional retry provenance lineage |
| `PracticeSession` | `id`, `userId`, `mode`, `questionIds[]`, `questionStates[]`, `tagFilters[]`, `difficultyFilters[]`, `startedAt`, `endedAt` (nullable) | A structured practice session (tutor or exam) |
| `PracticeSessionQuestionState` | `questionId`, `markedForReview`, `latestSelectedChoiceId` (nullable), `latestIsCorrect` (nullable), `latestAnsweredAt` (nullable) | Per-question state within a session |
| `Bookmark` | `userId`, `questionId`, `createdAt` | A user-saved question |
| `Tag` | `id`, `slug`, `name`, `kind` | A categorization label (domain/exam section, topic, substance, treatment, diagnosis) |

### 1.2 Value Objects

All value objects provide union string types (derived from `All*` constants), validation functions, and "All" constants. They live in `src/domain/value-objects/`.

| Value Object | Values | Key Function |
|-------------|--------|-------------|
| `PracticeMode` | `'tutor'` \| `'exam'` | `shouldShowExplanationForMode()` |
| `QuestionDifficulty` | `'easy'` \| `'medium'` \| `'hard'` | `isValidDifficulty()` |
| `QuestionStatus` | `'draft'` \| `'published'` \| `'archived'` | `isVisibleStatus()` |
| `ChoiceLabel` | `'A'` \| `'B'` \| `'C'` \| `'D'` \| `'E'` | `isValidChoiceLabel()` |
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

Every service and value object has colocated `.test.ts` files (17+ files total, including factory tests). Most entity files are pure types, but `attempt.ts` includes runtime provenance validation helpers and is covered by unit tests. Domain test helpers provide factories: `createQuestion()`, `createChoice()`, `createAttempt()`, `createBookmark()`, `createPracticeSession()`, `createSubscription()`, `createUser()`, `createTag()`.

---

## 2. Application Layer

### 2.1 Use Cases

All use cases follow the pattern: constructor injection of port interfaces, single `execute()` method, `ApplicationError` with typed codes for all error paths. They live in `src/application/use-cases/`.

#### Core Question Loop

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `GetNextQuestion` | `{ userId, sessionId, questionId?, fromIndex? }` or `{ userId, filters }` | `NextQuestion` (stem, choices without `isCorrect`, session info) or `null` | `NOT_FOUND`, `VALIDATION_ERROR` |
| `SubmitAnswer` | `{ userId, questionId, choiceId, sessionId?, timeSpentSeconds?, retryOfAttemptId?, retryOrigin?, retrySessionId? }` | `{ attemptId, isCorrect: boolean \| null, correctChoiceId: string \| null, explanationMd: string \| null, referenceMd: string \| null, choiceExplanations[] }` | `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`, `VALIDATION_ERROR` |

Answer-key exposure in active exam contexts is governed by the [Exam Answer Secrecy Policy](./exam-answer-secrecy-policy.md).

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

- `AttemptWriter` — `insert`, `deleteById`
- `AttemptHistoryReader` — `findByUserId` (paginated)
- `AttemptSessionReader` — `findBySessionId`
- `AttemptStatsReader` — counts, recent, streak data
- `AttemptAllQuestionsReader` — paginated attempted question summaries with result/source filters
- `AttemptSingleQuestionReader` — most recent attempt for a specific question (review mode)
- `AttemptMostRecentAnsweredAtReader` — for question selection ordering

Other ports: `QuestionRepository` (5 methods), `PracticeSessionRepository` (7 methods with CAS concurrency), `BookmarkRepository` (4 methods), `TagRepository` (1 method).

### 2.3 Test Coverage

Every practice-engine use case has a colocated test file. All tests use fakes from `src/application/test-helpers/fakes/`. Zero `vi.mock()` on application code.

---

## 3. Adapters Layer

### 3.1 Repositories (Drizzle ORM)

| Repository | Port Interface | Methods | Key Patterns |
|-----------|---------------|---------|-------------|
| `DrizzleQuestionRepository` | `QuestionRepository` | 5 | Relational loading with `with:` clause; tag-filtered candidate query uses `INNER JOIN + GROUP BY` |
| `DrizzleAttemptRepository` | `AttemptRepository` (composite) | 14 | `row_number()` window function selects latest attempt per question (attempted-question summaries); partial unique index `(practiceSessionId, questionId)` prevents duplicate session answers |
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
| `question-view-controller` | `getQuestionBySlug`, `getPreviousAttempt` | no | no |
| `practice-controller` | `startPracticeSession`, `countAvailableQuestions`, `getIncompletePracticeSession`, `endPracticeSession`, `getPracticeSessionReview`, `getSessionHistory`, `setPracticeSessionQuestionMark` | startPracticeSession: yes | start/end/mark: yes |
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
| `tags` | `slug` (unique), `kind+slug` | 5 kinds: domain, topic, substance, treatment, diagnosis |
| `question_tags` | Composite PK, `tagId`, `questionId` | Many-to-many |
| `practice_sessions` | `user+startedAt`, `user+endedAt` | `paramsJson` stores questionIds + questionStates |
| `attempts` | 8+ indexes covering query patterns | Partial unique on `(practiceSessionId, questionId)` prevents duplicate session answers; includes retry lineage fields (`retryOfAttemptId`, `retryOrigin`, `retrySessionId`) and retry-parent index |
| `bookmarks` | Composite PK, `user+createdAt`, `questionId` | Idempotent add via `ON CONFLICT DO NOTHING` |

### 3.4 Test Coverage

All five core practice-engine repositories have colocated unit tests plus domain-scoped integration tests in `tests/integration/` (for example `question-repository.integration.test.ts` and `session-attempt-repository.integration.test.ts`).
