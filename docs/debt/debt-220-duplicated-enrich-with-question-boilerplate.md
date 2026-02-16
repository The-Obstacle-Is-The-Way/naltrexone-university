# DEBT-220: Duplicated enrichWithQuestion Boilerplate Across 4 Use Cases

**Priority:** P3
**Status:** Open
**Found:** 2026-02-16
**Component:** Backend — Application Layer Use Cases

---

## Summary

Four use cases follow the identical pattern: fetch question IDs from a result set, call `findPublishedByIds()`, build a `Map<id, question>`, and enrich rows with question metadata. Three use the shared `enrichWithQuestion()` utility; one (get-bookmarks) reimplements the same logic inline.

## Affected Files

| Use Case | File | Uses `enrichWithQuestion`? |
|----------|------|---------------------------|
| Get Bookmarks | `src/application/use-cases/get-bookmarks.ts:32-65` | No (inline) |
| Get Attempted Questions | `src/application/use-cases/get-attempted-questions.ts:91-121` | Yes |
| Get User Stats | `src/application/use-cases/get-user-stats.ts:103-144` | Yes |
| Get Practice Session Review | `src/application/use-cases/get-practice-session-review.ts:116-142` | Yes |

## Duplicated Pattern

```typescript
// Repeated in all 4 use cases:
const questionIds = [...new Set(rows.map(r => r.questionId))];
const questions = await this.questions.findPublishedByIds(questionIds);
const byId = new Map(questions.map(q => [q.id, q]));
// Then: enrichWithQuestion({ rows, questionsById: byId, ... })
// Or:   manual for-loop with byId.get(...)
```

## Suggested Fix

1. Migrate `get-bookmarks.ts` to use `enrichWithQuestion()` like the other 3
2. Extract the fetch+map boilerplate into a helper:

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

- [ ] All 4 use cases share the same fetch+enrich pattern
- [ ] No inline reimplementation of the enrichment logic
- [ ] Existing tests continue to pass

---

## Related

- `src/application/shared/enrich-with-question.ts` — shared enrichment utility
