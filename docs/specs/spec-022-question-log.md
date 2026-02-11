# SPEC-022: Question Log (Quick Practice History Gap)

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-10
**Depends On:** SPEC-021 (History Page Restructure), SPEC-013 (Practice Sessions), SPEC-015 (Dashboard)
**Brainstorming:** `docs/brainstorming/quick-practice-history-gap.md`

---

## 1. Executive Summary

Quick Practice questions answered correctly vanish from the entire UI. Because Quick Practice does **not** create a session, these attempts are stored as **ad-hoc** (`practiceSessionId: null, isCorrect: true`) — the same bucket used by other non-session flows (e.g., reattempting on the question detail page). No page currently surfaces correct ad-hoc attempts. Dashboard stats count them, but users cannot reconcile which questions produced those numbers.

This spec evolves History's "Missed Questions" tab into a complete **Questions** tab — a filterable log of every question ever attempted, regardless of correctness or source mode. The current "Missed Questions" view becomes one filter preset (`result=incorrect`) of this more powerful surface.

The Dashboard's "Recent missed" card becomes "Recent activity" showing a compact list (up to 8) of the most recent question attempts across all modes with correct/incorrect indicators.

---

## 2. Decisions (No Optionality)

Every open question from the brainstorming doc is resolved here.

| Question | Decision | Rationale |
|----------|----------|-----------|
| Tab name | **Questions** | "Missed Questions" is too narrow. "Questions" says "everything you've attempted." Unambiguous. |
| Default filter state | **All** (no filters) | This is the whole point of the change. Users see the complete picture by default. |
| `?tab=missed` backward compat | **Alias → `?tab=questions` with `result=incorrect`** | Bookmarked URLs and the `/app/review` redirect chain keep working. No HTTP redirect needed — parsed server-side. |
| Filter application | **Server-side for Result + Source (pagination-aware); client-side for Difficulty + Tag (page-local)** | Result/source are fundamental and should paginate correctly. Difficulty/tag already behave page-locally today (SPEC-021); keep that v1 trade-off. |
| "Review" action for correct questions | **Link to `/app/questions/[slug]?from=history`** | Same destination as "Reattempt" for incorrect. Button label changes to "Review" for correct questions. |
| Dashboard section rename | **"Recent missed" → "Recent activity"** | Surfaces all modes without adding a new card. |
| Dashboard data source | **`getUserStats({})` → `recentActivity` (display first 8)** | Already computed for stats; includes session + ad-hoc attempts; matches the label "Recent activity" better than a per-question rollup. Keeps the Dashboard scannable while surfacing Quick Practice work. |
| Old `getMissedQuestions` | **Delete after migration** | No remaining consumers. Dead code. |
| Old `AttemptMissedQuestionsReader` | **Keep alongside new interface** | Old methods remain on `AttemptRepository` for backward compat during migration; marked for deletion after all consumers switch. Then delete in cleanup phase. |

---

## 3. Architecture

### 3.1 Data Model Changes

The existing `latestAttemptRowsSubquery` in `DrizzleAttemptRepository` already does the hard work:

```sql
row_number() OVER (PARTITION BY question_id ORDER BY answered_at DESC, id DESC)
```

**Current:** Filters to `attempt_rank = 1 AND is_correct = false` (missed only).
**New:** Filters to `attempt_rank = 1` only (all attempted questions). Selects `is_correct` in output.

### 3.2 Type Chain

```
Repository Port:
  MissedQuestionAttempt (existing, keep)
  + AttemptedQuestionSummary = MissedQuestionAttempt & { isCorrect: boolean }  ← NEW

Repository Interface:
  AttemptMissedQuestionsReader (existing, keep temporarily)
  + AttemptAllQuestionsReader                                                  ← NEW
    listAttemptedQuestionsByUserId(userId, limit, offset)
    countAttemptedQuestionsByUserId(userId)

Use Case:
  GetMissedQuestionsUseCase (existing, delete after migration)
  + GetAttemptedQuestionsUseCase                                               ← NEW
    Input: { userId, limit, offset, result?, source? }
    Output: { rows: AttemptedQuestionRow[], limit, offset, totalCount }

Controller:
  getMissedQuestions (existing, delete after migration)
  + getAttemptedQuestions                                                       ← NEW
```

### 3.3 Frontend Changes

```
History Page:
  HistoryTab: 'sessions' | 'missed'  →  'sessions' | 'questions'
  HistoryTabBar: "Missed Questions"   →  "Questions"
  HistoryMissedTab                    →  HistoryQuestionsTab (rename + evolve)
  history-search-params.ts            →  add result/source parsers + href builder

Dashboard:
  "Recent missed"                     →  "Recent activity"
  getMissedQuestions({ limit: 3 })    →  stats.recentActivity.slice(0, 8) (from getUserStats)
  Add correct/incorrect badge per row
```

### 3.4 URL Scheme

```
/app/history?tab=questions                                    ← NEW default
/app/history?tab=questions&result=incorrect                   ← filtered to missed only
/app/history?tab=questions&result=correct&source=adhoc        ← example compound filter
/app/history?tab=missed                                       ← ALIAS → ?tab=questions&result=incorrect
/app/history?tab=sessions                                     ← unchanged
/app/review                                                   ← 308 → /app/history?tab=questions&result=incorrect
```

