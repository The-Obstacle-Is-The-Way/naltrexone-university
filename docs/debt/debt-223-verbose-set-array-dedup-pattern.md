# DEBT-223: Verbose Set+Array Dedup Pattern in get-user-stats.ts

**Priority:** P4
**Status:** Open
**Found:** 2026-02-16
**Component:** Backend — Application Layer

---

## Summary

`get-user-stats.ts` uses a verbose 5-line dedup pattern (manual Set + Array push loop) where a one-liner would suffice. While functionally correct, it's less idiomatic TypeScript.

## Affected File

- `src/application/use-cases/get-user-stats.ts:103-109`

```typescript
const uniqueQuestionIds: string[] = [];
const seen = new Set<string>();
for (const attempt of recentAttempts) {
  if (seen.has(attempt.questionId)) continue;
  seen.add(attempt.questionId);
  uniqueQuestionIds.push(attempt.questionId);
}
```

## Suggested Fix

```typescript
const uniqueQuestionIds = [...new Set(recentAttempts.map(a => a.questionId))];
```

Both preserve insertion order. The one-liner is more idiomatic and easier to read.

## Acceptance Criteria

- [ ] Dedup uses idiomatic `[...new Set(...)]` pattern
- [ ] Existing tests continue to pass

---

## Related

- `src/application/use-cases/get-bookmarks.ts:32` — already uses `[...new Set(...)]` pattern correctly
