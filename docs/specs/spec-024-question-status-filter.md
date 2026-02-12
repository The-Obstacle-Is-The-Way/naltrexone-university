# SPEC-024: Question Status Filter for Practice & Quick Practice

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-12
**Depends On:** SPEC-013 (Practice Sessions), SPEC-019 (Practice UX Redesign)
**Brainstorming:** `docs/brainstorming/bs-012-question-status-filter.md`

---

## 1. Executive Summary

Users cannot filter practice questions by attempt status. The Practice session creation page has Mode, Count, Difficulty, and Tag filters — but no way to target unanswered, incorrect, or bookmarked questions. Quick Practice has zero filters of any kind.

Every major question bank (UWorld, AMBOSS, BoardVitals) provides a Question Status filter at session creation time. Without it, users waste time re-answering mastered questions and have no targeted review workflow for incorrect ones. This is also the prerequisite for making the History tab review-only (BS-011 Bug A) — without a Practice-based reattempt path, there is no alternative.

This spec adds a **Question Status** filter to both Practice session creation and Quick Practice, using the same `FilterChip` component pattern already used for Difficulty.

---

## 2. Decisions (No Optionality)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Which statuses? | **Unanswered, Incorrect, Marked** | Covers the three core study strategies: new questions, weak areas, flagged items. "All" is represented by selecting none (same pattern as Difficulty). |
| Default selection? | **None selected (= All)** | Consistent with Difficulty filter behavior: "Leave empty to include all." Users who want targeted practice will actively select a status. |
| Multi-select? | **Yes — same as Difficulty** | Users may want "Unanswered + Incorrect" (all unseen or wrong). Single-select adds arbitrary restriction. Difficulty already uses multi-select. |
| What does "Incorrect" mean? | **Most recent attempt was incorrect** | If you got it wrong then right, it's no longer "Incorrect." Matches industry standard. |
| Where does filtering happen? | **Repository layer (SQL)** | Status filtering is a query concern. Filtering in the application layer would require fetching all question IDs first, which doesn't scale. |
| New repository method or extend existing? | **Extend `listPublishedCandidateIds`** | The existing method already accepts filters and returns candidate IDs. Adding status to the filter type is the natural extension. |
| Quick Practice state persistence? | **URL search param (`?status=unanswered,incorrect`)** | Survives page refresh, shareable. Consistent with how other pages use URL params. |
| Candidate count display before starting? | **Not in v1** | Nice-to-have. The "No questions match" empty state is sufficient for now. |
| Does this affect the domain layer? | **Add a small value object enum only** | We need a shared, type-safe status union for ports + UI. This adds **no domain logic** (pure enum + validator). Filtering remains a repository/query concern. |

---

## 3. Architecture

### 3.1 Data Flow — Practice Session Creation

```
Practice Page Form
  ↓ user selects: [Incorrect] [Marked]
  ↓ filters = { tagSlugs: [...], difficulties: [...], statuses: ['incorrect', 'marked'] }
  ↓
usePracticeSessionStart → startSession()
  ↓ calls startPracticeSession server action
  ↓
practice-controller.ts → StartPracticeSessionUseCase.execute()
  ↓ passes filters including statuses to repository
  ↓
questions.listPublishedCandidateIds({ tagSlugs, difficulties, statuses, userId })
  ↓ SQL: WHERE status='published' AND difficulty IN (...) AND [status subquery]
  ↓ returns candidate IDs
  ↓
shuffleWithSeed(candidateIds, seed).slice(0, count)
  ↓ creates session with selected question IDs
```

### 3.2 Data Flow — Quick Practice

```
Quick Practice Page
  ↓ user selects: [Unanswered]
  ↓ URL: /app/practice/quick?status=unanswered
  ↓ filters = { tagSlugs: [], difficulties: [], statuses: ['unanswered'] }
  ↓
usePracticeQuestionFlow → getNextQuestion server action
  ↓
GetNextQuestionUseCase.executeForFilters()
  ↓ passes filters including statuses to repository
  ↓
questions.listPublishedCandidateIds({ tagSlugs, difficulties, statuses, userId })
  ↓ returns candidate IDs (already filtered by status)
  ↓
selectNextQuestionId(candidateIds, attemptHistory)
  ↓ picks least-recently-seen from filtered pool
```

