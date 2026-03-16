# Bookmarks — Feature Dossier

**Feature:** Bookmarking (cross-cutting, not a single page)
**Last Updated:** 2026-03-16
**Related:** [BS-053](../../brainstorming/bs-053-bookmark-vs-mark-for-review-collision.md) (bookmark vs mark-for-review collision), [BS-052](../../brainstorming/bs-052-bookmark-icon-toggle-replacement.md) (bookmark icon toggle), [Bookmark Surface Policy](../bookmark-surface-policy.md)

---

## Overview

Bookmarking is a **global, permanent curation feature** — "save this question for future study." It is distinct from the session-scoped "Mark for Review" exam feature. A bookmark persists in a dedicated database table and survives session completion, unlike mark-for-review which lives in session JSON and dies with the exam.

This dossier documents the **complete vertical slice** — from database schema to UI — every file that touches bookmarking, where it's wired, where it's missing, and what needs to change.

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
- Implements all 4 repository methods identically to real behavior
- Accepts optional seed data + `now()` function in constructor

### Fake Use Cases

**File:** `src/application/test-helpers/fakes/fake-use-cases.ts`

- `FakeToggleBookmarkUseCase` — extends `FakeUseCase<ToggleBookmarkInput, ToggleBookmarkOutput>`
- `FakeGetBookmarksUseCase` — extends `FakeUseCase<GetBookmarksInput, GetBookmarksOutput>`

---

## 5. Test Coverage

| File | Type | Tests |
|------|------|-------|
| `src/application/use-cases/toggle-bookmark.test.ts` | Unit | 3 (remove existing, add new, missing question) |
| `src/application/use-cases/get-bookmarks.test.ts` | Unit | 4 (empty, available, unavailable, error propagation) |
| `src/adapters/repositories/drizzle-bookmark-repository.test.ts` | Unit | 8 (2 per method) |
| `src/adapters/controllers/bookmark-controller.test.ts` | Unit | 15 (8 toggle + 7 getBookmarks) |
| `src/application/test-helpers/fakes/fake-bookmark-repository.test.ts` | Unit | 7 |
| `tests/integration/bookmark-repository.integration.test.ts` | Integration | 1 (full add/remove cycle with real Postgres) |
| `app/(app)/app/bookmarks/bookmarks-toast.browser.spec.tsx` | Browser | 2 (toast display) |
| `app/(app)/app/bookmarks/bookmark-row-shell.browser.spec.tsx` | Browser | 2 (row navigation, interactive child delegation) |
| `app/(app)/app/practice/hooks/use-practice-question-bookmarks.test.tsx` | Unit | 1 (initial state contract) |

**Total: ~43 tests across 9 files.**

---

## 6. Frontend — Where Bookmark IS Wired

### 6a. Bookmarks Page (`/app/bookmarks`)

**Files:**
- `app/(app)/app/bookmarks/page.tsx` — Server component, calls `getBookmarks({})`
- `app/(app)/app/bookmarks/bookmark-row-shell.tsx` — Client wrapper for clickable rows (delegated pointer activation)
- `app/(app)/app/bookmarks/bookmarks-actions.ts` — `removeBookmarkAction()` server action
- `app/(app)/app/bookmarks/bookmarks-errors.ts` — Error code parsing/messaging

**What it renders:**
- Page header: "Bookmarks" h1 + "Go to Practice" link
- Empty state if no bookmarks
- List of bookmarked questions, each showing: stem preview, difficulty badge, bookmark date
- Each row is a `BookmarkRowShell` that navigates to question review page (`/app/questions/[slug]?from=bookmarks&mode=review`)
- "Remove" button per row with AlertDialog confirmation
- Toast notification on remove success/error via URL search params (`?toast=bookmark_removed`)

**Remove flow:**
1. User clicks "Remove" → AlertDialog confirmation
2. `removeBookmarkAction()` extracts questionId from FormData
3. Calls `toggleBookmark({ questionId })` controller action
4. On success: `revalidatePath('/app/bookmarks')` + redirect with `?toast=bookmark_removed`
5. On error: redirect with `?error=...`

**Available rows** show full question data (stem, slug, difficulty). **Unavailable rows** show placeholder text for deleted/unpublished questions.

