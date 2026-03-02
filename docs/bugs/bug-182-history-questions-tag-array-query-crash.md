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
4. When `value` is `string[]`, `.trim` is undefined and throws.

---

## Fix

Not fixed yet.

Proposed fix direction:
1. Widen search-param type to `string | string[] | undefined`.
2. Normalize arrays before parsing (for example, first value wins).
3. Add regression tests for repeated `tag` query params.

---

## Verification

How was the fix verified?

- [ ] Unit test added
- [ ] Integration test added
- [x] Manual verification