### 3.3 Status Filter SQL Logic

The status filter pre-filters the candidate pool before other filters (difficulty, tags) are applied. Each status maps to a subquery against the `attempts` or `bookmarks` table:

| Status | SQL Condition | Index Used |
|--------|--------------|------------|
| `unanswered` | `question.id NOT IN (SELECT DISTINCT questionId FROM attempts WHERE userId = ?)` | `attempts_user_question_answered_at_idx` |
| `incorrect` | `question.id IN (SELECT questionId FROM [latest-attempt-per-question subquery] WHERE isCorrect = false)` | `attempts_user_question_answered_at_idx` |
| `marked` | `question.id IN (SELECT questionId FROM bookmarks WHERE userId = ?)` | `bookmarks_user_created_at_idx` |

When multiple statuses are selected (e.g., `['unanswered', 'incorrect']`), the conditions are combined with `OR` — a question matches if it satisfies ANY selected status.

When no statuses are selected, no status filter is applied (current behavior).

### 3.4 The "Incorrect" Subquery

"Most recent attempt was incorrect" requires a lateral subquery or window function:

```sql
-- Latest attempt per question for user
SELECT DISTINCT ON (question_id)
  question_id, is_correct
FROM attempts
WHERE user_id = ?
ORDER BY question_id, answered_at DESC, id DESC
```

Then filter: `WHERE is_correct = false`.

The existing index `attempts_user_question_answered_at_idx ON (userId, questionId, DESC answeredAt)` supports this efficiently.

---

## 4. Detailed Design

### 4.1 Value Object: Question Progress Status

**File:** `src/domain/value-objects/question-progress-status.ts` ← NEW

> **Naming note:** This is a *user-relative* progress/status filter (unanswered/incorrect/marked).
> The codebase already has `QuestionStatus` in `src/domain/value-objects/question-status.ts`,
> which is the **publication status** (`draft | published | archived`). Do not reuse that type.

```typescript
export const AllQuestionProgressStatuses = [
  'unanswered',
  'incorrect',
  'marked',
] as const;

export type QuestionProgressStatus =
  (typeof AllQuestionProgressStatuses)[number];

export function isValidQuestionProgressStatus(
  value: string,
): value is QuestionProgressStatus {
  return AllQuestionProgressStatuses.includes(value as QuestionProgressStatus);
}
```

Export from `src/domain/value-objects/index.ts`.

### 4.2 Application Port: QuestionFilters

**File:** `src/application/ports/question-repository.ts`

Extend `QuestionFilters`:

```typescript
import type {
  QuestionDifficulty,
  QuestionProgressStatus,
} from '@/src/domain/value-objects';

export type QuestionFilters = {
  tagSlugs: readonly string[];
  difficulties: readonly QuestionDifficulty[];
  statuses?: readonly QuestionProgressStatus[];  // ← NEW (default [])
  userId?: string;                               // ← NEW — required when statuses is non-empty
};
```

**Why `userId` in filters?** Status filtering requires knowing which user's attempts/bookmarks to query. The current `listPublishedCandidateIds` doesn't need `userId` because difficulty and tag filters are user-independent. Status filters are user-dependent.

### 4.3 Application Port: BookmarkRepository

**File:** `src/application/ports/bookmark-repository.ts`

**No changes in v1.** "Marked" filtering is implemented inside
`DrizzleQuestionRepository.listPublishedCandidateIds` via a SQL subquery on the `bookmarks`
table (same DB connection), so the BookmarkRepository port does not need a new method.

### 4.4 Repository Implementation: Question Candidate Filtering

**File:** `src/adapters/repositories/drizzle-question-repository.ts`

Update `listPublishedCandidateIds` to handle status filters. The method signature already accepts `QuestionFilters` — the change is in the implementation.

