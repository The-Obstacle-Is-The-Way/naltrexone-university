# DEBT-206: Client-Side Difficulty/Tag Filters Cause Inaccurate Pagination on History Questions Tab

**Status:** Open
**Priority:** P2
**Date:** 2026-02-11
**GitHub Issue:** #87

---

## Description

The History > Questions tab applies **Difficulty** and **Tag** filters client-side (filtering the current page of results in the browser), while **Result** and **Source** filters are applied server-side (SQL WHERE clauses). This mismatch means pagination counts (e.g., "Showing 1–20 of 50") reflect server-side totals, not the filtered subset.

When a user filters by "Hard" difficulty, they might see 3 rows on the page but the pagination says "1–20 of 50." This is a known v1 trade-off documented in SPEC-022 §2.

**Existing partial mitigation:** The UI already appends `(X visible after filters)` when client-side filters reduce the visible row count (lines 294–298 of `history-questions-tab.tsx`). This helps but doesn't fix the core problem: questions matching the filter on other pages are invisible.

### Root Cause

The `AttemptedQuestionsFilters` type in the application ports layer only supports `result` and `source` fields. The repository query (`latestAttemptRowsSubquery`) operates on the `attempts` table, which has no direct access to question metadata (difficulty, tags). Adding these filters requires joining to the `questions` table at the database level.

### Clean Architecture Analysis

The current design violates the principle of **keeping presentation logic honest**. The UI displays pagination controls that imply server-level accuracy, but the numbers lie when client-side filters are active. Uncle Bob would say: either the pagination counts must reflect reality, or the UI must make the approximation explicit.

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

The tag filter dropdown currently builds its `<option>` list from tags present on the current page. With server-side filtering, the dropdown should show all available tags for attempted questions (or all tags in the system). This may require a separate lightweight query.

## Verification

1. All existing `history-questions-tab.test.tsx` tests pass (update assertions for server-side filtering)
2. New test: filtering by "Hard" difficulty shows accurate pagination counts
3. New test: filtering by tag shows only matching questions across all pages
4. `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration`
5. Manual: apply Difficulty filter → pagination count matches visible rows

## Related

- SPEC-022 §2 (Decision table, "Filter application" row) — `docs/_archive/specs/spec-022-question-log.md`
- `docs/_archive/brainstorming/bs-007-quick-practice-history-gap.md` line 125–126
- CodeRabbit PR #86 review (Major items)
- `app/(app)/app/history/components/history-questions-tab.tsx` (lines 103–116)
- `src/adapters/repositories/drizzle-attempt-repository.ts` (`buildAttemptedQuestionsConditions`)
- `src/application/ports/attempt-repository.ts` (`AttemptedQuestionsFilters`)