---

## 4. Detailed Design

### 4.1 Repository Port

**File:** `src/application/ports/attempt-repository.ts`

Add after existing `MissedQuestionAttempt`:

```typescript
export type AttemptedQuestionSummary = {
  questionId: string;
  answeredAt: Date;
  isCorrect: boolean;
  sessionId: string | null;
  sessionMode: PracticeMode | null;
};
```

Add filter types:

```typescript
export type AttemptedQuestionsResultFilter = 'correct' | 'incorrect';
export type AttemptedQuestionsSourceFilter = 'tutor' | 'exam' | 'adhoc';

export type AttemptedQuestionsFilters = {
  result?: AttemptedQuestionsResultFilter | null;
  source?: AttemptedQuestionsSourceFilter | null;
};
```

Add new interface after `AttemptMissedQuestionsReader`:

```typescript
export interface AttemptAllQuestionsReader {
  /**
   * Paginated attempted question summaries based on the user's most recent
   * attempt per question (all questions, not just incorrect).
   */
  listAttemptedQuestionsByUserId(
    userId: string,
    limit: number,
    offset: number,
    filters?: AttemptedQuestionsFilters,
  ): Promise<readonly AttemptedQuestionSummary[]>;

  /**
   * Total count of unique questions the user has attempted at least once.
   */
  countAttemptedQuestionsByUserId(
    userId: string,
    filters?: AttemptedQuestionsFilters,
  ): Promise<number>;
}
```

Extend `AttemptRepository` to include `AttemptAllQuestionsReader`:

```typescript
export interface AttemptRepository
  extends AttemptWriter,
    AttemptHistoryReader,
    AttemptSessionReader,
    AttemptStatsReader,
    AttemptMissedQuestionsReader,
    AttemptAllQuestionsReader,        // ← NEW
    AttemptMostRecentAnsweredAtReader {}
```

### 4.2 Repository Implementation

**File:** `src/adapters/repositories/drizzle-attempt-repository.ts`

Add two new methods after `countMissedQuestionsByUserId`. They mirror the missed methods but:
- Remove the hardcoded `isCorrect=false` constraint
- Add `isCorrect` to the SELECT
- Apply **optional server-side filters** for:
  - `result`: correct/incorrect
  - `source`: tutor/exam/adhoc

```typescript
async listAttemptedQuestionsByUserId(
  userId: string,
  limit: number,
  offset: number,
  filters?: AttemptedQuestionsFilters,
): Promise<readonly AttemptedQuestionSummary[]> {
  const latestAttemptRows = this.latestAttemptRowsSubquery(userId);

  const conditions: SQL[] = [eq(latestAttemptRows.attemptRank, 1)];

  const result = filters?.result ?? null;
  if (result === 'correct') conditions.push(eq(latestAttemptRows.isCorrect, true));
  if (result === 'incorrect') conditions.push(eq(latestAttemptRows.isCorrect, false));

  const source = filters?.source ?? null;
  if (source === 'adhoc') conditions.push(isNull(latestAttemptRows.practiceSessionId));
  if (source === 'tutor' || source === 'exam') conditions.push(eq(practiceSessions.mode, source));

  const rows = await this.db
    .select({
      questionId: latestAttemptRows.questionId,
      answeredAt: latestAttemptRows.answeredAt,
      isCorrect: latestAttemptRows.isCorrect,
      sessionId: latestAttemptRows.practiceSessionId,
      sessionMode: practiceSessions.mode,
    })
    .from(latestAttemptRows)
    .leftJoin(
      practiceSessions,
      eq(latestAttemptRows.practiceSessionId, practiceSessions.id),
    )
    .where(and(...conditions))
    .orderBy(
      desc(latestAttemptRows.answeredAt),
      desc(latestAttemptRows.questionId),
    )
    .limit(limit)
    .offset(offset);

  const result: AttemptedQuestionSummary[] = [];
  for (const row of rows) {
    if (!row.answeredAt) continue;
    result.push({
      questionId: row.questionId,
      answeredAt: row.answeredAt,
      isCorrect: row.isCorrect,
      sessionId: row.sessionId,
      sessionMode: row.sessionMode,
    });
  }

  return result;
}

async countAttemptedQuestionsByUserId(
  userId: string,
  filters?: AttemptedQuestionsFilters,
): Promise<number> {
  const latestAttemptRows = this.latestAttemptRowsSubquery(userId);

  const conditions: SQL[] = [eq(latestAttemptRows.attemptRank, 1)];

  const result = filters?.result ?? null;
  if (result === 'correct') conditions.push(eq(latestAttemptRows.isCorrect, true));
  if (result === 'incorrect') conditions.push(eq(latestAttemptRows.isCorrect, false));

  const source = filters?.source ?? null;
  if (source === 'adhoc') conditions.push(isNull(latestAttemptRows.practiceSessionId));
  if (source === 'tutor' || source === 'exam') conditions.push(eq(practiceSessions.mode, source));

  const [row] = await this.db
    .select({ count: sql<number>`count(*)::int` })
    .from(latestAttemptRows)
    .leftJoin(
      practiceSessions,
      eq(latestAttemptRows.practiceSessionId, practiceSessions.id),
    )
    .where(and(...conditions));

  return row?.count ?? 0;
}
```