**Key logic:**

```typescript
async listPublishedCandidateIds(filters: QuestionFilters) {
  const hasDifficultyFilter = filters.difficulties.length > 0;
  const hasTagFilter = filters.tagSlugs.length > 0;
  const hasStatusFilter = filters.statuses.length > 0;

  const whereParts: SQL[] = [eq(questions.status, 'published')];

  if (hasDifficultyFilter) {
    whereParts.push(inArray(questions.difficulty, [...filters.difficulties]));
  }

  if (hasStatusFilter && filters.userId) {
    const statusConditions = filters.statuses.map((status) =>
      this.buildStatusCondition(status, filters.userId!),
    );
    // OR across selected statuses
    whereParts.push(
      statusConditions.length === 1
        ? statusConditions[0]
        : or(...statusConditions)!,
    );
  }

  // ... rest of existing tag filter logic unchanged
}

private buildStatusCondition(status: QuestionProgressStatus, userId: string): SQL {
  switch (status) {
    case 'unanswered':
      return notInArray(
        questions.id,
        this.db
          .selectDistinct({ questionId: attempts.questionId })
          .from(attempts)
          .where(eq(attempts.userId, userId)),
      );
    case 'incorrect':
      return inArray(
        questions.id,
        this.db
          .select({ questionId: attempts.questionId })
          .from(attempts)
          .where(
            and(
              eq(attempts.userId, userId),
              eq(attempts.isCorrect, false),
            ),
          )
          // Only include questions where the LATEST attempt is incorrect
          // This requires DISTINCT ON or a subquery approach
          // Implementation detail: use a correlated subquery or lateral join
      );
    case 'marked':
      return inArray(
        questions.id,
        this.db
          .select({ questionId: bookmarks.questionId })
          .from(bookmarks)
          .where(eq(bookmarks.userId, userId)),
      );
  }
}
```

**Note on "incorrect" implementation:** The exact Drizzle ORM syntax for `DISTINCT ON` varies. The implementer should use the pattern that Drizzle supports — either raw SQL via `sql` template, a subquery with window functions, or the approach that's most readable. The semantic requirement is: "question's most recent attempt (by `answeredAt DESC, id DESC`) has `isCorrect = false`."

### 4.5 Repository Implementation: DrizzleBookmarkRepository

**File:** `src/adapters/repositories/drizzle-bookmark-repository.ts`

**No changes in v1.** Bookmark data is queried via the `bookmarks` table subquery inside
`DrizzleQuestionRepository.listPublishedCandidateIds` when `status='marked'`.

### 4.6 Fake Repositories

**File:** `src/application/test-helpers/fakes/fake-repositories.ts`

Update `FakeQuestionRepository.listPublishedCandidateIds` signature to accept the extended
`QuestionFilters` type (including optional `statuses` and `userId`). For unit tests, it may
**ignore** status filtering; the status semantics are validated in integration tests against
`DrizzleQuestionRepository` (see §6.2).

### 4.7 Use Case: StartPracticeSessionUseCase

**File:** `src/application/use-cases/start-practice-session.ts`

Update to pass `userId` and `statuses` through to the repository:

```typescript
const candidateIds = await this.questions.listPublishedCandidateIds({
  tagSlugs: input.tagSlugs,
  difficulties: input.difficulties,
  statuses: input.statuses ?? [],     // ← NEW
  userId: input.userId,               // ← NEW (already available from input)
});
```

Update `StartPracticeSessionInput`:

```typescript
export type StartPracticeSessionInput = {
  userId: string;
  mode: PracticeMode;
  count: number;
  tagSlugs: readonly string[];
  difficulties: readonly QuestionDifficulty[];
  statuses?: readonly QuestionProgressStatus[];  // ← NEW
};
```

### 4.8 Use Case: GetNextQuestionUseCase

**File:** `src/application/use-cases/get-next-question.ts`

Update `executeForFilters` to pass `userId` and `statuses`:

