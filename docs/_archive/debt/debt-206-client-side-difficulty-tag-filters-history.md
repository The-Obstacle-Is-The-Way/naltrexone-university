# DEBT-206: Client-Side Difficulty/Tag Filters Cause Inaccurate Pagination on History Questions Tab

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-11
**Resolved:** 2026-02-14
**GitHub Issue:** #87

---

## Description

The History > Questions tab previously applied **Difficulty** and **Tag** filters client-side (filtering only the current page of results in the browser), while **Result** and **Source** filters were applied server-side (SQL WHERE clauses). This mismatch meant pagination counts (e.g., "Showing 1–20 of 50") reflected server-side totals, not the filtered subset.

When a user filters by "Hard" difficulty, they might see 3 rows on the page but the pagination says "1–20 of 50." This is a known v1 trade-off documented in SPEC-022 §2.

**Previous partial mitigation:** The UI appended `(X visible after filters)` when client-side filters reduced the visible row count. This helped but didn't fix the core problem: questions matching the filter on other pages were invisible.

### Root Cause

The `AttemptedQuestionsFilters` type in the application ports layer previously only supported `result` and `source` fields. The repository query (`latestAttemptRowsSubquery`) operates on the `attempts` table, which has no direct access to question metadata (difficulty, tags). Adding these filters required joining to the `questions` table at the database level.

### Clean Architecture Analysis

The prior design violated the principle of **keeping presentation logic honest**. The UI displayed pagination controls that implied server-level accuracy, but the numbers lied when client-side filters were active. Uncle Bob would say: either the pagination counts must reflect reality, or the UI must make the approximation explicit.

## Impact

- **User confusion**: Pagination says "Showing 1–20 of 50" but only 3 rows are visible after client-side filtering
- **Missing results**: A "Hard" question on page 2 won't appear if it's not in the current page's 20 results
- **Inconsistency**: Result/Source filters paginate accurately; Difficulty/Tag do not

## Resolution

### Step 1: Extend the Port Interface

Add `difficulty` and `tagSlug` to `AttemptedQuestionsFilters`:

```typescript
// src/application/ports/attempt-repository.ts
export type AttemptedQuestionsFilters = {
  result?: AttemptedQuestionsResultFilter | null;
  source?: AttemptedQuestionsSourceFilter | null;
  difficulty?: QuestionDifficulty | null;        // NEW
  tagSlug?: string | null;                        // NEW
};
```

### Step 2: Update the Repository Implementation

In `DrizzleAttemptRepository.listAttemptedQuestionsByUserId()` and `countAttemptedQuestionsByUserId()`, join the `latestAttemptRows` subquery to `questions` (and tag tables when filtering by tag), and extend `buildAttemptedQuestionsConditions()` to add WHERE clauses for difficulty and tag:

```sql
LEFT JOIN questions ON latest_attempt_rows.question_id = questions.id
LEFT JOIN question_tags ON questions.id = question_tags.question_id
LEFT JOIN tags ON question_tags.tag_id = tags.id
WHERE ...
  AND questions.difficulty = :difficulty
  AND tags.slug = :tagSlug
```

### Step 3: Thread Through the Use Case and Controller

- `GetAttemptedQuestionsInput`: Add optional `difficulty` and `tagSlug` fields
- `GetAttemptedQuestionsInputSchema` (`src/adapters/controllers/review-controller.ts`): Add Zod validators
- `page.tsx` (`app/(app)/app/history/page.tsx`): Pass difficulty/tagSlug from search params to the server action

### Step 4: Remove Client-Side Filtering

Remove the `displayRows` / `hasActiveDifficultyOrTagFilters` logic from `history-questions-tab.tsx`. All filtering is now server-side.

### Step 5: Tag Options

The tag filter dropdown options are populated server-side via the tags controller and passed into `HistoryQuestionsTab` as `{ slug, name }[]`. The dropdown displays the human-readable tag name while still submitting the tag slug via the `tag` query param, so users can filter by tags that are not present on the current page of results.

## Verification

1. `src/application/use-cases/get-attempted-questions.test.ts` covers `difficulty` + `tagSlug` filters
2. `tests/integration/repositories.integration.test.ts` covers attempted-question `difficulty`/`tagSlug` filtering + accurate counts
3. `app/(app)/app/history/components/history-questions-tab.test.tsx` verifies client-side mismatch hints are gone and tag options render display names
4. `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build`
5. Manual: apply Difficulty/Tag filters → pagination totals reflect filtered counts, and filters persist across page navigation

## Related

- SPEC-022 §2 (Decision table, "Filter application" row) — `docs/_archive/specs/spec-022-question-log.md`
- `docs/_archive/brainstorming/bs-007-quick-practice-history-gap.md` line 125–126
- CodeRabbit PR #86 review (Major items)
- `app/(app)/app/history/components/history-questions-tab.tsx`
- `src/adapters/repositories/drizzle-attempt-repository.ts` (`buildAttemptedQuestionsConditions`)
- `src/application/ports/attempt-repository.ts` (`AttemptedQuestionsFilters`)

## Resolution Notes (2026-02-14)

- Difficulty and tag filters are applied server-side via `AttemptedQuestionsFilters` and the Drizzle attempted-questions query (joins `questions` + tag tables when needed).
- History page threads `difficulty` + `tagSlug` to the server action; the client tab no longer applies client-side filtering or renders the pagination mismatch hints.
- Tag dropdown options are populated from the tags controller (all tags), not derived from the current page of rows.