### 4.3 Fake Repository

**File:** `src/application/test-helpers/fakes/fake-repositories.ts`

Add two new methods to `FakeAttemptRepository`. They mirror the missed methods but include all questions (not just `isCorrect === false`):

```typescript
async listAttemptedQuestionsByUserId(
  userId: string,
  limit: number,
  offset: number,
  filters?: AttemptedQuestionsFilters,
): Promise<readonly AttemptedQuestionSummary[]> {
  const mostRecentByQuestionId = new Map<string, InMemoryAttempt>();
  for (const attempt of this.attempts) {
    if (attempt.userId !== userId) continue;
    const existing = mostRecentByQuestionId.get(attempt.questionId);
    if (!existing || this.isLaterAttempt(attempt, existing)) {
      mostRecentByQuestionId.set(attempt.questionId, attempt);
    }
  }

  const candidates = [...mostRecentByQuestionId.values()];

  const result = filters?.result ?? null;
  const filteredByResult =
    result === 'correct'
      ? candidates.filter((a) => a.isCorrect)
      : result === 'incorrect'
        ? candidates.filter((a) => !a.isCorrect)
        : candidates;

  const source = filters?.source ?? null;
  const filteredBySource =
    source === 'adhoc'
      ? filteredByResult.filter((a) => a.practiceSessionId === null)
      : source === 'tutor' || source === 'exam'
        ? filteredByResult.filter((a) => a.practiceSessionId !== null && a.sessionMode === source)
        : filteredByResult;

  return filteredBySource
    .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
    .slice(offset, offset + limit)
    .map((a) => ({
      questionId: a.questionId,
      answeredAt: a.answeredAt,
      isCorrect: a.isCorrect,
      sessionId: a.practiceSessionId,
      sessionMode: a.sessionMode ?? null,
    }));
}

async countAttemptedQuestionsByUserId(
  userId: string,
  filters?: AttemptedQuestionsFilters,
): Promise<number> {
  const mostRecentByQuestionId = new Map<string, InMemoryAttempt>();
  for (const attempt of this.attempts) {
    if (attempt.userId !== userId) continue;
    const existing = mostRecentByQuestionId.get(attempt.questionId);
    if (!existing || this.isLaterAttempt(attempt, existing)) {
      mostRecentByQuestionId.set(attempt.questionId, attempt);
    }
  }

  const candidates = [...mostRecentByQuestionId.values()];

  const result = filters?.result ?? null;
  const filteredByResult =
    result === 'correct'
      ? candidates.filter((a) => a.isCorrect)
      : result === 'incorrect'
        ? candidates.filter((a) => !a.isCorrect)
        : candidates;

  const source = filters?.source ?? null;
  const filteredBySource =
    source === 'adhoc'
      ? filteredByResult.filter((a) => a.practiceSessionId === null)
      : source === 'tutor' || source === 'exam'
        ? filteredByResult.filter((a) => a.practiceSessionId !== null && a.sessionMode === source)
        : filteredByResult;

  return filteredBySource.length;
}
```

### 4.4 Use Case

**File:** `src/application/use-cases/get-attempted-questions.ts` ← NEW

```typescript
export type GetAttemptedQuestionsInput = {
  userId: string;
  limit: number;
  offset: number;
  result?: AttemptedQuestionsResultFilter | null;
  source?: AttemptedQuestionsSourceFilter | null;
};

export type AvailableAttemptedQuestionRow = {
  isAvailable: true;
  questionId: string;
  isCorrect: boolean;
  sessionId: string | null;
  sessionMode: 'tutor' | 'exam' | null;
  slug: string;
  stemMd: string;
  difficulty: QuestionDifficulty;
  tagSlugs: string[];
  lastAnsweredAt: string; // ISO
};

export type UnavailableAttemptedQuestionRow = {
  isAvailable: false;
  questionId: string;
  isCorrect: boolean;
  sessionId: string | null;
  sessionMode: 'tutor' | 'exam' | null;
  lastAnsweredAt: string; // ISO
};

export type AttemptedQuestionRow =
  | AvailableAttemptedQuestionRow
  | UnavailableAttemptedQuestionRow;

export type GetAttemptedQuestionsOutput = {
  rows: AttemptedQuestionRow[];
  limit: number;
  offset: number;
  totalCount: number;
};
```

Constructor takes `AttemptAllQuestionsReader`, `QuestionRepository`, `Logger`. The `execute` method is structurally identical to `GetMissedQuestionsUseCase.execute`, except it passes optional `result/source` filters through to the repository methods:
- calls `countAttemptedQuestionsByUserId(userId, { result, source })`
- calls `listAttemptedQuestionsByUserId(userId, limit, offset, { result, source })`
- enriches with question data via `enrichWithQuestion`
- includes `isCorrect` on each row

### 4.5 Controller

**File:** `src/adapters/controllers/review-controller.ts`

Add new action alongside existing `getMissedQuestions`:

```typescript
const GetAttemptedQuestionsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGINATION_LIMIT),
    offset: z.number().int().min(0),
    result: z.enum(['correct', 'incorrect']).optional(),
    source: z.enum(['tutor', 'exam', 'adhoc']).optional(),
  })
  .strict();

export const getAttemptedQuestions = createAction({
  schema: GetAttemptedQuestionsInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);
    return d.getAttemptedQuestionsUseCase.execute({
      userId,
      limit: input.limit,
      offset: input.offset,
      result: input.result ?? null,
      source: input.source ?? null,
    });
  },
});
```

Update `ReviewControllerDeps` to include the new use case:

```typescript
export type ReviewControllerDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  getMissedQuestionsUseCase: { execute: ... };       // keep for now
  getAttemptedQuestionsUseCase: {                     // ← NEW
    execute: (input: GetAttemptedQuestionsInput) => Promise<GetAttemptedQuestionsOutput>;
  };
};
```

### 4.6 Container Wiring

**File:** `lib/container/types.ts`

Add to `UseCaseFactories`:

```typescript
createGetAttemptedQuestionsUseCase: () => GetAttemptedQuestionsUseCase;
```

**File:** `lib/container/use-cases.ts`

Add factory:

```typescript
createGetAttemptedQuestionsUseCase: () =>
  new GetAttemptedQuestionsUseCase(
    repositories.createAttemptRepository(),
    repositories.createQuestionRepository(),
    primitives.logger,
  ),
```

**File:** `lib/container/controllers.ts`

Update `createReviewControllerDeps`:

```typescript
createReviewControllerDeps: () => ({
  authGateway: gateways.createAuthGateway(),
  checkEntitlementUseCase: useCases.createCheckEntitlementUseCase(),
  getMissedQuestionsUseCase: useCases.createGetMissedQuestionsUseCase(),
  getAttemptedQuestionsUseCase: useCases.createGetAttemptedQuestionsUseCase(), // ← NEW
}),
```

### 4.7 History Search Params

**File:** `app/(app)/app/history/history-search-params.ts`

Update `HistoryTab`:

```typescript
export type HistoryTab = 'sessions' | 'questions';
```

Add new filter types:

```typescript
export type ResultFilter = 'correct' | 'incorrect';
export type SourceFilter = 'tutor' | 'exam' | 'adhoc';

export type QuestionsFilters = {
  difficulty?: DifficultyFilter | null;
  tagSlug?: string | null;
  result?: ResultFilter | null;
  source?: SourceFilter | null;
};
```

Update `parseHistoryTab` to map `'missed'` → `'questions'`:

```typescript
export function parseHistoryTab(value: string | undefined): HistoryTab {
  if (value === 'questions' || value === 'missed') return 'questions';
  return 'sessions';
}
```

Add new parsers:

```typescript
export function parseResultFilter(value: string | undefined): ResultFilter | null {
  if (value === 'correct') return value;
  if (value === 'incorrect') return value;
  return null;
}

export function parseSourceFilter(value: string | undefined): SourceFilter | null {
  if (value === 'tutor') return value;
  if (value === 'exam') return value;
  if (value === 'adhoc') return value;
  // Legacy alias from early drafts
  if (value === 'quick') return 'adhoc';
  return null;
}
```

Add new href builder:

```typescript
export function buildHistoryQuestionsHref(input: {
  limit: number;
  offset: number;
  filters?: QuestionsFilters;
}): string {
  const params = new URLSearchParams();
  params.set('tab', 'questions');
  params.set('offset', String(input.offset));
  params.set('limit', String(input.limit));

  if (input.filters?.difficulty) params.set('difficulty', input.filters.difficulty);
  if (input.filters?.tagSlug) params.set('tag', input.filters.tagSlug);
  if (input.filters?.result) params.set('result', input.filters.result);
  if (input.filters?.source) params.set('source', input.filters.source);

  return `${ROUTES.APP_HISTORY}?${params.toString()}`;
}
```

**Deprecate (keep but stop using):** `MissedFilters`, `buildHistoryMissedHref`. Remove when no consumers remain.

### 4.8 History Tab Bar

**File:** `app/(app)/app/history/components/history-tab-bar.tsx`

```typescript
export function HistoryTabBar({
  activeTab,
}: {
  activeTab: 'sessions' | 'questions';
}) {
  return (
    <nav aria-label="History tabs">
      <div className="...">
        <Link
          href={`${ROUTES.APP_HISTORY}?tab=sessions`}
          aria-current={activeTab === 'sessions' ? 'page' : undefined}
          className={...}
        >
          Sessions
        </Link>
        <Link
          href={`${ROUTES.APP_HISTORY}?tab=questions`}
          aria-current={activeTab === 'questions' ? 'page' : undefined}
          className={...}
        >
          Questions
        </Link>
      </div>
    </nav>
  );
}
```

### 4.9 History Questions Tab

**File:** `app/(app)/app/history/components/history-questions-tab.tsx` ← RENAME from `history-missed-tab.tsx`

Evolve the existing `HistoryMissedTab` component:

**Props change:**

```typescript
export type HistoryQuestionsTabProps = {
  result: ActionResult<GetAttemptedQuestionsOutput>;
  filters?: QuestionsFilters;
};
```

**New filter dropdowns (add to existing form):**