```typescript
private async executeForFilters(userId: string, filters: QuestionFilters) {
  const candidateIds = await this.questions.listPublishedCandidateIds({
    ...filters,
    userId,  // ← already available, now passed through
  });
  // ... rest unchanged
}
```

### 4.9 Controller: Practice Controller

**File:** `src/adapters/controllers/practice-schemas.ts`

Update `StartPracticeSessionInputSchema` to accept `statuses`:

```typescript
const zQuestionProgressStatus = z.enum(['unanswered', 'incorrect', 'marked']);

export const StartPracticeSessionInputSchema = z
  .object({
    // ... existing fields
    statuses: z.array(zQuestionProgressStatus).max(3).default([]), // ← NEW
  })
  .strict();
```

**File:** `src/adapters/controllers/practice-controller.ts`

Update `startPracticeSession` action to pass `statuses` through to the use case:

```typescript
const { mode, count, tagSlugs, difficulties, statuses, idempotencyKey } = input;

return d.startPracticeSessionUseCase.execute({
  userId,
  mode,
  count,
  tagSlugs,
  difficulties,
  statuses, // ← NEW
});
```

### 4.10 Controller: Question Controller

**File:** `src/adapters/controllers/question-controller.ts`

Update `getNextQuestion` action's filter schema to accept `statuses`. Same `QuestionFiltersSchema` addition as above (or extract to shared schema).

### 4.11 Frontend Type: PracticeFilters

**File:** `app/(app)/app/practice/practice-page-types.ts`

```typescript
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { QuestionProgressStatus } from '@/src/domain/value-objects';

export type PracticeFilters = {
  tagSlugs: string[];
  difficulties: Array<NextQuestion['difficulty']>;
  statuses: QuestionProgressStatus[];  // ← NEW
};
```

### 4.12 Frontend: Practice Session Starter

**File:** `app/(app)/app/practice/components/practice-session-starter.tsx`

Add a **Status** filter row between the Mode/Count row and the Difficulty row, using the same `FilterChip` component:

```tsx
{/* Status filter */}
<div>
  <label className="text-sm font-medium text-foreground">Status</label>
  <div className="mt-2 flex flex-wrap gap-2">
    {AllQuestionProgressStatuses.map((status) => (
      <FilterChip
        key={status}
        label={statusDisplayLabel(status)}
        selected={filters.statuses.includes(status)}
        onClick={() => onToggleStatus(status)}
      />
    ))}
  </div>
  <p className="mt-1.5 text-xs text-muted-foreground">
    Leave empty to include all questions
  </p>
</div>
```

**Display labels:**

```typescript
function statusDisplayLabel(status: QuestionProgressStatus): string {
  switch (status) {
    case 'unanswered': return 'Unanswered';
    case 'incorrect': return 'Incorrect';
    case 'marked': return 'Marked';
  }
}
```

### 4.13 Frontend: Practice Session Start Hook

**File:** `app/(app)/app/practice/hooks/use-practice-session-start.ts`

Update initial state:

```typescript
const [filters, setFilters] = useState<PracticeFilters>({
  tagSlugs: [],
  difficulties: [],
  statuses: [],  // ← NEW
});
```

Add toggle handler (same pattern as `onToggleDifficulty`):

```typescript
const onToggleStatus = createToggleStatusHandler({
  setFilters,
  setIdempotencyKey,
  createIdempotencyKey: () => crypto.randomUUID(),
});
```

### 4.14 Frontend: Toggle Handler

**File:** `app/(app)/app/practice/practice-page-session-start.ts`

Add `createToggleStatusHandler` (same pattern as `createToggleDifficultyHandler`):

```typescript
export function createToggleStatusHandler(input: {
  setFilters: (next: PracticeFilters | ((prev: PracticeFilters) => PracticeFilters)) => void;
  setIdempotencyKey: (key: string) => void;
  createIdempotencyKey: () => string;
}): (status: QuestionProgressStatus) => void {
  return (status) => {
    input.setFilters((prev) => ({
      ...prev,
      statuses: toggleInArray(prev.statuses, status),
    }));
    input.setIdempotencyKey(input.createIdempotencyKey());
  };
}
```

