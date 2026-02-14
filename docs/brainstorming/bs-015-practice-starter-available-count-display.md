# BS-015: Practice Starter — Show Available Question Count Before Session Start

**Date:** 2026-02-13
**Triggered by:** UX review of practice session starter — no visibility into how many questions match current filters
**Scope:** Users select filters and a question count but have no way to know if 5 or 500 questions match before starting
**Related:** [BS-014](./bs-014-practice-starter-question-count-ux.md), GitHub #53
**Originally:** DEBT-209 (moved to brainstorming — the problem is real but the UX approach needs more design thinking, especially around whether to just display the count or actively constrain the question count input)

---

## Open Questions

1. **Display only, or constrain?** Showing "42 questions available" is informational, but users can still type "100" and get a silently truncated session. Should the input max be dynamically capped to the available count? Should the Start button show "Start (42 questions)" to set expectations?
2. **Per-tag counts vs total count?** Showing "Pharmacology (15)" next to each tag chip is useful but adds complexity (one COUNT per tag per filter change). Is the total count sufficient for MVP?
3. **Debounce strategy?** Filters change frequently as users click chips. How aggressively should we debounce the count query? What does the loading state look like?
4. **How do professional question banks handle this?** UWorld, Amboss, Kaplan — research needed.
5. **Should BS-014 and BS-015 be combined into a single spec?** They're two facets of the same UX gap.

---

## The Problem

The practice session starter has multi-select tag filtering (FilterChip components with collapsible categories), but it doesn't show how many questions match the current filter combination. Users select **status + difficulty + tags** (and a desired question count) but have no way to know if 5 or 500 questions match before starting the session.

### What's Implemented (Done)

- Multi-select tag UI with `FilterChip` components
- Tags grouped by kind in collapsible `<details>` sections
- Selected count display per category: "(3 selected)"
- Status filter segmented control (via `AllQuestionProgressStatuses`)
- Difficulty filter segmented control (All/Easy/Medium/Hard)
- Session mode segmented control (Tutor/Exam) + question count input
- Deduplicated tags

### What's Missing

- **Question count for current filters**: e.g., "42 questions available" shown near the Start button
- **Per-tag question counts**: e.g., "Pharmacology (15)" next to each tag chip (optional, lower priority)

### Clean Architecture Analysis

Uncle Bob's **Single Responsibility** principle says the practice session starter's job is to collect user preferences and initiate a session. Displaying available counts is a **read-model concern** — it should be a separate query (or lightweight use case) that returns a count based on the current filter state.

The count should NOT be computed by loading all questions and counting client-side. It should be a dedicated `COUNT(*)` query in the repository layer, called from a use case, and returned to the UI via the controller.

## Impact

- **UX friction**: Users can't gauge session size before starting — they might get 3 questions when expecting 50
- **Related to BS-014**: When `actual < requested`, users get no warning. A pre-start count would prevent this surprise entirely

## Resolution

### Step 1: Add a Count Query to the Port

```typescript
// src/application/ports/question-repository.ts
export interface QuestionRepository {
  // ...
  countPublishedCandidateIds(filters: QuestionFilters): Promise<number>;
}
```

### Step 2: Create a Lightweight Use Case

```typescript
// src/application/use-cases/count-available-questions.ts
export class CountAvailableQuestionsUseCase {
  constructor(private readonly questions: QuestionRepository) {}

  async execute(input: {
    userId: string;
    tagSlugs: string[];
    difficulties: QuestionDifficulty[];
    statuses: QuestionProgressStatus[];
  }): Promise<{ count: number }> {
    return {
      count: await this.questions.countPublishedCandidateIds({
        userId: input.userId,
        tagSlugs: input.tagSlugs,
        difficulties: input.difficulties,
        statuses: input.statuses,
      }),
    };
  }
}
```

### Step 3: Add a Server Action

Wire the use case through the practice controller as a `countAvailableQuestions` action.

### Step 4: Call from the UI

The practice session starter calls this action whenever filters change (debounced) and displays:

```
42 questions available     [Start Session]
```

If count is 0: disable the Start button and show "No questions match your filters."

### Alternative: Lightweight Approach

If a full use case feels overweight for a single count, the practice controller can inline the count query directly. This is pragmatic for a pure read-model concern with no business logic.

## Verification

1. New unit test: `CountAvailableQuestionsUseCase` returns correct count for various filter combos
2. New browser-mode test (`*.browser.spec.tsx`): practice session starter displays count and disables Start when 0
3. Manual: toggle difficulty/tag filters → count updates → start session matches expected count

## Related

- `app/(app)/app/practice/components/practice-session-starter.tsx` (current UI)
- `src/application/use-cases/start-practice-session.ts` (filter logic for question selection)
- `src/application/ports/question-repository.ts` (existing `QuestionFilters` shape to reuse)
- `src/adapters/repositories/drizzle-question-repository.ts` (candidate filter SQL already exists; mirror for COUNT)
- [BS-014](./bs-014-practice-starter-question-count-ux.md) (Silent truncation warning — complementary feature). Implementing BS-015 first is the recommended order: showing available counts pre-start prevents the surprise that BS-014 mitigates post-start.
- Issue #82 (UX warning when fewer questions available)
