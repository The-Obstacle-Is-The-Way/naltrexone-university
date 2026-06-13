# Bookmarks — Feature Dossier

**Feature:** Bookmarking (cross-cutting, not a single page)
**Last Updated:** 2026-03-19
**Related:** [BS-053](../../brainstorming/bs-053-bookmark-vs-mark-for-review-collision.md) (bookmark vs mark-for-review collision), [BS-052](../../brainstorming/bs-052-bookmark-icon-toggle-replacement.md) (bookmark icon toggle), [Bookmark Surface Policy](../bookmark-surface-policy.md)

---

## Overview

Bookmarking is a **global, permanent curation feature** — "save this question for future study." It is distinct from the session-scoped "Mark for Review" exam feature. A bookmark persists in a dedicated database table and survives session completion, unlike mark-for-review which lives in session JSON and dies with the exam.

This dossier documents the **complete vertical slice** — from database schema to UI — including bookmark-specific behavior, bookmark-adjacent routing, and bookmark-backed filtering. Barrel re-exports and generic DI/type-aggregate files are excluded unless they carry bookmark-specific behavior.

---

## 1. Domain Layer

### Entity

**File:** `src/domain/entities/bookmark.ts`

```typescript
type Bookmark = {
  readonly userId: string;
  readonly questionId: string;
  readonly createdAt: Date;
};
```

Lightweight composite-key entity. No behavior, no validation — just a tuple of (user, question, timestamp).

### Factory

**File:** `src/domain/test-helpers/factories.ts`

```typescript
createBookmark(overrides?: Partial<Bookmark>): Bookmark
// Defaults: userId='user-1', questionId='question-1', createdAt=new Date()
```

### Repository Port

**File:** `src/application/ports/bookmark-repository.ts`

```typescript
interface BookmarkRepository {
  exists(userId: string, questionId: string): Promise<boolean>;
  add(userId: string, questionId: string): Promise<Bookmark>;
  remove(userId: string, questionId: string): Promise<boolean>; // true=removed, false=already absent
  listByUserId(userId: string): Promise<readonly Bookmark[]>;
}
```

Four methods. No pagination, no filtering — the full bookmark list is always fetched. This is acceptable at current scale but may need pagination if bookmark counts grow large.

---

## 2. Application Layer

### Use Cases

**ToggleBookmarkUseCase** — `src/application/use-cases/toggle-bookmark.ts`

- Injected deps: `BookmarkRepository`, `QuestionRepository`
- Input: `{ userId, questionId }`
- Output: `{ bookmarked: boolean }`
- Logic: Try remove first → if removed, return `{ bookmarked: false }`. Otherwise validate question exists (throws `NOT_FOUND` if missing), add bookmark, return `{ bookmarked: true }`.
- This is a toggle, not separate add/remove — single call flips state.

**GetBookmarksUseCase** — `src/application/use-cases/get-bookmarks.ts`

- Injected deps: `BookmarkRepository`, `QuestionRepository`, `Logger`
- Input: `{ userId }`
- Output: `{ rows: BookmarkRow[] }` where each row is either `AvailableBookmarkRow` (with slug, stemMd, difficulty) or `UnavailableBookmarkRow` (question deleted/unpublished)
- Enriches each bookmark with question data. Logs warning for unavailable questions.

### Port Types

**File:** `src/application/ports/bookmarks.ts`

- `GetBookmarksInput`: `{ userId }`
- `AvailableBookmarkRow`: `{ isAvailable: true, questionId, slug, stemMd, difficulty, bookmarkedAt }`
- `UnavailableBookmarkRow`: `{ isAvailable: false, questionId, bookmarkedAt }`
- `BookmarkRow`: Union of above
- `GetBookmarksOutput`: `{ rows: BookmarkRow[] }`

---

## 3. Adapter Layer

### Controller

**File:** `src/adapters/controllers/bookmark-controller.ts`

Two server actions:

