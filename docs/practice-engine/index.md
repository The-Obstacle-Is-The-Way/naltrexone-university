# Practice Engine

> **Type:** Canonical Reference Document (Living)
> **Last Verified:** 2026-02-09
> **Scope:** Everything related to practicing questions — the core product feature

---

## 1. What Is the Practice Engine?

The Practice Engine is the core feature of Naltrexone University. It's the system that lets subscribed users answer board-prep questions, track their progress, and review their performance. Every other feature (dashboard stats, bookmarks, review) is a consumer of data produced by the Practice Engine.

**User perspective:** "I open the app, answer questions, see if I'm right, learn from explanations, track my score over time."

**System perspective:** A vertical slice through every Clean Architecture layer — from domain entities to database schema to React UI — orchestrating question selection, answer grading, session management, and progress tracking.

---

## 2. Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (app/)                             │
│  /app/practice          — Practice landing (sessions + history)     │
│  /app/practice/quick    — Quick Practice (ad-hoc, no session)       │
│  /app/practice/[sessionId] — Session runner (tutor/exam)            │
│  /app/dashboard         — Stats + recent activity (consumer)        │
│  /app/review            — Missed questions (consumer)               │
│  /app/bookmarks         — Saved questions (consumer)                │
│  /app/questions/[slug]  — Individual question reattempt              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Server Actions ('use server')
┌──────────────────────────────┴──────────────────────────────────────┐
│                      Controllers (adapters/)                        │
│  question-controller    — getNextQuestion, submitAnswer             │
│  practice-controller    — start/end session, review, history, mark  │
│  bookmark-controller    — toggle, list                              │
│  tag-controller         — listAll                                   │
│  review-controller      — getMissedQuestions                        │
│  stats-controller       — getUserStats                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Use Case calls
┌──────────────────────────────┴──────────────────────────────────────┐
│                      Use Cases (application/)                       │
│  GetNextQuestion         StartPracticeSession                       │
│  SubmitAnswer            EndPracticeSession                         │
│  ToggleBookmark          GetIncompletePracticeSession                │
│  GetBookmarks            GetPracticeSessionReview                    │
│  GetMissedQuestions      SetPracticeSessionQuestionMark              │
│  GetUserStats            GetSessionHistory                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Port interfaces
┌──────────────────────────────┴──────────────────────────────────────┐
│                      Ports (application/ports/)                     │
│  QuestionRepository      AttemptRepository (6 sub-interfaces)       │
│  PracticeSessionRepository  BookmarkRepository  TagRepository       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Implementations
┌──────────────────────────────┴──────────────────────────────────────┐
│                   Repositories (adapters/repositories/)              │
│  DrizzleQuestionRepository     DrizzleAttemptRepository              │
│  DrizzlePracticeSessionRepository  DrizzleBookmarkRepository         │
│  DrizzleTagRepository                                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ SQL via Drizzle ORM
┌──────────────────────────────┴──────────────────────────────────────┐
│                      Database (db/schema.ts)                        │
│  questions  choices  tags  question_tags                             │
│  attempts   practice_sessions   bookmarks                           │
└─────────────────────────────────────────────────────────────────────┘
```

Dependencies point **inward only** (Clean Architecture, ADR-001). The domain layer has zero external imports.

---

## 3. Domain Layer

### 3.1 Entities

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

### 3.2 Value Objects

All value objects provide branded string types, validation functions, and "All" constants. They live in `src/domain/value-objects/`.

| Value Object | Values | Key Function |
|-------------|--------|-------------|
| `PracticeMode` | `'tutor'` \| `'exam'` | `shouldShowExplanationForMode()` |
| `QuestionDifficulty` | `'easy'` \| `'medium'` \| `'hard'` | `isValidDifficulty()` |
| `QuestionStatus` | `'draft'` \| `'published'` \| `'archived'` | `isVisibleStatus()` |
| `ChoiceLabel` | `'A'` \| `'B'` \| `'C'` \| `'D'` | `isValidChoiceLabel()` |
| `TagKind` | `'domain'` \| `'topic'` \| `'substance'` \| `'treatment'` \| `'diagnosis'` | `isValidTagKind()` |
| `SubscriptionStatus` | 8 statuses | `isEntitledStatus()` — includes `'active'`, `'inTrial'`, `'pastDue'` |

### 3.3 Domain Services

Pure functions with zero side effects. They live in `src/domain/services/`.

| Service | Functions | Purpose |
|---------|----------|---------|
| `grading.ts` | `gradeAnswer(question, choiceId)` → `GradeResult` | Determines correctness of a submitted answer |
| `entitlement.ts` | `isEntitled(subscription, now)` | Checks subscription + period-end for access |
| `session.ts` | `computeSessionProgress()`, `shouldShowExplanation()`, `getNextQuestionId()` | Session state machine helpers |
| `statistics.ts` | `computeAccuracy()`, `computeStreak()`, `filterAttemptsInWindow()` | Dashboard stat computations |
| `shuffle.ts` | `shuffleWithSeed()`, `createSeed()`, `createQuestionSeed()` | Deterministic question/choice ordering |
| `question-selection.ts` | `selectNextQuestionId(candidates, history)` | Picks next question prioritizing least-recently-seen |

### 3.4 Domain Errors

| Code | Used For |
|------|---------|
| `INVALID_QUESTION` | Invalid question data (defensive) |
| `INVALID_CHOICE` | Invalid choice reference |

**Note:** Three error codes from SPEC-003 (`INVALID_SESSION`, `SESSION_ALREADY_ENDED`, `NO_QUESTIONS_MATCH`) were specified but intentionally not implemented — session validation is handled at the application layer via `ApplicationError`.

### 3.5 Test Coverage

Every service and value object has colocated `.test.ts` files (14 test files total). Entity files are pure types with no runtime behavior, so they correctly have no tests. Domain test helpers provide factories: `createQuestion()`, `createChoice()`, `createAttempt()`, `createBookmark()`, `createPracticeSession()`, `createSubscription()`, `createUser()`, `createTag()`.

---

## 4. Application Layer

### 4.1 Use Cases

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
| `GetMissedQuestions` | `{ userId, limit, offset }` | Paginated missed questions with session context | (graceful degradation) |

#### Dashboard

| Use Case | Input | Output | Error Codes |
|----------|-------|--------|-------------|
| `GetUserStats` | `{ userId }` | Stats (total, accuracy, streak, recent activity with session context) | (graceful degradation) |

### 4.2 Ports (Interfaces)

Ports define what the application layer needs from the outside world. The actual `AttemptRepository` is composed of 6 segregated sub-interfaces following ISP:

- `AttemptWriter` — `insert`, `deleteById`
- `AttemptHistoryReader` — `findByUserId` (paginated)
- `AttemptSessionReader` — `findBySessionId`
- `AttemptStatsReader` — counts, recent, streak data
- `AttemptMissedQuestionsReader` — missed questions with window function
- `AttemptMostRecentAnsweredAtReader` — for question selection ordering

Other ports: `QuestionRepository` (4 methods), `PracticeSessionRepository` (7 methods with CAS concurrency), `BookmarkRepository` (4 methods), `TagRepository` (1 method).

### 4.3 Test Coverage

**100% — every use case has a colocated test file.** All tests use fakes from `src/application/test-helpers/fakes/`. Zero `vi.mock()` on application code.

---

## 5. Adapters Layer

### 5.1 Repositories (Drizzle ORM)

| Repository | Port Interface | Methods | Key Patterns |
|-----------|---------------|---------|-------------|
| `DrizzleQuestionRepository` | `QuestionRepository` | 4 | Relational loading with `with:` clause; tag-filtered candidate query uses `INNER JOIN + GROUP BY` |
| `DrizzleAttemptRepository` | `AttemptRepository` (composite) | 14 | `ROW_NUMBER()` window function for missed questions; partial unique index `(practiceSessionId, questionId)` prevents duplicate session answers |
| `DrizzlePracticeSessionRepository` | `PracticeSessionRepository` | 7 | Optimistic concurrency (CAS) with 3 retries for `recordQuestionAnswer` and `setQuestionMarkedForReview`; Zod validation on `paramsJson` read/write |
| `DrizzleBookmarkRepository` | `BookmarkRepository` | 4 | `ON CONFLICT DO NOTHING` for idempotent add |
| `DrizzleTagRepository` | `TagRepository` | 1 | `SELECT DISTINCT` with join to published questions only |

### 5.2 Controllers (Server Actions)

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
| `review-controller` | `getMissedQuestions` | no | no |
| `stats-controller` | `getUserStats` | no | no |

### 5.3 Database Schema

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

### 5.4 Test Coverage

All 5 repositories have colocated unit tests (48 test cases total) plus shared integration tests in `tests/integration/repositories.integration.test.ts`.

---

## 6. Frontend Layer

### 6.1 Routes

| Route | Type | Purpose | Status |
|-------|------|---------|--------|
| `/app/practice` | Server → Client | Landing page — decision point (session starter, incomplete session card, session history). No question loads on mount. | Implemented (SPEC-019 Phase 2) |
| `/app/practice/quick` | Server → Client | Quick Practice — ad-hoc question flow, random question, immediate feedback, no session tracking. | Implemented (SPEC-019 Phase 2) |
| `/app/practice/[sessionId]` | Server → Client | Session runner — progress, question flow, exam review stage, summary | Implemented |
| `/app/dashboard` | Server Component | Stats cards + recent activity (consumer of `getUserStats`) | Implemented |
| `/app/review` | Server Component | Missed questions list — shows only questions whose most recent attempt is incorrect (consumer of `getMissedQuestions`) | Implemented |
| `/app/bookmarks` | Server Component | Bookmarked questions (consumer of `getBookmarks`) | Implemented |
| `/app/questions/[slug]` | Client Component | Individual question reattempt | Implemented |

### 6.2 Practice Route Hook Architecture

```text
PracticePageClient (/app/practice)
└── usePracticeSessionControls (81 lines, composite)
│   ├── usePracticeSessionStart (135 lines)
│   ├── usePracticeSessionTags (51 lines)
│   ├── usePracticeIncompleteSession (105 lines)
│   └── usePracticeSessionHistory (124 lines)