### 6b. Practice Session (Tutor + Exam) — `/app/practice/[sessionId]`

**Files:**
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — Wires bookmark props to PracticeView
- `app/(app)/app/practice/components/practice-view.tsx` — Renders bookmark button (lines 345-354)
- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts` — State management hook

**How it works:**
- `usePracticeQuestionBookmarks` hook loads all user bookmarks on mount via `getBookmarks()`
- Stores bookmarked question IDs in a `Set<string>`
- `isBookmarked` = `bookmarkedQuestionIds.has(currentQuestionId)`
- Toggle calls `toggleBookmark({ questionId, idempotencyKey })` controller action
- Shows success/error toast via `NotificationProvider` with auto-clear after 3s
- Auto-retries failed initial load up to 2 times with exponential backoff
- Timeout: 10 seconds for both load and toggle operations

**Button rendering (practice-view.tsx lines 345-354):**
```tsx
<Button
  type="button"
  variant="outline"
  className="rounded-full"
  aria-pressed={props.isBookmarked}
  disabled={props.bookmarkStatus === 'loading' || props.isPending}
  onClick={props.onToggleBookmark}
>
  {props.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
</Button>
```

**Error handling:** If bookmark load fails, an `ErrorCard` renders above the question (practice-view.tsx lines 217-232) with a retry button.

**Key detail:** The bookmark button is **always rendered** regardless of session mode (tutor or exam). This is the source of the BS-053 collision — in exam mode, it sits next to "Mark for review."

### 6c. Quick Practice — `/app/practice/quick`

**File:** `app/(app)/app/practice/quick/quick-practice-client.tsx`

Identical bookmark wiring to practice sessions. Uses the same `usePracticeQuestionBookmarks` hook via the shared `usePracticeQuestionFlow`. Passes all bookmark props to `PracticeView`.

### 6d. Navigation

**File:** `components/app-nav-items.ts`

```typescript
{ href: ROUTES.APP_BOOKMARKS, label: 'Bookmarks' }
```

Bookmarks is a top-level nav item, visible in both desktop and mobile navigation.

---

## 7. Frontend — Where Bookmark is NOT Wired

### 7a. Question Review Page (`/app/questions/[slug]`) — THE GAP

**Files:**
- `app/(app)/app/questions/[slug]/page.tsx` — Server component
- `app/(app)/app/questions/[slug]/question-page-client.tsx` — Client component with `QuestionView`
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts` — Controller hook

**Current action bar (question-page-client.tsx lines 343-429):**
```
[ Previous ] [ Submit/Reattempt ] [ Next ]  Back to {origin}
```

**No bookmark button. No bookmark state. No bookmark hook.**

The `useQuestionPageController` hook manages: question loading, answer submission, session review navigation, reattempt flow. It does not import, reference, or expose any bookmark state.

**This is the primary gap.** The question review page is the destination when users click:
- "Review" from History Questions tab → `?from=history&mode=review`
- A bookmark row from the Bookmarks page → `?from=bookmarks&mode=review`
- "Review your answers" from Session Summary → `?from=practice&mode=review`
- A question from the Dashboard → `?from=dashboard&mode=review`

Users arrive here to **read explanations, clinical pearls, and references** — the ideal moment to decide "I should save this for future study." But the action isn't available.

**Irony:** When you click a bookmark on the Bookmarks page, you land on this review page with "Back to Bookmarks" in the action bar — acknowledging you came from bookmarks — but you can't toggle the bookmark from here.

### 7b. Exam Review Stage (pre-submit)

**File:** `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`

Shows question navigator grid + stats (answered, unanswered, marked). No bookmark UI. This is appropriate — user is in assessment mode, deciding whether to revisit questions before submitting.

### 7c. Session Summary (post-submit)

**File:** `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`

Shows stats cards + question breakdown + CTAs ("Review your answers", "Back to Dashboard"). No bookmark UI. Acceptable — the summary is a waypoint, not a reflection surface. "Review your answers" links to the question review page (which should have bookmarks).

### 7d. History Questions Tab

**File:** `app/(app)/app/history/components/history-questions-tab.tsx`

List view of attempted questions with filters. Each row links to question review page. No bookmark UI in the list itself. Acceptable — bookmark is one click away via the review page (once that gap is filled).

### 7e. History Sessions Tab

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx`

List of past sessions with expandable breakdowns. No bookmark UI. Acceptable — sessions are navigational containers, not individual question surfaces.

### 7f. Dashboard

**File:** `app/(app)/app/dashboard/page.tsx`

Stats + recent sessions + recent activity. No bookmark UI. Acceptable — dashboard is a summary/launchpad, not a question interaction surface.

---

## 8. Surface Audit Summary

| Surface | Route | Bookmark Today | Appropriate? | Notes |
|---------|-------|---------------|-------------|-------|
| Practice (Tutor) | `/app/practice/[sessionId]` | YES (toggle) | **YES** | No collision. User sees explanations inline — natural reflect-and-bookmark moment. |
| Practice (Exam) | `/app/practice/[sessionId]` | YES (toggle) | **NO** | Collides with "Mark for review." Assessment mindset — bookmark doesn't belong here. |
| Quick Practice | `/app/practice/quick` | YES (toggle) | **YES** | Same as tutor mode — no collision, explanations shown inline. |
| Bookmarks Page | `/app/bookmarks` | YES (remove only) | **YES** | Remove-only is correct — questions are already bookmarked. |
| **Question Review** | **`/app/questions/[slug]`** | **NO** | **SHOULD BE YES** | The ideal bookmarking surface — user is reading explanations. Primary gap. |
| Exam Review (pre-submit) | `/app/practice/[sessionId]` | NO | YES (correct) | Assessment mode. Mark-for-review only. |
| Session Summary | `/app/practice/[sessionId]` | NO | YES (correct) | Waypoint — CTA leads to review page. |
| History Questions | `/app/history?tab=questions` | NO | YES (correct) | List view — click-through to review. |
| History Sessions | `/app/history?tab=sessions` | NO | YES (correct) | Session containers, not question surfaces. |
| Dashboard | `/app/dashboard` | NO | YES (correct) | Summary/launchpad. |

**Two changes needed:**
1. **Remove** bookmark from exam mode practice view (fix collision)
2. **Add** bookmark toggle to question review page (fill the gap)

---

## 9. Shared Infrastructure for Adding Bookmark to Question Review Page

Adding bookmark to the question review page requires:

### What already exists and can be reused
- `toggleBookmark` controller action — no changes needed
- `getBookmarks` controller action — no changes needed
- `ToggleBookmarkUseCase` and `GetBookmarksUseCase` — no changes needed
- `BookmarkRepository` port + Drizzle implementation — no changes needed
- Notification system (`useNotification()`) — already available in the component tree

### What needs to be built
- **Bookmark state in `useQuestionPageController`** (or a new companion hook): The question review page needs to know if the current question is bookmarked and expose a toggle function. Two approaches:
  - **Option 1:** Import `usePracticeQuestionBookmarks` and wire it into `QuestionView`. This hook already handles load, toggle, retry, error, toast — but it's designed for the practice flow (loads ALL bookmarks for the session's question set). For the review page, we only need to check one question at a time.
  - **Option 2:** Create a lighter-weight hook (e.g., `useQuestionBookmark`) that checks/toggles a single question's bookmark state. Simpler, but duplicates some logic from `usePracticeQuestionBookmarks`.
  - **Option 3:** Extract shared bookmark toggle logic into a lower-level utility, consumed by both the practice hook and the review page hook.

### What needs to change to remove bookmark from exam mode
- `practice-view.tsx` lines 345-354: Wrap the bookmark button in a condition that hides it when the session mode is exam. The `onToggleMarkForReview` prop already signals exam mode (it's only passed for exam sessions), so the condition could be: `!props.onToggleMarkForReview` (show bookmark only when mark-for-review is absent).

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
   └──────────┬──────────────────────────────────────┬────────────┘
              │                                      │
   ┌──────────┴──────────┐            ┌──────────────┴────────────┐
   │ usePracticeQuestion  │            │  Bookmarks Page (server)   │
   │ Bookmarks (hook)     │            │  calls getBookmarks()      │
   │ - loads all on mount │            │  renders list + remove     │
   │ - toggles single     │            │                            │
   └──────────┬──────────┘            └──────────────┬────────────┘
              │                                      │
   ┌──────────┴──────────┐            ┌──────────────┴────────────┐
   │ PracticeView         │            │  BookmarkRowShell           │
   │ + QuickPracticeClient│            │  → /app/questions/[slug]   │
   │ (button in action bar)│           │    ?from=bookmarks          │
   └─────────────────────┘            └─────────────────────────────┘
                                                     │
                                      ┌──────────────┴────────────┐
                                      │  Question Review Page       │
                                      │  /app/questions/[slug]      │
                                      │  ❌ NO BOOKMARK WIRING      │
                                      └─────────────────────────────┘
```

---

## 11. File Index

Every file that touches bookmarking:

### Domain
| File | Purpose |
|------|---------|
| `src/domain/entities/bookmark.ts` | Entity type |
| `src/domain/test-helpers/factories.ts` | `createBookmark()` factory |

### Application
| File | Purpose |
|------|---------|
| `src/application/ports/bookmark-repository.ts` | Repository interface |
| `src/application/ports/bookmarks.ts` | Input/output types for use cases |
| `src/application/use-cases/toggle-bookmark.ts` | Toggle use case |
| `src/application/use-cases/get-bookmarks.ts` | List use case |

### Adapters
| File | Purpose |
|------|---------|
| `src/adapters/controllers/bookmark-controller.ts` | Server actions (toggleBookmark, getBookmarks) |
| `src/adapters/repositories/drizzle-bookmark-repository.ts` | Postgres implementation |

### Frontend — Bookmarks Page
| File | Purpose |
|------|---------|
| `app/(app)/app/bookmarks/page.tsx` | Page component (server) |
| `app/(app)/app/bookmarks/bookmark-row-shell.tsx` | Clickable row wrapper (client) |
| `app/(app)/app/bookmarks/bookmarks-actions.ts` | `removeBookmarkAction()` server action |
| `app/(app)/app/bookmarks/bookmarks-errors.ts` | Error code parsing |
| `app/(app)/app/bookmarks/loading.tsx` | Suspense loading skeleton |
| `app/(app)/app/bookmarks/error.tsx` | Error boundary |

### Frontend — Practice (bookmark consumer)
| File | Purpose |
|------|---------|
| `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts` | Bookmark state hook (load, toggle, retry) |
| `app/(app)/app/practice/practice-page-bookmarks.ts` | Effect factory for initial bookmark load |
| `app/(app)/app/practice/components/practice-view.tsx` | Renders bookmark button (lines 345-354) |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | Wires bookmark props to PracticeView |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Wires bookmark props to PracticeView |

### Frontend — Question Review Page (NO bookmark wiring)
| File | Purpose |
|------|---------|
| `app/(app)/app/questions/[slug]/page.tsx` | Page component (server) |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | QuestionView — **no bookmark button** |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | Controller hook — **no bookmark state** |

### Test Files
| File | Type |
|------|------|
| `src/application/use-cases/toggle-bookmark.test.ts` | Unit |
| `src/application/use-cases/get-bookmarks.test.ts` | Unit |
| `src/adapters/repositories/drizzle-bookmark-repository.test.ts` | Unit |
| `src/adapters/controllers/bookmark-controller.test.ts` | Unit |
| `src/application/test-helpers/fakes/fake-bookmark-repository.ts` | Fake |
| `src/application/test-helpers/fakes/fake-bookmark-repository.test.ts` | Fake test |
| `tests/integration/bookmark-repository.integration.test.ts` | Integration |
| `app/(app)/app/bookmarks/bookmarks-toast.browser.spec.tsx` | Browser |
| `app/(app)/app/bookmarks/bookmark-row-shell.browser.spec.tsx` | Browser |
| `app/(app)/app/practice/hooks/use-practice-question-bookmarks.test.tsx` | Unit |

### Shared
| File | Purpose |
|------|---------|
| `lib/routes.ts` | `ROUTES.APP_BOOKMARKS` constant |
| `components/app-nav-items.ts` | Bookmarks in top nav |
| `db/schema.ts` (lines 479-501) | Table definition, indexes, relations |