| Action | Schema | Auth | Rate Limit | Idempotency | Returns |
|--------|--------|------|------------|-------------|---------|
| `toggleBookmark` | `{ questionId: uuid, idempotencyKey?: uuid }` | Required + entitlement check | `bookmark:toggleBookmark:{userId}` | Optional key | `{ bookmarked: boolean }` |
| `getBookmarks` | `{}` | Required + entitlement check | None | None | `{ rows: BookmarkRow[] }` |

Both actions go through `requireEntitledUserId` (auth + subscription check). Toggle has rate limiting and optional idempotency key support.

### Drizzle Repository

**File:** `src/adapters/repositories/drizzle-bookmark-repository.ts`

- `exists()`: `db.query.bookmarks.findFirst()` with userId + questionId filter
- `add()`: `INSERT ... ON CONFLICT DO UPDATE` (idempotent — preserves `createdAt` on duplicate)
- `remove()`: `DELETE` and returns whether rows were affected
- `listByUserId()`: `SELECT ... WHERE userId ORDER BY createdAt DESC`

### Database Schema

**File:** `db/schema.ts` (lines 479-501)

```sql
CREATE TABLE bookmarks (
  userId    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  questionId uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  createdAt  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (userId, questionId)
);

CREATE INDEX bookmarks_user_created_at_idx ON bookmarks (userId, createdAt DESC);
CREATE INDEX bookmarks_question_id_idx ON bookmarks (questionId);
```

- Composite PK on `(userId, questionId)` — a user can bookmark a question at most once
- CASCADE deletes — if user or question is removed, bookmark goes with it
- Two indexes: one for listing by user (sorted by date), one for question lookups

### Relations

- `users.bookmarks` → one-to-many
- `questions.bookmarks` → one-to-many

---

## 4. Test Helpers

### Fake Repository

**File:** `src/application/test-helpers/fakes/fake-bookmark-repository.ts`

- In-memory `Map<string, Bookmark>` with key format `{userId}:{questionId}`
- Implements all 4 repository methods with matching add/remove/idempotency semantics
- **Difference from real repo:** `listByUserId()` filters by user but does **not** sort by `createdAt DESC`; the real Drizzle repo does
- Accepts optional seed data + `now()` function in constructor

### Fake Use Cases

**File:** `src/application/test-helpers/fakes/fake-use-cases.ts`

- `FakeToggleBookmarkUseCase` — extends `FakeUseCase<ToggleBookmarkInput, ToggleBookmarkOutput>`
- `FakeGetBookmarksUseCase` — extends `FakeUseCase<GetBookmarksInput, GetBookmarksOutput>`

---

## 5. Test Coverage

### Direct bookmark and bookmark-backed filter suites

For mixed-purpose files, the count below reflects the bookmark-focused cases rather than the file's entire test count.

| File | Type | Tests | Coverage |
|------|------|-------|----------|
| `src/domain/value-objects/question-progress-status.test.ts` | Unit | 3 | Includes `'bookmarked'` as a valid status |
| `src/application/use-cases/toggle-bookmark.test.ts` | Unit | 3 | Remove existing, add new, missing question |
| `src/application/use-cases/get-bookmarks.test.ts` | Unit | 4 | Empty, available, unavailable, error propagation |
| `src/adapters/repositories/drizzle-bookmark-repository.test.ts` | Unit | 7 | `exists`, `add`, `remove`, `listByUserId` |
| `src/adapters/controllers/bookmark-controller.test.ts` | Unit | 13 | Validation/auth/entitlement/rate-limit/idempotency/use-case delegation |
| `src/application/test-helpers/fakes/fake-bookmark-repository.test.ts` | Unit | 8 | Fake repo behavior and idempotency |
| `tests/integration/bookmark-repository.integration.test.ts` | Integration | 1 | Real Postgres add/remove/idempotency cycle |
| `app/(app)/app/bookmarks/page.test.tsx` | Unit | 24 | Bookmarks page rendering, remove action redirects, query-param error handling |
| `app/(app)/app/bookmarks/bookmarks-toast.browser.spec.tsx` | Browser | 2 | Toast rendering from URL state |
| `app/(app)/app/bookmarks/bookmark-row-shell.browser.spec.tsx` | Browser | 2 | Delegated row navigation and interactive-child guard |
| `app/(app)/app/practice/hooks/bookmark-message-timeout.test.ts` | Unit | 3 | Bookmark message auto-clear timing helper |
| `app/(app)/app/practice/hooks/use-practice-question-bookmarks.test.tsx` | Unit | 1 | Initial hook contract |
| `app/(app)/app/practice/hooks/use-quick-practice-status-counts.test.ts` | Unit | 4 | Includes the bookmark-backed quick-practice count path |
| `app/(app)/app/shared/bookmark-toggle.test.ts` | Unit | 5 | Shared toggle helper covers success rotation, failure preservation, non-ok handling, null-question early return, and unmount safety |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Unit | 4 | Review-page bookmark action-bar presence, hydration gating, and saving-state disablement |
| `app/(app)/app/questions/[slug]/hooks/use-question-page-model-bookmarks.browser.spec.tsx` | Browser | 5 | Review-page bookmark hydration, loaded state, toggle behavior, in-flight saving state, and per-question idempotency-key rollover after a failed toggle |