QuickPracticeClient (/app/practice/quick)
└── usePracticeQuestionFlow (55 lines, composite)
    ├── usePracticeQuestionAnswerFlow (164 lines) ← over 150-line guideline
    └── usePracticeQuestionBookmarks (107 lines)
```

### 6.3 Session Page Hook Architecture

```text
PracticeSessionPageClient
└── usePracticeSessionPageController (102 lines, composite)
    ├── usePracticeSessionQuestionFlow (195 lines) ← over 150-line guideline
    ├── usePracticeQuestionBookmarks (107 lines, reused)
    ├── usePracticeSessionReviewStage (220 lines) ← over 150-line guideline
    │   ├── usePracticeSessionNavigator (94 lines)
    │   └── usePracticeSessionSummaryReview (79 lines)
    └── usePracticeSessionMarkForReview (120 lines)
```

### 6.4 Data Flow

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

Components import only **types** from controllers. All server action calls flow through hooks. This is architecturally correct.

### 6.5 Shared UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `QuestionCard` | `components/question/question-card.tsx` | Renders question stem + choice buttons with `<fieldset>` a11y |
| `ChoiceButton` | `components/question/choice-button.tsx` | Radio-style choice with correctness states |
| `Feedback` | `components/question/feedback.tsx` | Correct/incorrect banner with explanation markdown |
| `ErrorCard` | `components/error-card.tsx` | Styled error alert with `role="alert"` |
| `Markdown` | `components/markdown/Markdown.tsx` | `react-markdown` + `remark-gfm` + `rehype-sanitize` |

### 6.6 Error Handling

Every async operation in every hook has try/catch + `ActionResult` error checking. Error display:

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

**No silent failures exist.** The `fireAndForget` utility catches unhandled promise rejections as a safety net.

---

## 7. Practice Modes

The Practice Engine supports three distinct user experiences:

| Mode | Route | Session? | Explanation Timing | Progress | Summary |
|------|-------|----------|-------------------|----------|---------|
| **Ad-hoc (Quick Practice)** | `/app/practice/quick` | No | Immediate | No | No |
| **Tutor** | `/app/practice/[sessionId]` | Yes | Immediate after each answer | X/N counter | Yes (totals + per-question) |
| **Exam** | `/app/practice/[sessionId]` | Yes | Hidden until session ends | X/N counter + mark-for-review | Yes (totals + per-question + explanations revealed) |

### 7.1 Session Lifecycle

```text
[User configures mode/count/tags/difficulty]
    ↓