| Filter | `<select name="...">` | Options |
|--------|----------------------|---------|
| Result | `name="result"` | All / Correct / Incorrect |
| Source | `name="source"` | All / Tutor / Exam / Ad-hoc practice |
| Difficulty | `name="difficulty"` | (existing, unchanged) |
| Tag | `name="tag"` | (existing, unchanged) |

**Client-side filter logic update:**

```typescript
const hasActiveDifficultyOrTagFilters = Boolean(
  selectedDifficulty || selectedTagSlug,
);

const displayRows = hasActiveDifficultyOrTagFilters
  ? rows.filter((row) => {
      if (!row.isAvailable) return false;
      if (selectedDifficulty && row.difficulty !== selectedDifficulty) return false;
      if (selectedTagSlug && !row.tagSlugs.includes(selectedTagSlug)) return false;
      return true;
    })
  : rows;
```

**Per-row changes:**

1. **Result badge** — Add before difficulty badge:
   - Correct: `<span className="text-emerald-500">Correct</span>`
   - Incorrect: `<span className="text-destructive">Incorrect</span>`

2. **Date label** — Change from `Missed {date}` to just `{date}` (since questions may be correct).

3. **Action button** — Change label based on `isCorrect`:
   - `isCorrect === false` → "Reattempt" (existing behavior)
   - `isCorrect === true` → "Review"
   - Both link to `toQuestionRoute(slug, { from: 'history' })`

4. **Unavailable row** — Show `isCorrect` badge even for unavailable rows (we have this data).

**Empty state update:**

Current: `"No missed questions yet."`
New: `"No questions attempted yet. Start practicing to build your question history."`

**Pagination href builder:** Replace `buildHistoryMissedHref` with `buildHistoryQuestionsHref`.

**Hidden form inputs:** Change `<input type="hidden" name="tab" value="missed" />` to `value="questions"`.

### 4.10 History Page Client

**File:** `app/(app)/app/history/history-page-client.tsx`

Update discriminated union:

```typescript
export type HistoryPageClientProps =
  | {
      activeTab: 'sessions';
      sessionsResult: ActionResult<GetSessionHistoryOutput>;
    }
  | {
      activeTab: 'questions';
      questionsResult: ActionResult<GetAttemptedQuestionsOutput>;
      questionsFilters?: QuestionsFilters;
    };
```

Update rendering:

```typescript
{props.activeTab === 'sessions' ? (
  <HistorySessionsTab result={props.sessionsResult} />
) : (
  <HistoryQuestionsTab
    result={props.questionsResult}
    filters={props.questionsFilters}
  />
)}
```

Update subtitle text:

```
"Review completed sessions and all attempted questions."
```

### 4.11 History Page Server Component

**File:** `app/(app)/app/history/page.tsx`

Update `createHistoryPage` deps type:

```typescript
export function createHistoryPage(deps?: {
  getSessionHistoryFn?: typeof getSessionHistory;
  getAttemptedQuestionsFn?: typeof getAttemptedQuestions;
}) {
```

Update search params to include new filter params:

```typescript
type HistorySearchParams = {
  tab?: string;
  limit?: string;
  offset?: string;
  difficulty?: string;
  tag?: string;
  result?: string;    // ← NEW
  source?: string;    // ← NEW
};
```

Handle `?tab=missed` backward compat:

```typescript
const rawTab = params.tab;
const activeTab = parseHistoryTab(rawTab);

// If accessed via ?tab=missed, default result filter to 'incorrect'
const defaultResultFilter = rawTab === 'missed' ? 'incorrect' as const : null;

const questionsFilters: QuestionsFilters = {
  difficulty: parseDifficultyFilter(params.difficulty),
  tagSlug: parseTagSlugFilter(params.tag),
  result: parseResultFilter(params.result) ?? defaultResultFilter,
  source: parseSourceFilter(params.source),
};

if (activeTab === 'questions') {
  const result = await getAttemptedQuestionsFn({
    limit,
    offset,
    result: questionsFilters.result ?? undefined,
    source: questionsFilters.source ?? undefined,
  });
  return (
    <HistoryPageClient
      activeTab="questions"
      questionsResult={result}
      questionsFilters={questionsFilters}
    />
  );
}
```

### 4.12 Dashboard

**File:** `app/(app)/app/dashboard/page.tsx`

**Key change:** Replace the Dashboard's "Recent missed" section (driven by `getMissedQuestions`) with a "Recent activity" section driven by `getUserStats({})` → `stats.recentActivity`.

**Data fetching:**

```typescript
const [statsResult, sessionHistoryResult] = await Promise.all([
  getUserStats({}),
  getSessionHistory({ limit: 3, offset: 0 }),
]);
```

**Props type:**

```typescript
type DashboardViewProps = {
  stats: UserStatsOutput;
  sessionHistoryResult: ActionResult<GetSessionHistoryOutput>;
};
```

**Section rename:** `"Recent missed"` → `"Recent activity"`

**"View all" link:** `historyMissedHref` → `${ROUTES.APP_HISTORY}?tab=questions`

**Per-row changes:**

Render `stats.recentActivity.slice(0, 8)`:

1. Add result badge: small correct/incorrect indicator
2. Date label should be "Answered {date}" (not "Missed {date}")
3. Available rows link to `toQuestionRoute(slug, { from: 'dashboard' })`