**Direct bookmark coverage total: 89 bookmark-focused tests across 16 files.**

### Additional downstream consumer coverage

Bookmark assertions also appear in broader consumer suites, including:

- `app/(app)/app/practice/components/practice-view.test.tsx` and `.browser.spec.tsx`
- `app/(app)/app/practice/[sessionId]/page.test.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.browser.spec.tsx`
- `app/(app)/app/practice/quick/quick-practice-client.test.tsx` and `.browser.spec.tsx`
- `tests/e2e/bookmarks.spec.ts`
- `tests/e2e/cross-page-navigation.spec.ts`
- `tests/e2e/core-app-pages.spec.ts`
- `tests/e2e/review-mode-audit.spec.ts`

### Explicit coverage gap inside the bookmark-backed filter path

The quick-practice `"bookmarked"` status is implemented end-to-end, but two lower-level suites still cover it only indirectly:

- `src/application/use-cases/count-available-questions.test.ts` verifies status forwarding generically, but does **not** assert `statuses: ['bookmarked']` specifically.
- `src/adapters/repositories/drizzle-question-repository.test.ts` exercises `listPublishedCandidateIds()` validation and query construction, but does **not** include a dedicated `status === 'bookmarked'` query assertion.

---

## 6. Frontend — Where Bookmark IS Wired

### 6a. Bookmarks Page (`/app/bookmarks`)

**Files:**
- `app/(app)/app/bookmarks/page.tsx` — Server component, calls `getBookmarks({})`
- `app/(app)/app/bookmarks/bookmark-row-shell.tsx` — Client wrapper for clickable rows (delegated pointer activation)
- `app/(app)/app/bookmarks/bookmarks-actions.ts` — `removeBookmarkAction()` server action
- `app/(app)/app/bookmarks/bookmarks-errors.ts` — Error code parsing/messaging
- `app/(app)/app/bookmarks/bookmarks-toast.tsx` — Reads `?toast=bookmark_removed`, emits toast, removes the search param from the URL

**What it renders:**
- Page header: "Bookmarks" h1 + "Go to Practice" link
- Empty state if no bookmarks
- List of bookmarked questions
- Available rows show an 80-character title preview, the full plain-text stem when it exceeds that preview, a difficulty label, and bookmark date
- Each available row is a `BookmarkRowShell` plus title link that navigates to question review page (`/app/questions/[slug]?from=bookmarks&mode=review`)
- "Remove" button per row with AlertDialog confirmation
- Success toast notification via URL search params (`?toast=bookmark_removed`) and `BookmarksToast`

**Remove flow:**
1. User clicks "Remove" → AlertDialog confirmation
2. `removeBookmarkAction()` extracts questionId from FormData
3. Calls `toggleBookmark({ questionId })` controller action
4. If the toggle succeeds with `{ bookmarked: false }`: `revalidatePath('/app/bookmarks')` + redirect with `?toast=bookmark_removed`
5. If the toggle fails or returns `{ bookmarked: true }`: redirect with `?error=toggle_failed` or `?error=remove_failed`

