# BUG-184: Attempted Questions Count/Page Divergence Can Drop Real Rows

**Status:** Resolved
**Priority:** P2
**Date:** 2026-03-02
**Resolved:** 2026-03-02 (PR #163)

---

## Description

`GetAttemptedQuestionsUseCase` fetched `count` and `page` concurrently, then returned empty rows when `totalCount === 0 || page.length === 0`. In a divergent snapshot window, that condition could drop real page rows.

Observed pre-fix behavior:
- Response could return `rows: []` while the page query actually produced rows.

Expected behavior:
- Non-empty page rows should be preserved even if count is stale.

---

## Steps to Reproduce

1. Execute attempted-questions request while concurrent writes occur between count/list snapshots.
2. `count` sees 0 while `list` sees 1+ rows.
3. Use case short-circuits to empty output and drops page data.

Executable verification performed on 2026-03-02:
1. Regression harness forced `count=0` and `list=[one row]`.
2. Pre-fix result returned empty rows despite non-empty page.

---

## Root Cause

Tracer-bullet path:
1. Use case executes count/list in parallel at [get-attempted-questions.ts](../../../src/application/use-cases/get-attempted-questions.ts#L76).
2. Pre-fix early return checked `totalCount === 0 || page.length === 0`, so stale count could discard a non-empty page.
3. Repository list and count are separate queries at [drizzle-attempt-repository.ts](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L393) and [drizzle-attempt-repository.ts](../../../src/adapters/repositories/drizzle-attempt-repository.ts#L449), so divergence is possible under `READ COMMITTED`.

Practical likelihood note:
- Divergence requires a write committing between the two query snapshots; low probability, but real and correctness-impacting.

---

## Fix (TDD)

Fixed.

### Red — failing test added first

Added regression in [get-attempted-questions.test.ts](../../../src/application/use-cases/get-attempted-questions.test.ts#L316):

- `it('preserves page rows even when count returns 0 (snapshot divergence)', ...)`

The test failed before the short-circuit fix.

### Green — minimum code change

Simplified short-circuit condition in [get-attempted-questions.ts](../../../src/application/use-cases/get-attempted-questions.ts#L86):

- From: `if (totalCount === 0 || page.length === 0)`
- To: `if (page.length === 0)`

This preserves non-empty rows while still returning `totalCount` as observed.

### Refactor

No production refactor needed. Regression test was strengthened to assert preserved row identity/content at [get-attempted-questions.test.ts](../../../src/application/use-cases/get-attempted-questions.test.ts#L341).

---

## Verification

- [x] Divergence regression test added and passing.
- [x] Row-identity assertion confirms expected row survives (`questionId: 'q1'`).
- [x] Gate run: `pnpm typecheck && pnpm lint && pnpm test --run`.