StartPracticeSession → creates session with shuffled questionIds
    ↓
[Question loop: getNextQuestion → render → submitAnswer → repeat]
    ↓ (tutor: explanation shown immediately)
    ↓ (exam: answer stored, no explanation)
    ↓
EndPracticeSession → computes totals from questionStates
    ↓
[Summary view: totals + per-question breakdown]
    ↓ (exam: all explanations now revealed)
```

### 7.2 Exam Mode Special Features

- **Mark for review:** Users can flag questions during the session. `SetPracticeSessionQuestionMark` persists the flag. Only available in exam mode.
- **Review stage:** Before finalizing, users see a navigator grid showing answered/unanswered/marked questions and can jump to any question.
- **Deferred explanations:** `SubmitAnswer` returns `explanationMd: null` for active exam sessions. Explanations become visible only after `EndPracticeSession`.

### 7.3 Question Selection

For sessions, questions are selected at creation time:
1. `listPublishedCandidateIds(filters)` — get all matching question IDs
2. `shuffleWithSeed(candidates, createSeed(userId, now))` — deterministic shuffle
3. Take first `count` questions → persist as `questionIds` in `paramsJson`

For ad-hoc mode, `selectNextQuestionId()` picks the least-recently-seen question from candidates matching the user's attempt history.

### 7.4 Answer Grading

`gradeAnswer(question, choiceId)` → `{ isCorrect, correctChoiceId }`. Pure domain function. The use case then:
1. Inserts an `Attempt` row
2. If session: updates `questionStates` via CAS (optimistic concurrency, 3 retries)
3. Returns grading result + explanations (gated by mode)

### 7.5 Concurrency Protection

- **Duplicate session answers:** Partial unique index `attempts(practiceSessionId, questionId)` prevents two concurrent submits for the same question in a session. Postgres error code `23505` is caught and mapped to `ApplicationError('CONFLICT')`.
- **Session state updates:** CAS (compare-and-swap) pattern — read current `paramsJson`, compute update, write with `WHERE paramsJson = expectedValue`. Retries up to 3 times on conflict.

---

## 8. Security Model

| Concern | Implementation |
|---------|---------------|
| **Authentication** | Every action calls `authGateway.requireUser()` via `requireEntitledUserId()` |
| **Authorization** | Every action checks subscription entitlement via `checkEntitlementUseCase` |
| **User scoping** | All repository queries include `userId` in WHERE clauses — no cross-user data access |
| **Input validation** | All controller inputs validated with strict Zod schemas (UUIDs, bounded pagination, mode enums) |
| **Rate limiting** | Mutation-heavy actions: `startPracticeSession`, `submitAnswer`, `toggleBookmark` |
| **Idempotency** | All mutations use idempotency keys to prevent duplicate operations |
| **No correctness leakage** | `isCorrect` never sent to client before answering; exam explanations hidden until session end |
| **Error sanitization** | `handleError()` maps all unknown errors to `'Internal error'` — no stack traces leak |

---

## 9. Current State and Known Issues

### 9.1 What's Fully Working

- All three practice modes (ad-hoc, tutor, exam)
- Session lifecycle: create → answer → navigate → review → end → summary
- In-run question navigation (back/jump) in both tutor and exam modes
- Per-question session summary with explanations
- Bookmark toggle on question view
- Dashboard stats with session context (grouping by session)
- Review page with session origin badges
- Session history with drill-down to per-question breakdown
- Error handling with visible recovery actions everywhere
- Idempotency and rate limiting on all mutations

### 9.2 Open Debt (Practice-Specific)
*No practice-specific open debt items as of 2026-02-09.*

### 9.3 SPEC-019 Status (UX Redesign)

| Phase | Status | What's Left |
|-------|--------|------------|
| **Phase 1: Stabilize** | Done | All acceptance criteria met |
| **Phase 2: UX Redesign** | **Implemented** (2026-02-09) | Done — `/app/practice/quick` created; `/app/practice` refactored into landing page; `APP_PRACTICE_QUICK` route constant added |
| **Phase 3: Cross-Page IA** | Partial (2 of 13 tasks done) | Dashboard activity clickable; difficulty badges; collapsible tag filters; review subtitle + empty state; origin-aware back links on question detail page |

### 9.4 Product Decisions (2026-02-09)

| Decision | Outcome | Reference |
|----------|---------|-----------|
| **Review page scope** | Missed-only (most recent attempt incorrect). NOT an "all questions" library. Clarify via subtitle text, not scope expansion. | SPEC-014 |
| **Session runner route** | Stays at `/app/practice/[sessionId]` (NOT renamed to `/app/practice/sessions/[id]`). Static `quick` segment takes priority over dynamic `[sessionId]` in Next.js routing. | SPEC-019 §5.2 |
| **Nav label** | Keep "Review" in nav (not "Missed Questions"). Shorter, cleaner — subtitle disambiguates on the page itself. | SPEC-019 §5.4.3 |

---

## 10. Spec Coverage Map

This section maps each part of the Practice Engine to the spec that defines it.

| Component | Primary Spec | Status | Notes |
|-----------|-------------|--------|-------|
| Domain entities (Question, Choice, Attempt, PracticeSession, Bookmark, Tag) | SPEC-001 | Implemented | Fully compliant |
| Value objects (PracticeMode, QuestionDifficulty, etc.) | SPEC-002 | Implemented | Synced to implementation (EntitledStatuses includes `pastDue`) |
| Domain services (grading, session, statistics, shuffle, question-selection) | SPEC-003 | Implemented | Synced to implementation (`createQuestionSeed()`, `selectNextQuestionId()`) |
| Application ports (all repository interfaces) | SPEC-004 | Implemented | Synced to implementation (ISP composite `AttemptRepository`, port-per-module structure) |
| Core use cases (application orchestration) | SPEC-005 | Implemented | Synced to implementation (full use-case inventory documented) |
| Database schema | SPEC-006 | Implemented | Synced to implementation (`rate_limits`, `idempotency_keys`, partial unique attempt index) |
| Repository implementations | SPEC-007 | Implemented | Synced to implementation (includes `DrizzleIdempotencyKeyRepository`; unit + integration testing strategy) |
| Server actions / controllers | SPEC-010 | Implemented | Synced to implementation (`ActionErrorCode` = `ApplicationErrorCode`; `createAction` + `handleError`) |
| Core question loop (fetch → render → submit → grade → explain) | SPEC-012 | Implemented | Fully compliant |
| Practice sessions (start → answer → navigate → review → end → summary) | SPEC-013 | Implemented | Fully compliant |
| Review + bookmarks | SPEC-014 | Implemented | Cross-page UX improvements deferred to SPEC-019 Phase 3 |
| Dashboard stats | SPEC-015 | Implemented | Clickable activity items deferred to SPEC-019 Phase 3 |
| UI integration patterns | SPEC-018 | Implemented | No architecture violations |
| Practice UX redesign | SPEC-019 | Partial | Phase 1 done; Phase 2 implemented (2026-02-09); Phase 3 partial |
| Practice engine completion (decomposition, navigation, enriched summary, session history) | SPEC-020 | Implemented | All 4 phases complete |

### 10.1 Spec Drift Summary

As of **2026-02-09**, the previously identified spec drift items for the Practice Engine have been paid down by syncing the core specs (ports, use cases, schema, repositories, controllers) to the current implementation.

When behavior changes introduce new public contracts (ports/use case IO/controller outputs), update the corresponding spec and add a changelog entry.

---

## 11. File Index

### Domain (`src/domain/`)

```
entities/
  question.ts, choice.ts, attempt.ts, practice-session.ts, bookmark.ts, tag.ts, user.ts, subscription.ts, index.ts