**Empty state:** When `stats.recentActivity.length === 0`, show `"No questions attempted yet."`

### 4.13 URL Redirect Update

**File:** `next.config.ts`

Update existing redirect:

```typescript
{
  source: '/app/review',
  destination: '/app/history?tab=questions&result=incorrect',
  permanent: true,
},
```

---

## 5. Cleanup Phase (After Migration)

After all consumers have migrated to the new types:

### Delete

| File/Item | Reason |
|-----------|--------|
| `src/application/use-cases/get-missed-questions.ts` | Replaced by `get-attempted-questions.ts` |
| `src/application/use-cases/get-missed-questions.test.ts` | Replaced by `get-attempted-questions.test.ts` |
| `app/(app)/app/history/components/history-missed-tab.tsx` | Renamed to `history-questions-tab.tsx` |
| `app/(app)/app/history/components/history-missed-tab.test.tsx` | Renamed to `history-questions-tab.test.tsx` |
| `getMissedQuestions` from `review-controller.ts` | Replaced by `getAttemptedQuestions` |
| `GetMissedQuestionsUseCase` from `use-cases/index.ts` | Replaced by barrel export |
| `createGetMissedQuestionsUseCase` from container factories | Replaced |
| `MissedFilters` type from `history-search-params.ts` | Replaced by `QuestionsFilters` |
| `buildHistoryMissedHref` from `history-search-params.ts` | Replaced by `buildHistoryQuestionsHref` |

### Keep (Still Used)

| Item | Reason |
|------|--------|
| `MissedQuestionAttempt` type | Part of `AttemptRepository` interface; `AttemptedQuestionSummary` extends it conceptually but is a separate type |
| `AttemptMissedQuestionsReader` interface | Can be removed if no consumer remains; check all references before deleting |
| `listMissedQuestionsByUserId` / `countMissedQuestionsByUserId` on Drizzle + Fake repos | Remove if `AttemptMissedQuestionsReader` is deleted |

---

## 6. Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/application/use-cases/get-attempted-questions.ts` | Use case: all attempted questions |
| `src/application/use-cases/get-attempted-questions.test.ts` | Use case tests |
| `app/(app)/app/history/components/history-questions-tab.tsx` | Questions tab component (evolves from `history-missed-tab.tsx`) |
| `app/(app)/app/history/components/history-questions-tab.test.tsx` | Questions tab unit tests |

### Modified Files

| File | Change |
|------|--------|
| `src/application/ports/attempt-repository.ts` | Add `AttemptedQuestionSummary` type, `AttemptAllQuestionsReader` interface, extend `AttemptRepository` |
| `src/adapters/repositories/drizzle-attempt-repository.ts` | Add `listAttemptedQuestionsByUserId`, `countAttemptedQuestionsByUserId` |
| `src/application/test-helpers/fakes/fake-repositories.ts` | Add fake implementations of new methods |
| `src/application/use-cases/index.ts` | Add `GetAttemptedQuestionsUseCase` exports |
| `src/adapters/controllers/review-controller.ts` | Add `getAttemptedQuestions` action + deps |
| `lib/container/types.ts` | Add `createGetAttemptedQuestionsUseCase` to `UseCaseFactories` |
| `lib/container/use-cases.ts` | Add factory |
| `lib/container/controllers.ts` | Wire new use case into `createReviewControllerDeps` |
| `app/(app)/app/history/history-search-params.ts` | New `HistoryTab`, `QuestionsFilters`, parsers, href builder |
| `app/(app)/app/history/history-search-params.test.ts` | New parser + builder tests |
| `app/(app)/app/history/history-page-client.tsx` | Update discriminated union, import new tab |
| `app/(app)/app/history/page.tsx` | Switch to `getAttemptedQuestions`, handle `?tab=missed` alias |
| `app/(app)/app/history/page.test.tsx` | Update for new tab name and data source |
| `app/(app)/app/history/components/history-tab-bar.tsx` | Rename tab label |
| `app/(app)/app/history/components/history-tab-bar.test.tsx` | Update assertions |
| `app/(app)/app/dashboard/page.tsx` | Rename section, switch data source, add badges |
| `app/(app)/app/dashboard/page.test.tsx` | Update for "Recent activity" |
| `next.config.ts` | Update redirect destination |

### Deleted Files (Cleanup Phase)

| File | Phase |
|------|-------|
| `src/application/use-cases/get-missed-questions.ts` | Cleanup |
| `src/application/use-cases/get-missed-questions.test.ts` | Cleanup |
| `app/(app)/app/history/components/history-missed-tab.tsx` | Cleanup |
| `app/(app)/app/history/components/history-missed-tab.test.tsx` | Cleanup |

---

## 7. Test Plan

### 7.1 Unit Tests (Vitest)

#### Get Attempted Questions Use Case

**File:** `src/application/use-cases/get-attempted-questions.test.ts`