### 4.15 Frontend: Quick Practice Page

**File:** `app/(app)/app/practice/quick/quick-practice-client.tsx`

Replace hardcoded empty filters with URL-driven state:

```typescript
'use client';

import { useSearchParams } from 'next/navigation';
import type { QuestionProgressStatus } from '@/src/domain/value-objects';
import { AllQuestionProgressStatuses } from '@/src/domain/value-objects';

function parseStatusParams(searchParams: URLSearchParams): QuestionProgressStatus[] {
  const raw = searchParams.get('status');
  if (!raw) return [];
  return raw
    .split(',')
    .filter((s): s is QuestionProgressStatus =>
      AllQuestionProgressStatuses.includes(s as QuestionProgressStatus),
    );
}

export default function QuickPracticeClient() {
  const searchParams = useSearchParams();
  const statuses = parseStatusParams(searchParams);

  const filters: PracticeFilters = {
    tagSlugs: [],
    difficulties: [],
    statuses,
  };

  // ... render status FilterChips above the question card
  // On chip toggle, update URL params via router.push
}
```

### 4.16 Empty State

When the selected filter combination yields 0 candidate questions, the session creation flow already handles this — `startPracticeSession` returns an error when `candidateIds.length === 0`. The frontend shows the error message.

For Quick Practice, `getNextQuestion` already returns `null` when no candidates are available. The existing "No more questions" empty state will render.

No new empty state components are needed.

---

## 5. Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/domain/value-objects/question-progress-status.ts` | `QuestionProgressStatus` type + `AllQuestionProgressStatuses` constant |
| `src/domain/value-objects/question-progress-status.test.ts` | Enum/validator unit tests (mirrors other value objects) |
| `app/(app)/app/practice/quick/quick-practice-client.test.tsx` | Quick Practice status filter parsing + rendering tests |

### Modified Files

| File | Change |
|------|--------|
| `src/domain/value-objects/index.ts` | Export `QuestionProgressStatus`, `AllQuestionProgressStatuses`, `isValidQuestionProgressStatus` |
| `src/application/ports/question-repository.ts` | Add `statuses` and `userId` to `QuestionFilters` |
| `src/adapters/repositories/drizzle-question-repository.ts` | Add status filter logic to `listPublishedCandidateIds` |
| `src/application/test-helpers/fakes/fake-repositories.ts` | Accept extended `QuestionFilters` type in `FakeQuestionRepository` |
| `src/application/use-cases/start-practice-session.ts` | Accept `statuses` in input, pass to repository |
| `src/application/use-cases/start-practice-session.test.ts` | Add tests for status filtering |
| `src/application/use-cases/get-next-question.ts` | Pass `userId` through to repository filters |
| `src/application/use-cases/get-next-question.test.ts` | Add tests for status filtering |
| `src/adapters/controllers/practice-schemas.ts` | Add `statuses` to `StartPracticeSessionInputSchema` |
| `src/adapters/controllers/practice-controller.ts` | Pass `statuses` to use case |
| `src/adapters/controllers/question-controller.ts` | Add `statuses` to filter schema |
| `app/(app)/app/practice/practice-page-types.ts` | Add `statuses` to `PracticeFilters` |
| `app/(app)/app/practice/practice-page-session-start.ts` | Add `createToggleStatusHandler` |
| `app/(app)/app/practice/hooks/use-practice-session-start.ts` | Add `statuses` to initial state, wire toggle handler |
| `app/(app)/app/practice/components/practice-session-starter.tsx` | Add Status filter row with `FilterChip` components |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Add URL-driven status filter with `FilterChip` UI |

---

## 6. Test Plan

### 6.1 Unit Tests (Vitest)

#### Value Object

**File:** `src/domain/value-objects/question-progress-status.test.ts`

```
- AllQuestionProgressStatuses contains exactly ['unanswered', 'incorrect', 'marked']
- isValidQuestionProgressStatus validates known values and rejects unknown
```

