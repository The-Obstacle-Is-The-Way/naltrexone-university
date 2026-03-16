# Bookmarks — Feature Dossier

**Feature:** Bookmarking (cross-cutting, not a single page)
**Last Updated:** 2026-03-16
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

| File | Type | Tests | Coverage |
|------|------|-------|----------|
| `src/domain/value-objects/question-progress-status.test.ts` | Unit | 2 | Includes `'bookmarked'` as a valid status |
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

**Direct bookmark coverage total: 74 tests across 13 files.**

### Additional downstream consumer coverage

Bookmark assertions also appear in broader consumer suites, including:

- `app/(app)/app/practice/components/practice-view.test.tsx` and `.browser.spec.tsx`
- `app/(app)/app/practice/[sessionId]/page.test.tsx`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.browser.spec.tsx`
- `app/(app)/app/practice/quick/quick-practice-client.test.tsx` and `.browser.spec.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx` (origin/back-link behavior for bookmark review)
- `tests/e2e/bookmarks.spec.ts`
- `tests/e2e/cross-page-navigation.spec.ts`
- `tests/e2e/core-app-pages.spec.ts`
- `tests/e2e/review-mode-audit.spec.ts`

There is **no bookmark-specific review-page interaction test yet**, which matches the current product state: the review page has no bookmark control to exercise.

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
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` — Composes session question flow + bookmark state
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — Wires bookmark props to PracticeView
- `app/(app)/app/practice/components/practice-view.tsx` — Renders bookmark button (lines 345-354)
- `app/(app)/app/practice/practice-page-logic.ts` — Shared bookmark toggle helper + 10s timeout wrapper
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

### 6d. Quick Practice Bookmark-Backed Status Filter

Bookmarking also appears in Quick Practice as a **question-progress filter**, not just an action-bar toggle:

- `src/domain/value-objects/question-progress-status.ts` defines `'bookmarked'`
- `app/(app)/app/practice/practice-page-types.ts` exposes the label `"Bookmarked"`
- `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts` requests counts for `unanswered`, `incorrect`, and `bookmarked`
- `src/application/use-cases/count-available-questions.ts` forwards bookmark-backed statuses to the question repository
- `src/adapters/repositories/drizzle-question-repository.ts` resolves `status === 'bookmarked'` via a subquery against the `bookmarks` table

This is **not** a bookmark toggle surface, but it is a real bookmark consumer and part of the vertical slice.

### 6e. Navigation

**File:** `components/app-nav-items.ts`

```typescript
{ href: ROUTES.APP_BOOKMARKS, label: 'Bookmarks' }
```

Bookmarks is a top-level nav item, visible in both desktop and mobile navigation.

---

## 7. Frontend — Where Bookmark is NOT Wired

### 7a. Question Review Page (`/app/questions/[slug]?mode=review`) — THE GAP