```
- returns empty rows when user has no attempts
- returns all attempted questions (correct AND incorrect) joined to published questions
- includes isCorrect=true for correct and isCorrect=false for incorrect attempts
- returns only the most recent attempt per question when multiple attempts exist
- logs warning and returns unavailable row when attempted question references missing question
- includes session context (sessionId, sessionMode) on attempted question rows
- returns empty page rows while preserving totalCount when offset is beyond available rows
- propagates repository failures
- includes tag slugs for available attempted questions
- supports result filter (correct/incorrect)
- supports source filter (tutor/exam/adhoc)
```

#### History Search Params

**File:** `app/(app)/app/history/history-search-params.test.ts`

Add tests:

```
parseHistoryTab:
  - returns 'questions' for 'questions' value
  - returns 'questions' for 'missed' value (backward compat alias)
  - returns 'sessions' for undefined/invalid values (unchanged)

parseResultFilter:
  - returns null for undefined/invalid values
  - returns 'correct' for 'correct' value
  - returns 'incorrect' for 'incorrect' value

parseSourceFilter:
  - returns null for undefined/invalid values
  - returns 'tutor' for 'tutor' value
  - returns 'exam' for 'exam' value
  - returns 'adhoc' for 'adhoc' value
  - returns 'adhoc' for 'quick' value (legacy alias)

buildHistoryQuestionsHref:
  - builds questions tab href with pagination only
  - builds questions tab href with result filter
  - builds questions tab href with source filter
  - builds questions tab href with all filters
```

#### History Tab Bar

**File:** `app/(app)/app/history/components/history-tab-bar.test.tsx`

Update existing tests:

```
- renders Sessions and Questions links (was "Missed Questions")
- Sessions link href: /app/history?tab=sessions
- Questions link href: /app/history?tab=questions (was ?tab=missed)
- marks the active tab with aria-current="page" for sessions
- marks the active tab with aria-current="page" for questions (was missed)
```

#### History Questions Tab

**File:** `app/(app)/app/history/components/history-questions-tab.test.tsx`

```
// @vitest-environment jsdom
- renders attempted question cards with stem preview, result badge, difficulty, date, source
- renders "Review" button for correct questions
- renders "Reattempt" button for incorrect questions
- renders result filter dropdown with All / Correct / Incorrect options
- renders source filter dropdown with All / Tutor / Exam / Ad-hoc practice options
- renders difficulty and tag filter dropdowns (existing)
- renders empty state "No questions attempted yet." when no attempts
- renders pagination links when totalCount > limit
- renders unavailable question placeholder when isAvailable=false with result badge
- renders correct result badge with green styling
- renders incorrect result badge with red/destructive styling
```

#### History Page Server Component

**File:** `app/(app)/app/history/page.test.tsx`

Update existing tests:

```
- renders Sessions tab as active by default (unchanged)
- renders Questions tab as active when tab=questions (was tab=missed → Missed Questions)
- renders Questions tab as active when tab=missed (backward compat alias)
- passes attempted questions data to client component when tab=questions
- passes result=incorrect default filter when tab=missed (backward compat)
- renders error state when attempted questions fetch returns not-ok
```

#### Dashboard Page

**File:** `app/(app)/app/dashboard/page.test.tsx`

Update existing tests:

```
- renders "Recent activity" section heading (was "Recent missed")
- renders correct/incorrect badge on recent activity rows
- renders "View all" link pointing to /app/history?tab=questions (was ?tab=missed)
- renders correct questions with "Review" indication (NEW — verify correct questions appear)
- renders empty state "No questions attempted yet." (was "No missed questions yet.")
```

### 7.2 Integration Tests

**File:** `tests/integration/repositories.integration.test.ts`

Add tests for new methods:

```
listAttemptedQuestionsByUserId:
  - returns all attempted questions (correct and incorrect)
  - returns only the most recent attempt per question
  - includes isCorrect field
  - respects limit and offset
  - includes session mode from practice_sessions join
  - supports result filter (correct/incorrect)
  - supports source filter (tutor/exam/adhoc)

countAttemptedQuestionsByUserId:
  - counts unique questions with at least one attempt
  - counts both correct and incorrect questions
  - supports result filter (correct/incorrect)
  - supports source filter (tutor/exam/adhoc)
```

### 7.3 E2E Tests (Playwright)

**File:** `tests/e2e/history.spec.ts`

Add new test:

```
- Quick Practice answered question appears in Questions tab with correct/incorrect badge and source "Ad-hoc practice"
```

Update existing test name and assertions:

```
- shows attempted questions and allows filtering by result (evolves from "shows missed questions...")
- navigating to ?tab=missed shows questions filtered to incorrect only
```

**File:** `tests/e2e/audit-history-spec.spec.ts` (if exists, update)

Verify:

```
- Questions tab shows result filter and source filter dropdowns
- Filtering by result=correct shows only correct questions
- Filtering by source=adhoc shows only ad-hoc attempted questions (Quick Practice + other non-session attempts)
```

---

## 8. Implementation Order