#### Start Practice Session Use Case

**File:** `src/application/use-cases/start-practice-session.test.ts`

Add tests:

```
- passes statuses + userId through to listPublishedCandidateIds when statuses provided
- passes empty/undefined statuses through without changing existing behavior
- throws NOT_FOUND when listPublishedCandidateIds yields 0 candidates (status filter can cause this)
```

#### Get Next Question Use Case

**File:** `src/application/use-cases/get-next-question.test.ts`

Add tests:

```
- passes statuses through to listPublishedCandidateIds
- returns null when status filter yields no candidates
```

#### Practice Page Logic

**File:** `app/(app)/app/practice/practice-page-logic.test.ts`

Add tests:

```
createToggleStatusHandler:
  - adds status to filters when not selected
  - removes status from filters when already selected
  - regenerates idempotency key on toggle
```

#### Practice Session Starter Component

**File:** `app/(app)/app/practice/components/practice-session-starter.test.tsx`

Add tests:

```
- renders Status filter chips (Unanswered, Incorrect, Marked)
- renders "Leave empty to include all questions" hint text
- calls onToggleStatus when a status chip is clicked
- shows selected state on active status chips
```

#### Quick Practice Client

**File:** `app/(app)/app/practice/quick/quick-practice-client.test.tsx`

Add tests:

```
- parses status from URL search params
- renders status filter chips
- passes parsed statuses to practice question flow
```

### 6.2 Integration Tests

**File:** `tests/integration/repositories.integration.test.ts`

Add tests for `listPublishedCandidateIds` with status filters:

```
listPublishedCandidateIds with status filters:
  - returns only unanswered questions when status=unanswered
  - returns only questions with latest attempt incorrect when status=incorrect
  - does not return questions where latest attempt is correct for status=incorrect
  - returns only bookmarked questions when status=marked
  - combines unanswered and incorrect with OR logic
  - returns all questions when statuses is empty
  - combines status filter with difficulty filter (AND logic)
  - combines status filter with tag filter (AND logic)
```

### 6.3 E2E Tests (Playwright)

**File:** `tests/e2e/brainstorming-audit.spec.ts`

Update existing tests:

```
UPDATE: "BS-012: Practice page has no question status filter"
  → After implementation, flip to assert filter IS present
  → Verify Unanswered, Incorrect, Marked chips render
  → Verify "Leave empty to include all questions" hint

UPDATE: "BS-012: Quick Practice page has no filters"
  → After implementation, assert status filter IS present on Quick Practice
```

**File:** `tests/e2e/practice.spec.ts`

Add tests:

```
NEW: "practice session respects question status filter"
  → Select "Unanswered" status
  → Start session
  → Verify session starts (or shows "no questions" if all attempted)

NEW: "quick practice respects status URL param"
  → Navigate to /app/practice/quick?status=unanswered
  → Verify status chip is selected
  → Verify question loads
```

---

## 7. Implementation Order

```
Phase 1: Domain + Application Layer
  1. Create src/domain/value-objects/question-progress-status.ts
  2. Export from src/domain/value-objects/index.ts
  3. Update QuestionFilters type (add statuses, userId)
  4. Update FakeQuestionRepository to accept extended QuestionFilters type (GREEN)
  5. Write start-practice-session.test.ts pass-through tests (RED)
  6. Update StartPracticeSessionUseCase input + passthrough (GREEN)
  7. Write get-next-question.test.ts status filter tests (RED)
  8. Update GetNextQuestionUseCase passthrough (GREEN)

Phase 2: Adapter Layer (Repository SQL)
  9. Implement listPublishedCandidateIds status filtering in DrizzleQuestionRepository
  10. Write integration tests for status filtering (RED → GREEN)

Phase 3: Adapter Layer (Controllers)
  11. Update StartPracticeSessionInputSchema in practice-schemas.ts (add statuses)
  12. Update QuestionFiltersSchema in question-controller.ts (add statuses)
  13. Update startPracticeSession action to pass statuses
  14. Update getNextQuestion action to pass statuses

Phase 4: Frontend — Practice Session Creation
  15. Update PracticeFilters type (add statuses)
  16. Write createToggleStatusHandler test (RED)
  17. Implement createToggleStatusHandler (GREEN)
  18. Update usePracticeSessionStart hook (add statuses state + toggle)
  19. Write practice-session-starter.test.tsx status filter tests (RED)
  20. Add Status filter row to PracticeSessionStarter (GREEN)

Phase 5: Frontend — Quick Practice
  21. Write quick-practice-client.test.tsx status filter tests (RED)
  22. Add URL-driven status filter to QuickPracticeClient (GREEN)

Phase 6: Verification
  23. Update brainstorming-audit.spec.ts (flip assertions)
  24. Run: pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build
  25. Run: pnpm test:e2e
```