**Available rows** show preview text plus bookmark metadata. **Unavailable rows** show placeholder text for deleted/unpublished questions and still allow removal.

### 6b. Practice Session (Tutor + Exam) — `/app/practice/[sessionId]`

**Files:**
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts` — Composes session question flow + bookmark state
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — Wires bookmark props to PracticeView
- `app/(app)/app/practice/components/practice-view.tsx` — Renders the tutor/quick-practice bookmark button after feedback is available
- `app/(app)/app/shared/bookmark-toggle.ts` — Shared bookmark toggle helper + 10s timeout wrapper
- `app/(app)/app/practice/practice-page-logic.ts` — Re-exports the shared toggle helper for practice consumers
- `app/(app)/app/practice/practice-page-bookmarks.ts` — Shared bookmark load effect + retry scheduling
- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts` — State management hook
- `app/(app)/app/practice/hooks/bookmark-message-timeout.ts` — Auto-clear helper for bookmark message state

**How it works:**
- `usePracticeQuestionBookmarks` hook loads all user bookmarks on mount via `getBookmarks()`
- Stores bookmarked question IDs in a `Set<string>`
- `isBookmarked` = `bookmarkedQuestionIds.has(currentQuestionId)`
- Initial load runs through `createBookmarksEffect()` in `practice-page-bookmarks.ts`, which wraps `getBookmarks()` in a 10-second timeout
- Failed initial loads retry at most twice after **1s** and **2s** delays
- Toggle calls shared `toggleBookmarkForQuestion()`, which wraps `toggleBookmark({ questionId, idempotencyKey })` in a 10-second timeout
- Successful toggles rotate the idempotency key for the next request
- Bookmark message state auto-clears after **2 seconds** via `scheduleBookmarkMessageAutoClear()`
- `PracticeView` forwards bookmark messages to `NotificationProvider`; provider toasts default to **2500ms**
- Successful toggle messages are `"Question bookmarked."` and `"Bookmark removed."`; failures use `"Failed to save bookmark. Please try again."`

**Button rendering (`TutorActionBar` secondary group):**
```tsx
{hasBooleanCorrectness(props.submitResult) ? (
  <Button
    type="button"
    variant="outline"
    className="rounded-full"
    aria-pressed={props.isBookmarked}
    disabled={
      props.bookmarkStatus === 'loading' ||
      props.bookmarkStatus === 'error' ||
      isActionBarDisabled
    }
    onClick={props.onToggleBookmark}
  >
    {props.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
  </Button>
) : null}
```

**Error handling:** If bookmark load fails, an `ErrorCard` renders above the question with a retry button.

**Navigator detail:** The session question navigator (`exam-review-view.tsx` `QuestionNavigator`) does **not** receive bookmark state and therefore shows no bookmark badge/dot. Its only auxiliary indicator is the small dot for `markedForReview`.

**Key detail:** Exam-mode sessions use `ExamActionBar`, omit bookmark entirely, and show only the exam-scoped "Mark for review" control. Tutor-mode sessions and Quick Practice use `TutorActionBar`; its bookmark secondary group renders only after `hasBooleanCorrectness(props.submitResult)` is true, so bookmark is not exposed before submission.

### 6c. Question Review Page (`/app/questions/[slug]?mode=review`)

**Files:**
- `app/(app)/app/questions/[slug]/question-page-client.tsx` — Renders the bookmark button in the review-mode action bar
- `app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts` — Loads bookmark state for the current review question and exposes toggle actions
- `app/(app)/app/shared/bookmark-toggle.ts` — Shared toggle helper reused by practice and review surfaces

**How it works:**
- In review mode, `useQuestionPageModel` looks up the current question's bookmark membership by calling `getBookmarks({})` and filtering the returned rows for the active `questionId`
- The controller exposes `bookmarkStatus`, `isBookmarkHydrated`, `isBookmarked`, and `onToggleBookmark`
- `bookmarkStatus` distinguishes `loading`, `saving`, `idle`, and `error`, so the view does not collapse "unknown" and "in-flight save" into the same boolean
- `QuestionView` renders the bookmark button only when the page is in review mode, a question is loaded, and bookmark state for that question has hydrated
- While a toggle is in flight, the review-page button is disabled
- Toggle execution uses the same shared `toggleBookmarkForQuestion()` helper as practice mode, including the 10-second timeout and persisted idempotency-key retry behavior

