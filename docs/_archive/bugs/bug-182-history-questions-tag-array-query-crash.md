# BUG-182: History Questions Crashes on Repeated `tag` Query Param

**Status:** Resolved
**Priority:** P2
**Date:** 2026-03-02
**Resolved:** 2026-03-02 (PR #163)

---

## Description

History questions parsing originally assumed scalar query params. With repeated params (for example `?tag=opioids&tag=alcohol`), Next.js can provide `string[]` at runtime. The original `tag` parser called `.trim()` on the raw value and crashed when given an array.

Observed pre-fix behavior:
- Request could fail with `TypeError: value?.trim is not a function`.

Expected behavior:
- Repeated query params should be normalized safely and never crash rendering.

---

## Steps to Reproduce

1. Open `/app/history?tab=questions&tag=opioids&tag=alcohol`.
2. Server page parses `params.tag` and calls `parseTagSlugFilter`.
3. Rendering crashes when `tag` arrives as an array.

Executable verification performed on 2026-03-02:
1. Repro harness invoked `parseTagSlugFilter(['opioids', 'alcohol'] as unknown as string)`.
2. Result threw `TypeError: value?.trim is not a function`.

---

## Root Cause

Tracer-bullet path:
1. History page reads search params and routes `tag` through parser calls at [page.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/page.tsx:77).
2. Before the fix, `parseTagSlugFilter` called `.trim()` without normalizing array input.
3. Runtime shape mismatch was masked by the local `HistorySearchParams` narrowing in [page.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/page.tsx:31), which typed fields as `string` only.
4. The same runtime `string[]` risk applied to numeric params (`limit`, `offset`) parsed at [page.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/page.tsx:71) and [page.tsx](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/page.tsx:72).

---

## Fix (TDD)

Fixed.

### Red — failing tests added first

Added array-input regression tests in [history-search-params.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.test.ts:108), [history-search-params.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.test.ts:112), [history-search-params.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.test.ts:48), and [history-search-params.test.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.test.ts:71):

- `parseTagSlugFilter` handles repeated `tag` arrays and empty arrays.
- `parseNonNegativeInt` and `parseLimit` now explicitly verify repeated/empty array handling for `offset`/`limit`.

These tests failed before the parser changes and now pass.

### Green — minimum code change

Implemented shared normalization in [history-search-params.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.ts:24) and applied it across all parsers.

Key changes:
- `normalizeSearchParam(value: string | string[] | undefined)` centralized at [history-search-params.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.ts:24).
- `parseTagSlugFilter` now normalizes first, then trims at [history-search-params.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.ts:67).
- `parseNonNegativeInt` and `parseLimit` now accept `string | string[] | undefined` and normalize before parsing at [history-search-params.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.ts:39) and [history-search-params.ts](/Users/ray/Desktop/github/naltrexone-university-1/app/(app)/app/history/history-search-params.ts:52).

### Refactor

No broad redesign. Refactor stayed local to parser normalization via one shared helper to avoid duplicate array guards.

---

## Verification

- [x] Unit regression tests added and passing.
- [x] Manual verification confirms repeated `tag`, `limit`, and `offset` inputs normalize safely.
- [x] Gate run: `pnpm typecheck && pnpm lint && pnpm test --run`.