---

## 8. Acceptance Criteria

- [ ] Practice session creation page shows Status filter row with Unanswered, Incorrect, Marked chips
- [ ] Status filter uses same `FilterChip` component and visual style as Difficulty
- [ ] "Leave empty to include all questions" hint text shown below Status chips
- [ ] Selecting "Unanswered" creates a session with only questions the user has never attempted
- [ ] Selecting "Incorrect" creates a session with only questions where the user's most recent attempt was incorrect
- [ ] Selecting "Marked" creates a session with only questions the user has bookmarked
- [ ] Multiple statuses can be selected simultaneously (OR logic)
- [ ] Status filter combines with Difficulty and Tag filters (AND logic)
- [ ] Quick Practice page shows Status filter chips above the question area
- [ ] Quick Practice status selection persists in URL (`?status=unanswered`)
- [ ] Quick Practice status filter is applied to question selection
- [ ] When no statuses are selected, all questions are included (current behavior preserved)
- [ ] When selected filters yield 0 candidates, appropriate error/empty state is shown
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build` all pass

---

## 9. Non-Goals (Explicitly Out of Scope)

- **History tab behavior changes** — History stays untouched. BS-011 Bug A (making History review-only) is a separate spec that depends on this one.
- **Reset progress feature** — Clearing all attempts to make questions "Unanswered" again. Separate future feature.
- **Advanced filters** — "Not attempted in last 30 days," "Attempted more than 3 times," etc. Future enhancement.
- **Candidate count display** — Showing "42 questions available" before starting a session. Nice-to-have for v2.
- **Difficulty/tag filters on Quick Practice** — Quick Practice currently has no difficulty or tag filters. Adding those is out of scope for this spec.
- **"Correct" as a status** — Users rarely want to re-practice only correct questions. If needed, "All" minus "Incorrect" minus "Unanswered" achieves this.

---

## 10. Known Limitations (v1)

| Limitation | Description | Mitigation |
|------------|-------------|------------|
| No real-time count | User doesn't know how many questions match before starting | Error state when 0 match. Future: show count. |
| "Incorrect" is session-agnostic | Status is based on all-time most recent attempt, not a specific session | Matches industry standard (UWorld, AMBOSS) |
| Quick Practice only filters by status | No difficulty/tag filters on Quick Practice in v1 | Can be added in a future spec |
| Status filter adds SQL complexity | Each selected status adds a subquery to the candidate query | Covered by existing indexes on `attempts` and `bookmarks` tables |

---

## 11. Related

- **BS-012** (Brainstorming) — Problem discovery, competitor analysis, design exploration. All findings in this spec are grounded in that validated analysis.
- **SPEC-013** (Practice Sessions) — Session creation flow that this spec extends.
- **SPEC-019** (Practice UX Redesign) — The Practice page layout that this spec adds filters to.
- **BS-011 Bug A** (Brainstorming) — History review-only behavior that depends on this spec. Once users can reattempt incorrect questions through Practice, History can become review-only.
- **E2E:** `tests/e2e/brainstorming-audit.spec.ts` — Playwright tests confirming the current absence of status filters (will be updated to validate the implementation).