**Button rendering (`question-page-client.tsx` action bar):**
```tsx
<Button
  type="button"
  variant="outline"
  className="rounded-full"
  aria-pressed={isBookmarked}
  disabled={bookmarkStatus === 'saving' || props.isPending}
  onClick={onToggleBookmark}
>
  {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
</Button>
```

**Navigator detail:** The review navigator (`review-question-navigator.tsx`) still carries no bookmark badge or bookmark-specific state. Bookmark is available in the detail action bar, not represented in the navigator chrome.

### 6d. Quick Practice — `/app/practice/quick`

**File:** `app/(app)/app/practice/quick/quick-practice-client.tsx`

Identical bookmark wiring to practice sessions. Uses the same `usePracticeQuestionBookmarks` hook via the shared `usePracticeQuestionFlow`. Passes all bookmark props to `PracticeView`.

### 6e. Quick Practice Bookmark-Backed Status Filter

Bookmarking also appears in Quick Practice as a **question-progress filter**, not just an action-bar toggle:

- `src/domain/value-objects/question-progress-status.ts` defines `'bookmarked'`
- `app/(app)/app/practice/practice-page-types.ts` exposes the label `"Bookmarked"`
- `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts` requests counts for `unanswered`, `incorrect`, and `bookmarked`
- `src/application/use-cases/count-available-questions.ts` forwards bookmark-backed statuses to the question repository
- `src/adapters/repositories/drizzle-question-repository.ts` resolves `status === 'bookmarked'` via a subquery against the `bookmarks` table

This is **not** a bookmark toggle surface, but it is a real bookmark consumer and part of the vertical slice.

### 6f. Navigation

**File:** `components/app-nav-items.ts`

```typescript
{ href: ROUTES.APP_BOOKMARKS, label: 'Bookmarks' }
```

Bookmarks is a top-level nav item, visible in both desktop and mobile navigation.

---

## 7. Frontend — Where Bookmark is NOT Wired

### 7a. Exam Review Stage (pre-submit)

**File:** `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`

Shows question navigator grid + stats (answered, unanswered, marked). No bookmark UI. This is appropriate — user is in assessment mode, deciding whether to revisit questions before submitting.

### 7b. Session Summary (post-submit)

**File:** `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Shows stats cards + question breakdown + CTAs ("Review your answers", "Back to Dashboard"). No bookmark UI. Acceptable — the summary is a waypoint, not a reflection surface. "Review your answers" links to the question review page, which now carries the bookmark action.

### 7c. History Questions Tab

**Files:**
- `app/(app)/app/history/components/history-questions-tab.tsx`
- `app/(app)/app/history/history-search-params.ts`

List view of attempted questions with filters. Each row links to question review page. No bookmark UI in the list itself.

**Current filter set:** `result`, `difficulty`, `tag`, `source`, `sort`

There is **no bookmark-status filter** and **no bookmark indicator** in the row metadata. This differs from Quick Practice, which exposes bookmark-backed status filtering via the segmented control.

Acceptable as a list surface — bookmark is one click away via the review page — but it is a real discoverability gap compared with Quick Practice.

### 7d. History Sessions Tab

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx`

List of past sessions with expandable breakdowns. No bookmark UI. Acceptable — the session rows and breakdown rows are navigational containers that click through to question review.

### 7e. Dashboard — Recent Sessions

**File:** `app/(app)/app/dashboard/page.tsx`

Recent session rows link into question review with `from=dashboard&mode=review&sessionId=...`. No bookmark UI on the dashboard row itself, and the dashboard does not fetch or render bookmark counts or bookmark-specific CTA modules. Acceptable — it is a summary/launchpad surface.

### 7f. Dashboard — Recent Activity

**File:** `app/(app)/app/dashboard/page.tsx`

