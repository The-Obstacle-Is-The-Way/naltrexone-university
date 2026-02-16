# DEBT-220: Duplicated enrichWithQuestion Boilerplate Across 4 Use Cases

**Priority:** P3
**Status:** Open
**Found:** 2026-02-16
**Component:** Backend — Application Layer Use Cases

---

## Summary

Four use cases repeat the same steps:

1. Derive question IDs (dedup strategy varies)
2. Call `QuestionRepository.findPublishedByIds()`
3. Build a `Map<questionId, Question>`
4. Map each row into an available/unavailable output row, logging when the question is missing

Three use the shared `enrichWithQuestion()` utility for the row-mapping step; one (`get-bookmarks`) reimplements the mapping loop inline.

## Affected Files

| Use Case | File | Uses `enrichWithQuestion`? |
|----------|------|---------------------------|
| Get Bookmarks | `src/application/use-cases/get-bookmarks.ts:32-65` | No (inline) |
| Get Attempted Questions | `src/application/use-cases/get-attempted-questions.ts:91-121` | Yes |
| Get User Stats | `src/application/use-cases/get-user-stats.ts:103-145` | Yes |
| Get Practice Session Review | `src/application/use-cases/get-practice-session-review.ts:116-142` | Yes |

## Duplicated Pattern

```typescript
// Repeated shape across all 4 use cases (dedup differs by caller):
const questionIds = /* derived from rows/session */;
const questions = await this.questions.findPublishedByIds(questionIds);
const byId = new Map(questions.map(q => [q.id, q]));
// Then: enrichWithQuestion({ rows, questionsById: byId, ... })
// Or:   manual for-loop with byId.get(...)
```

Dedup strategy varies per callsite:

| Use Case | Strategy | Defensive? |
|----------|----------|-----------|
| Get Bookmarks | `[...new Set(bookmarks.map(...))]` | Yes |
| Get Attempted Questions | `page.map(...)` (no dedup) | No — assumes unique input |
| Get User Stats | Manual `Set` + `Array.push()` loop | Yes |
| Get Practice Session Review | `session.questionIds` directly | No — assumes unique |

The proposed `fetchQuestionsById()` helper normalizes this by always deduplicating internally.

## Suggested Fix

1. Migrate `get-bookmarks.ts` to use `enrichWithQuestion()` like the other 3 (so the “missing question” warning + available/unavailable mapping logic is centralized).
2. Extract the fetch+map boilerplate into a shared helper (e.g. `src/application/shared/*`) so each use case stops re-creating the same `new Map(questions.map(...))` pattern.

```typescript
async function fetchQuestionsById(
  repo: QuestionRepository,
  ids: string[],
): Promise<Map<string, Question>> {
  const unique = [...new Set(ids)];
  const questions = await repo.findPublishedByIds(unique);
  return new Map(questions.map(q => [q.id, q]));
}
```

## Acceptance Criteria

- [ ] All 4 use cases share the same fetch → map → enrich shape
- [ ] `GetBookmarksUseCase` uses `enrichWithQuestion()` (no custom inline loop)
- [ ] Warning messages remain stable (no behavior change)
- [ ] Existing unit tests continue to pass (`get-bookmarks`, `get-attempted-questions`, `get-user-stats`, `get-practice-session-review`)

---

## Related

- `src/application/shared/enrich-with-question.ts` — shared enrichment utility
