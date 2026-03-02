# BUG-184: Attempted Questions Count/Page Divergence Can Drop Real Rows

**Status:** Open
**Priority:** P2
**Date:** 2026-03-02

---

## Description

`GetAttemptedQuestionsUseCase` fetches `count` and `page` concurrently, then returns an empty result when `totalCount === 0 || page.length === 0`. If snapshots diverge under concurrent writes, it can drop non-empty page data.

Observed behavior:
- A response can return `rows: []` even when the page query produced rows.

Expected behavior:
- Non-empty page data should not be discarded because count is stale.

---

## Steps to Reproduce

1. Execute attempted-questions query while user activity changes attempts around the same time.
2. `count` observes 0 while `list` observes 1+ rows.
3. Use case short-circuits to empty output.

Executable verification performed on 2026-03-02:
1. Repro harness injected repository responses: `count=0`, `list=[one row]`.
2. Use case returned `{ totalCount: 0, rowsLength: 0 }`, proving row drop path.

---

## Root Cause

Tracer-bullet path:
1. Use case runs count/list in parallel at [get-attempted-questions.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-attempted-questions.ts:76).
2. Short-circuit condition at [get-attempted-questions.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/application/use-cases/get-attempted-questions.ts:86) returns empty rows when `totalCount === 0`, regardless of `page`.
3. Repository count/list are separate SQL statements at [drizzle-attempt-repository.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:381) and [drizzle-attempt-repository.ts](/Users/ray/Desktop/github/naltrexone-university-1/src/adapters/repositories/drizzle-attempt-repository.ts:437), so snapshot divergence is possible.

---

## Fix

Not fixed yet.

Proposed fix direction:
1. Change short-circuit to only return empty when `page.length === 0`.
2. Keep `totalCount` as reported (or recompute in a single-query/window-function strategy).
3. Add regression test covering `count=0` with non-empty page.

---

## Verification

How was the fix verified?

- [ ] Unit test added
- [ ] Integration test added
- [x] Manual verification