value-objects/
  practice-mode.ts, question-difficulty.ts, question-status.ts, choice-label.ts, tag-kind.ts,
  subscription-plan.ts, subscription-status.ts, index.ts
  (each with colocated .test.ts)
services/
  grading.ts, entitlement.ts, session.ts, statistics.ts, shuffle.ts, question-selection.ts, index.ts
  (each with colocated .test.ts)
errors/
  domain-errors.ts, index.ts (with .test.ts)
test-helpers/
  factories.ts, index.ts
```

### Application (`src/application/`)

```
ports/
  question-repository.ts, attempt-repository.ts, practice-session-repository.ts,
  bookmark-repository.ts, tag-repository.ts, logger.ts, gateways.ts,
  subscription-repository.ts, stripe-customer-repository.ts, stripe-event-repository.ts,
  idempotency-key-repository.ts, user-repository.ts, use-cases.ts, billing.ts, bookmarks.ts
use-cases/
  get-next-question.ts, submit-answer.ts, start-practice-session.ts, end-practice-session.ts,
  get-incomplete-practice-session.ts, get-practice-session-review.ts,
  set-practice-session-question-mark.ts, get-session-history.ts,
  toggle-bookmark.ts, get-bookmarks.ts, get-missed-questions.ts, get-user-stats.ts,
  check-entitlement.ts, create-checkout-session.ts, create-portal-session.ts
  (each with colocated .test.ts)