Recent activity rows link into question review with `from=dashboard&mode=review&attemptId=...`. No bookmark UI on the dashboard row itself, and no bookmark-specific dashboard affordance accompanies these rows. Acceptable — it is a summary/launchpad surface.

---

## 8. Surface Audit Summary

| Surface | Route | Bookmark Today | Appropriate? | Notes |
|---------|-------|---------------|-------------|-------|
| Practice (Tutor) | `/app/practice/[sessionId]` | YES (toggle after submission) | **YES** | No collision. User sees explanations inline — natural reflect-and-bookmark moment. `PracticeView` hides bookmark until `hasBooleanCorrectness(props.submitResult)` is true. |
| Practice (Exam) | `/app/practice/[sessionId]` | NO | **YES** | BS-053 removed bookmark from the exam action bar; exam mode now keeps only mark-for-review. |
| Quick Practice | `/app/practice/quick` | YES (toggle after submission) | **YES** | Same as tutor mode — no collision, explanations shown inline. `PracticeView` hides bookmark until `hasBooleanCorrectness(props.submitResult)` is true. |
| Bookmarks Page | `/app/bookmarks` | YES (remove only) | **YES** | Remove-only is correct — questions are already bookmarked. |
| **Question Review** | **`/app/questions/[slug]?mode=review`** | **YES (toggle)** | **YES** | Primary reflection surface. Button renders after bookmark hydration and disables while saving. |
| Exam Review (pre-submit) | `/app/practice/[sessionId]` | NO | YES (correct) | Assessment mode. Mark-for-review only. |
| Session Summary | `/app/practice/[sessionId]` | NO | YES (correct) | Waypoint — CTA leads to review page via `from=summary&sessionId=...`. |
| History Questions | `/app/history?tab=questions` | NO | YES (correct) | List view — click-through to review. |
| History Sessions breakdown | `/app/history?tab=sessions` | NO | YES (correct) | Session rows and breakdown rows click through to review. |
| Dashboard Recent Sessions | `/app/dashboard` | NO | YES (correct) | Summary/launchpad row linking to review. |
| Dashboard Recent Activity | `/app/dashboard` | NO | YES (correct) | Summary/launchpad row linking to review. |

**BS-053 implemented two structural changes:**
1. **Removed** bookmark from exam-mode practice view (fixed the collision with mark-for-review)
2. **Added** bookmark toggle to the question review page (filled the primary reflection-surface gap)

---

## 9. Shared Infrastructure Used by Practice + Question Review

BS-053 landed with the lightest clean-architecture-friendly version of the options above: **extract the shared toggle logic downward, keep page-specific state in the page controllers.**

### What is shared
- `toggleBookmark` controller action — reused unchanged by practice and question review
- `getBookmarks` controller action — reused unchanged by practice and question review
- `ToggleBookmarkUseCase`, `GetBookmarksUseCase`, repository port, and Drizzle implementation — unchanged
- `app/(app)/app/shared/bookmark-toggle.ts` — route-agnostic `toggleBookmarkForQuestion()` helper with:
  - 10-second timeout wrapper
  - shared error handling
  - persisted idempotency key before the request
  - post-success key rotation

### What remains surface-specific
- `usePracticeQuestionBookmarks` still owns the practice/quick-practice bookmark set, retry scheduling, message state, and bookmark-to-toast handoff
- `useQuestionPageModel` owns the review-page bookmark membership for the current question and exposes:
  - `bookmarkStatus`
  - `isBookmarkHydrated`
  - `isBookmarked`
  - `onToggleBookmark`

### Why this shape
- It removes the question review page's dependency on the practice route module
- It avoids a god-hook that tries to own both practice-set state and review-page state
- It fixes the idempotency retry hole in one place shared by both consumers
- It keeps the current tradeoff explicit: review-page hydration still calls `getBookmarks({})` and filters client-side because there is no dedicated single-question bookmark lookup controller today

---

