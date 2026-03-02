# BUG-182: History Questions Crashes on Repeated `tag` Query Param

**Status:** Open
**Priority:** P2
**Date:** 2026-03-02

---

## Description

History Questions parsing assumes `tag` is a string. Repeated query params (`?tag=a&tag=b`) can arrive as `string[]`, which causes a runtime `TypeError` when `.trim()` is called.

Observed behavior:
- Request can fail with `value?.trim is not a function`.

Expected behavior:
- Repeated query params should not crash rendering. Parser should normalize to one value (or reject safely).

---

## Steps to Reproduce

1. Open `/app/history?tab=questions&tag=opioids&tag=alcohol`.
2. Server page parses `params.tag` and calls `parseTagSlugFilter`.
3. Rendering crashes when `tag` is an array.

Executable verification performed on 2026-03-02:
1. Repro harness invoked `parseTagSlugFilter(['opioids', 'alcohol'] as unknown as string)`.
2. Result threw `TypeError: value?.trim is not a function`.

---

## Root Cause

Tracer-bullet path:
1. History page reads `params.tag` at [page.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/page.tsx:77).
2. It passes directly to `parseTagSlugFilter(...)`.
3. Parser calls `value?.trim()` at [history-search-params.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.ts:56).
4. When `value` is `string[]`, `.trim` is undefined on arrays — throws `TypeError`.

TypeScript does not catch this because `HistorySearchParams` (page.tsx:31-40) types `tag` as `string`, but Next.js App Router's actual `searchParams` type is `{ [key: string]: string | string[] | undefined }`. The page's type narrows away the `string[]` case, hiding the runtime risk.

---

## Fix (TDD)

Not fixed yet.

### Red — write the failing test first

In `history-search-params.test.ts` (create if needed, colocated):

```typescript
it('returns first value when given an array (repeated query param)', () => {
  // Arrange: simulate repeated ?tag=a&tag=b
  const arrayValue = ['opioids', 'alcohol'] as unknown as string;
  // Act + Assert: should not throw, should return first value
  expect(parseTagSlugFilter(arrayValue)).toBe('opioids');
});
```

This test must FAIL (TypeError) before the fix.

### Green — minimum code to pass

In `parseTagSlugFilter`, normalize the input before trimming:

```typescript
export function parseTagSlugFilter(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}
```

### Refactor

Apply the same `Array.isArray` normalization to all parse functions in `history-search-params.ts` that receive search param values (`parseDifficultyFilter`, `parseResultFilter`, `parseSourceFilter`, `parseSessionModeFilter`, `parseQuestionsSort`) — they all have the same latent risk. Consider extracting a shared `normalizeParam(value)` helper.

---

## Verification

- [ ] Unit test added (Red phase test above)
- [ ] Manual verification post-fix