errors/
  application-errors.ts
test-helpers/
  fakes/ (fake-logger.ts, fake-repositories.ts, fake-gateways.ts, fake-use-cases.ts, index.ts)
```

### Adapters (`src/adapters/`)

```
repositories/
  drizzle-question-repository.ts, drizzle-attempt-repository.ts,
  drizzle-practice-session-repository.ts, drizzle-bookmark-repository.ts,
  drizzle-tag-repository.ts, ...
  (each with colocated .test.ts)
controllers/
  question-controller.ts, practice-controller.ts, bookmark-controller.ts,
  tag-controller.ts, review-controller.ts, stats-controller.ts,
  create-action.ts, action-result.ts, require-entitled-user-id.ts, ...
```

### Frontend (`app/`)

```
(app)/app/practice/
  page.tsx, loading.tsx, error.tsx
  hooks/ (8 hook files)
  components/ (practice-view.tsx, practice-session-starter.tsx, incomplete-session-card.tsx, practice-session-history-panel.tsx)
  shared/ (question-flow-actions.ts, load-state.ts)
  quick/
    page.tsx, loading.tsx, error.tsx, quick-practice-client.tsx
  [sessionId]/
    page.tsx, loading.tsx
    hooks/ (6 hook files)
    components/ (practice-session-page-view.tsx, session-summary-view.tsx, exam-review-view.tsx, practice-session-page-client.tsx)