## 10. Business Logic Wiring Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DATABASE                                    │
│  bookmarks table: (userId, questionId, createdAt)                   │
│  PK: (userId, questionId)  |  FK: users, questions (CASCADE)        │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  DrizzleBookmarkRepository  │
                    │  exists / add / remove / list│
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                                      │
   ┌──────────┴──────────┐            ┌──────────────┴────────────┐
   │ ToggleBookmarkUseCase│            │  GetBookmarksUseCase       │
   │ remove-first toggle  │            │  list + enrich w/ question │
   └──────────┬──────────┘            └──────────────┬────────────┘
              │                                      │
   ┌──────────┴──────────────────────────────────────┴────────────┐
   │                  BookmarkController                            │
   │  toggleBookmark() — auth + rate limit + idempotency           │
   │  getBookmarks()   — auth + entitlement                        │
   └──────────┬───────────────────────┬──────────────────┬─────────┘
              │                       │                  │
   ┌──────────┴──────────┐   ┌────────┴────────┐  ┌──────┴────────────┐
   │ usePracticeQuestion  │   │ shared bookmark │  │ Bookmarks Page     │
   │ Bookmarks (hook)     │   │ toggle helper   │  │ (server)           │
   │ - loads all on mount │   │ - timeout       │  │ - getBookmarks()   │
   │ - toggles single     │   │ - persisted idem│  │ - list + remove    │
   └──────────┬──────────┘   └────────┬────────┘  └──────┬────────────┘
              │                       │                  │
    ┌─────────┴─────────┐   ┌─────────┴─────────┐        │
    │ consumed by:       │   │ consumed by:      │        │
    │ - usePracticeQuestionFlow │ - practice hook│        │
    │ - usePracticeSessionPageModel│ - question review│
    └─────────┬─────────┘   └─────────┬─────────┘        │
              │                       │                  │
   ┌──────────┴──────────┐   ┌────────┴──────────────────────────────┐
   │ PracticeView         │   │ Question Review Page                  │
   │ + QuickPracticeClient│   │ /app/questions/[slug]?mode=review    │
   │ + PracticeSessionView│   │ - controller loads current bookmark   │
   └─────────────────────┘   │ - action bar toggles bookmark         │
                              │ - entry points: History/Bookmarks/    │
                              │   Dashboard (+ route contract still    │
                              │   supports `from=practice`)            │
                              └────────────────────────────────────────┘
```

---

## 11. File Index

Direct implementation/support files with bookmark-specific behavior:

### Domain
| File | Purpose |
|------|---------|
| `src/domain/entities/bookmark.ts` | Entity type |
| `src/domain/test-helpers/factories.ts` | `createBookmark()` factory |
| `src/domain/value-objects/question-progress-status.ts` | Defines `'bookmarked'` quick-practice status filter |

### Application
| File | Purpose |
|------|---------|
| `src/application/ports/bookmark-repository.ts` | Repository interface |
| `src/application/ports/bookmarks.ts` | Input/output types for use cases |
| `src/application/use-cases/toggle-bookmark.ts` | Toggle use case |
| `src/application/use-cases/get-bookmarks.ts` | List use case |
| `src/application/use-cases/count-available-questions.ts` | Consumes bookmark-backed status filters for quick-practice counts |

### Adapters
| File | Purpose |
|------|---------|
| `src/adapters/controllers/bookmark-controller.ts` | Server actions (toggleBookmark, getBookmarks) |
| `src/adapters/controllers/practice-controller.ts` | `countAvailableQuestions()` bookmark-backed status filter path |
| `src/adapters/repositories/drizzle-bookmark-repository.ts` | Postgres implementation |
| `src/adapters/repositories/drizzle-question-repository.ts` | Implements `status === 'bookmarked'` via bookmarks subquery |

### Frontend — Bookmarks Page
| File | Purpose |
|------|---------|
| `app/(app)/app/bookmarks/page.tsx` | Page component (server) |
| `app/(app)/app/bookmarks/bookmark-row-shell.tsx` | Clickable row wrapper (client) |
| `app/(app)/app/bookmarks/bookmarks-actions.ts` | `removeBookmarkAction()` server action |
| `app/(app)/app/bookmarks/bookmarks-errors.ts` | Error code parsing |
| `app/(app)/app/bookmarks/bookmarks-toast.tsx` | Success toast handling and query-param cleanup |
| `app/(app)/app/bookmarks/loading.tsx` | Suspense loading skeleton |
| `app/(app)/app/bookmarks/error.tsx` | Error boundary |

### Frontend — Practice (bookmark consumer)
| File | Purpose |
|------|---------|
| `app/(app)/app/shared/bookmark-toggle.ts` | Route-agnostic `toggleBookmarkForQuestion()` helper shared by practice and question review |
| `app/(app)/app/practice/practice-page-logic.ts` | Re-exports the shared toggle helper for practice consumers |
| `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts` | Bookmark state hook (load, toggle, retry) |
| `app/(app)/app/practice/practice-page-bookmarks.ts` | Effect factory for initial bookmark load |
| `app/(app)/app/practice/hooks/bookmark-message-timeout.ts` | Shared bookmark message auto-clear helper |
| `app/(app)/app/practice/hooks/use-practice-question-flow.ts` | Quick-practice composition point for bookmark state |
| `app/(app)/app/practice/components/practice-view.tsx` | Renders bookmark button after feedback outside exam mode |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-model.ts` | Session composition point for bookmark state |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | Wires bookmark props to PracticeView |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Wires bookmark props to PracticeView |
| `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts` | Loads bookmark-backed quick-practice segmented counts |
| `app/(app)/app/practice/practice-page-types.ts` | Displays `"Bookmarked"` status label |