```
Phase 1: Backend (Repository + Use Case)
  1. Add AttemptedQuestionSummary type + AttemptAllQuestionsReader interface to attempt-repository.ts
  2. Extend AttemptRepository to include AttemptAllQuestionsReader
  3. Implement listAttemptedQuestionsByUserId + countAttemptedQuestionsByUserId in DrizzleAttemptRepository
  4. Add fake implementations to FakeAttemptRepository
  5. Write get-attempted-questions.test.ts (RED)
  6. Create GetAttemptedQuestionsUseCase (GREEN)
  7. Update use-cases/index.ts barrel exports
  8. Add getAttemptedQuestions to review-controller.ts
  9. Update ReviewControllerDeps type
  10. Wire container: types.ts, use-cases.ts, controllers.ts

Phase 2: Frontend — History Page
  11. Update history-search-params.ts (HistoryTab type, new parsers, new href builder)
  12. Write history-search-params.test.ts updates (RED → GREEN)
  13. Update history-tab-bar.tsx ("Missed Questions" → "Questions", ?tab=questions)
  14. Update history-tab-bar.test.tsx
  15. Write history-questions-tab.test.tsx (RED)
  16. Create history-questions-tab.tsx (GREEN, evolve from history-missed-tab.tsx)
  17. Update history-page-client.tsx (new discriminated union, import new tab)
  18. Update history/page.tsx (use getAttemptedQuestions, handle ?tab=missed alias)
  19. Update history/page.test.tsx

Phase 3: Frontend — Dashboard
  20. Update dashboard/page.tsx (rename section, switch data source, add badges)
  21. Update dashboard/page.test.tsx

Phase 4: URL Migration + Cleanup
  22. Update next.config.ts redirect (/app/review → /app/history?tab=questions&result=incorrect)
  23. Delete history-missed-tab.tsx + test
  24. Delete get-missed-questions.ts + test
  25. Remove getMissedQuestions from review-controller.ts
  26. Remove createGetMissedQuestionsUseCase from container
  27. Remove MissedFilters + buildHistoryMissedHref from history-search-params.ts
  28. Remove AttemptMissedQuestionsReader + old methods from repos (if no consumers remain)

Phase 5: Verification
  29. Run: pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build
  30. Run: pnpm test:e2e (after deploying to preview)
```

---

## 9. Acceptance Criteria

- [ ] History page "Questions" tab shows ALL attempted questions (correct + incorrect)
- [ ] Each question row shows a correct/incorrect result badge
- [ ] Result filter dropdown (All / Correct / Incorrect) filters the question list
- [ ] Source filter dropdown (All / Tutor / Exam / Ad-hoc practice) filters the question list
- [ ] Difficulty and tag filters still work (unchanged behavior)
- [ ] Correctly-answered Quick Practice questions appear in the Questions tab under source "Ad-hoc practice"
- [ ] "Reattempt" button shown for incorrect questions, "Review" button for correct questions
- [ ] `?tab=missed` URL shows Questions tab with result=incorrect filter pre-applied
- [ ] `/app/review` redirects to `/app/history?tab=questions&result=incorrect`
- [ ] Tab bar shows "Sessions" and "Questions" (not "Missed Questions")
- [ ] Dashboard shows "Recent activity" (not "Recent missed")
- [ ] Dashboard "Recent activity" shows correct + incorrect questions with result badges
- [ ] Dashboard "View all" link points to `/app/history?tab=questions`
- [ ] Empty state shows "No questions attempted yet."
- [ ] All existing E2E tests pass (with updates for renamed tab/section)
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build` all pass

---

## 10. Non-Goals (Explicitly Out of Scope)

- **Server-side filtering for Difficulty/Tag** — Keep v1 behavior page-local (client-side filtering on the paginated set), matching the existing History missed-tab UX from SPEC-021.
- **Tag options from full dataset** — Tag dropdown shows tags from the current page's rows only. Known v1 limitation documented in SPEC-021 CodeRabbit review.
- **Per-question attempt history** — Only the most recent attempt per question is shown. Full attempt history (all attempts per question) is a future feature.
- **Question bank progress tracking** — "Unanswered" filter / question coverage tracking is a separate future feature.
- **Shared `QuestionListCard` component** — The Questions tab and Bookmarks page are similar but not identical enough to justify extraction in this pass.
- **Session replay / drill-down from source label** — Making session source labels clickable links to the session breakdown is deferred.

---

## 11. Known Limitations (v1)

| Limitation | Description | Mitigation |
|------------|-------------|------------|
| Difficulty/tag filters are page-local | A page of 20 results filtered to a specific tag/difficulty may show fewer than 20 rows, and tag options come from the current page only | Acceptable v1 trade-off; add server-side filtering + global tag list later if needed. |
| "Ad-hoc practice" is a bucket | `practiceSessionId = null` includes Quick Practice **and** question-detail reattempts (and any future non-session flows) | Add an explicit attempt-origin field only if/when we need to distinguish sources. |
| No "All Questions" count in tab label | Tab says "Questions" not "Questions (45)" | Count would require an extra query on every page load. Deferred. |

---

## 12. Related

- **SPEC-021** (History Page Restructure) — This spec builds directly on SPEC-021's History page infrastructure. All SPEC-021 work must be merged before this begins.
- **SPEC-014** (Review + Bookmarks) — The original Review page spec. SPEC-021 superseded the Review page. This spec evolves the remaining "Missed Questions" concept.
- **SPEC-015** (Dashboard) — Dashboard "Recent missed" section evolves into "Recent activity."
- **Brainstorming:** `quick-practice-history-gap.md` — The gap analysis and options evaluation that led to this spec.