(app)/app/dashboard/page.tsx
(app)/app/review/page.tsx
(app)/app/bookmarks/page.tsx
(app)/app/questions/[slug]/ (question-page-client.tsx)
```

---

## 12. Related Documentation

| Document | Purpose |
|----------|---------|
| [Master Spec](specs/master_spec.md) | Complete technical specification (SSOT) |
| [SPEC-012](specs/spec-012-core-question-loop.md) | Core question loop requirements |
| [SPEC-013](specs/spec-013-practice-sessions.md) | Practice session requirements |
| [SPEC-014](specs/spec-014-review-bookmarks.md) | Review + bookmarks requirements |
| [SPEC-015](specs/spec-015-dashboard.md) | Dashboard requirements |
| [SPEC-019](specs/spec-019-practice-ux-redesign.md) | UX redesign (Phase 2 implemented; Phase 3 partial) |
| [SPEC-020](specs/spec-020-practice-engine-completion.md) | Practice engine completion (all done) |
| [ADR-001](adr/adr-001-clean-architecture-layers.md) | Clean Architecture decision |
| [ADR-003](adr/adr-003-testing-strategy.md) | Testing strategy (TDD, fakes over mocks) |
| [ADR-006](adr/adr-006-error-handling-strategy.md) | Error handling (ApplicationError) |
| [ADR-015](adr/adr-015-idempotency-strategy.md) | Idempotency strategy |
| [Frontend Standards](frontend/standards.md) | UI/UX standards and known violations |
| [Debt Register](debt/index.md) | All open technical debt |

---

## 13. Changelog

| Date | Change |
|------|--------|
| 2026-02-08 | Initial version — created from full vertical audit of domain → application → adapters → frontend layers. Cross-referenced against SPEC-001 through SPEC-020. |
| 2026-02-09 | Synced with SPEC-019 updates: Phase 2 now "Ready for Implementation"; routes table adds `/app/practice/quick` (pending); practice mode table updated; Section 9.4 added for product decisions (review = missed-only, session runner route stays, nav label stays "Review"). |
| 2026-02-09 | Implemented SPEC-019 Phase 2: `/app/practice` is now landing-only, `/app/practice/quick` hosts ad-hoc question flow, and the route/status tables updated accordingly. |