### Frontend — Question Review Page
| File | Purpose |
|------|---------|
| `app/(app)/app/questions/[slug]/page.tsx` | Page component (server) |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | QuestionView — review action bar bookmark button + hydration/saving gating |
| `app/(app)/app/questions/[slug]/hooks/use-question-page-model.ts` | Page model hook — question bookmark hydration, status, and toggle wiring |
| `app/(app)/app/shared/components/session-breakdown-list.tsx` | Shared breakdown list that links History/Summary rows into question review |
| `app/(app)/app/history/components/history-questions-tab.tsx` | Links attempted questions into question review |
| `app/(app)/app/history/components/history-sessions-tab.tsx` | Links session rows into question review; renders breakdown links |
| `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` | Links session summary CTA into question review |
| `app/(app)/app/dashboard/page.tsx` | Links recent sessions/activity into question review |

### Shared
| File | Purpose |
|------|---------|
| `lib/routes.ts` | `ROUTES.APP_BOOKMARKS`, `QuestionOrigin`, and `toQuestionRoute()` |
| `components/app-nav-items.ts` | Bookmarks in top nav |
| `db/schema.ts` (lines 479-501, 507-526, 580-589) | Table definition, indexes, user/question relations, bookmark relations |

### Direct Bookmark Test Files
| File | Type |
|------|------|
| `src/domain/value-objects/question-progress-status.test.ts` | Unit |
| `src/application/use-cases/toggle-bookmark.test.ts` | Unit |
| `src/application/use-cases/get-bookmarks.test.ts` | Unit |
| `src/adapters/repositories/drizzle-bookmark-repository.test.ts` | Unit |
| `src/adapters/controllers/bookmark-controller.test.ts` | Unit |
| `src/application/test-helpers/fakes/fake-bookmark-repository.test.ts` | Fake test |
| `tests/integration/bookmark-repository.integration.test.ts` | Integration |
| `app/(app)/app/bookmarks/page.test.tsx` | Unit |
| `app/(app)/app/bookmarks/bookmarks-toast.browser.spec.tsx` | Browser |
| `app/(app)/app/bookmarks/bookmark-row-shell.browser.spec.tsx` | Browser |
| `app/(app)/app/practice/hooks/bookmark-message-timeout.test.ts` | Unit |
| `app/(app)/app/practice/hooks/use-practice-question-bookmarks.test.tsx` | Unit |
| `app/(app)/app/practice/hooks/use-quick-practice-status-counts.test.ts` | Unit |
| `app/(app)/app/shared/bookmark-toggle.test.ts` | Unit |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | Unit |
| `app/(app)/app/questions/[slug]/hooks/use-question-page-model-bookmarks.browser.spec.tsx` | Browser |