**Files:**
- `app/(app)/app/questions/[slug]/page.tsx` — Server component
- `app/(app)/app/questions/[slug]/question-page-client.tsx` — Client component with `QuestionView`
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts` — Controller hook

**Current bottom action bar (question-page-client.tsx lines 343-429):**

- Renders only `Previous`, `Submit`, `Practice Again` / `Try Again`, `Next`, and origin-aware back actions
- The exact combination varies by origin and session navigation state
- It never renders a bookmark button

**No bookmark button. No bookmark state. No bookmark hook.**

The `useQuestionPageController` hook manages: question loading, answer submission, session review navigation, reattempt flow. It does not import, reference, or expose any bookmark state.

**This is the primary gap.** The question review page is the destination when users click:
- "Review" from History Questions tab → `?from=history&mode=review&historyHref=...`
- A bookmark row from the Bookmarks page → `?from=bookmarks&mode=review`
- "Review your answers" from Session Summary → `?from=history&mode=review&sessionId=...`
- A session row or session-breakdown question from History Sessions → `?from=history&mode=review&sessionId=...`
- A question from Dashboard Recent Activity → `?from=dashboard&mode=review&attemptId=...`
- A session row from Dashboard Recent Sessions → `?from=dashboard&mode=review&sessionId=...`

`QuestionOrigin` still supports `from=practice` in `lib/routes.ts`, and `QuestionView` still has a `Back to Session` / `Back to Practice` branch for it, but current production callers do **not** emit that origin.

Users arrive here on a long-form question detail surface. When a prior attempt exists, they also see feedback content (explanation, reference, and any clinical-pearl callouts embedded in the markdown). Even when no prior attempt exists, this is still the strongest "save this for later study" surface in the app. But the action isn't available.

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

List of past sessions with expandable breakdowns. No bookmark UI. Acceptable — the session rows and breakdown rows are navigational containers that click through to question review.

### 7f. Dashboard — Recent Sessions

**File:** `app/(app)/app/dashboard/page.tsx`

Recent session rows link into question review with `from=dashboard&mode=review&sessionId=...`. No bookmark UI on the dashboard row itself. Acceptable — it is a summary/launchpad surface.

### 7g. Dashboard — Recent Activity

**File:** `app/(app)/app/dashboard/page.tsx`

Recent activity rows link into question review with `from=dashboard&mode=review&attemptId=...`. No bookmark UI on the dashboard row itself. Acceptable — it is a summary/launchpad surface.

---

## 8. Surface Audit Summary

| Surface | Route | Bookmark Today | Appropriate? | Notes |
|---------|-------|---------------|-------------|-------|
| Practice (Tutor) | `/app/practice/[sessionId]` | YES (toggle) | **YES** | No collision. User sees explanations inline — natural reflect-and-bookmark moment. |
| Practice (Exam) | `/app/practice/[sessionId]` | YES (toggle) | **NO** | Collides with "Mark for review." Assessment mindset — bookmark doesn't belong here. |
| Quick Practice | `/app/practice/quick` | YES (toggle) | **YES** | Same as tutor mode — no collision, explanations shown inline. |
| Bookmarks Page | `/app/bookmarks` | YES (remove only) | **YES** | Remove-only is correct — questions are already bookmarked. |
| **Question Review** | **`/app/questions/[slug]?mode=review`** | **NO** | **SHOULD BE YES** | The ideal bookmarking surface. Current production callers come from History, Bookmarks, and Dashboard. |
| Exam Review (pre-submit) | `/app/practice/[sessionId]` | NO | YES (correct) | Assessment mode. Mark-for-review only. |
| Session Summary | `/app/practice/[sessionId]` | NO | YES (correct) | Waypoint — CTA leads to review page via `from=history&sessionId=...`. |
| History Questions | `/app/history?tab=questions` | NO | YES (correct) | List view — click-through to review. |
| History Sessions breakdown | `/app/history?tab=sessions` | NO | YES (correct) | Session rows and breakdown rows click through to review. |
| Dashboard Recent Sessions | `/app/dashboard` | NO | YES (correct) | Summary/launchpad row linking to review. |
| Dashboard Recent Activity | `/app/dashboard` | NO | YES (correct) | Summary/launchpad row linking to review. |

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
- `toggleBookmarkForQuestion()` in `practice-page-logic.ts` — reusable toggle + timeout + idempotency-key rotation logic
- `scheduleBookmarkMessageAutoClear()` in `bookmark-message-timeout.ts` — reusable 2-second message-clear helper

### What needs to be built
- **Bookmark state in `useQuestionPageController`** (or a new companion hook): The question review page needs to know if the current question is bookmarked and expose a toggle function. Two approaches:
  - **Option 1:** Import `usePracticeQuestionBookmarks` and wire it into `QuestionView`. This hook already handles load, toggle, retry, error, and toast handoff — but it loads the user's **entire** bookmark set on mount. For the review page, we only need to check one question at a time.
  - **Option 2:** Create a lighter-weight hook (e.g., `useQuestionBookmark`) that checks/toggles a single question's bookmark state. Simpler, but duplicates some logic from `usePracticeQuestionBookmarks`.
  - **Option 3:** Extract shared bookmark toggle logic into a lower-level utility, consumed by both the practice hook and the review page hook.

### What needs to change to remove bookmark from exam mode
- `practice-view.tsx` lines 345-354: Wrap the bookmark button in a condition that hides it when `isExamMode` is true. Do **not** key off `onToggleMarkForReview`; that prop is still passed from the session page view outside exam mode, and the mark-for-review hook itself guards on session mode.

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
   │ - toggles single     │            │  BookmarksToast handles    │
   └──────────┬──────────┘            │  ?toast=bookmark_removed    │
              │                       └──────────────┬────────────┘
    ┌─────────┴─────────┐                           │
    │ consumed by:       │              ┌───────────┴────────────────────────┐
    │ - usePracticeQuestionFlow         │  BookmarkRowShell                    │
    │ - usePracticeSessionPageController│  → /app/questions/[slug]             │
    └─────────┬─────────┘               │    ?from=bookmarks&mode=review      │
              │                         └───────────┬─────────────┘
   ┌──────────┴──────────┐                          │
   │ PracticeView         │                          │
   │ + QuickPracticeClient│                          │
   │ + PracticeSessionView│                          │
   └─────────────────────┘                          │
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         │                 Question Review Page                 │
                         │ /app/questions/[slug]?mode=review                   │
                         │ entry points today: History, Bookmarks, Dashboard   │
                         │ route contract also supports `from=practice`        │
                         │ ❌ NO BOOKMARK WIRING                               │
                         └─────────────────────────────────────────────────────┘
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
| `app/(app)/app/practice/practice-page-logic.ts` | Shared `toggleBookmarkForQuestion()` helper |
| `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts` | Bookmark state hook (load, toggle, retry) |
| `app/(app)/app/practice/practice-page-bookmarks.ts` | Effect factory for initial bookmark load |
| `app/(app)/app/practice/hooks/bookmark-message-timeout.ts` | Shared bookmark message auto-clear helper |
| `app/(app)/app/practice/hooks/use-practice-question-flow.ts` | Quick-practice composition point for bookmark state |
| `app/(app)/app/practice/components/practice-view.tsx` | Renders bookmark button (lines 345-354) |
| `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` | Session composition point for bookmark state |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | Wires bookmark props to PracticeView |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Wires bookmark props to PracticeView |
| `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts` | Loads bookmark-backed quick-practice segmented counts |
| `app/(app)/app/practice/practice-page-types.ts` | Displays `"Bookmarked"` status label |

### Frontend — Question Review Page (NO bookmark wiring)
| File | Purpose |
|------|---------|
| `app/(app)/app/questions/[slug]/page.tsx` | Page component (server) |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | QuestionView — **no bookmark button** |
| `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | Controller hook — **no bookmark state** |
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
