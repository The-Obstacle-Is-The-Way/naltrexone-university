# BUG-220: Weak Test Assertions Provide False Confidence

**Status:** Open
**Priority:** P3
**Date:** 2026-03-13

## Summary

Two tests use `toBeTruthy()` or `toBeDefined()` as their **sole** assertion on a value, providing weak coverage that could pass even when the implementation is incorrect.

## Verified Cases (True Positives)

### 1. `proxy.test.ts:63` -- `expect(res).toBeDefined()` only

The test "returns NextResponse.next() when NEXT_PUBLIC_SKIP_CLERK=true" only asserts that the response exists. The entire `it()` block (lines 51-64) has no other assertion -- it closes immediately after `expect(res).toBeDefined()`. Compare with other proxy tests that check `res.status` and `res.text()`. This test would pass even if the middleware returned an error response.

### 2. `drizzle-bookmark-repository.test.ts:149` -- `expect(queryArgs?.orderBy).toBeDefined()`

This is the **only** assertion on the ordering behavior for `findByUserId`. The test ends at line 150. It confirms an `orderBy` key exists but not what ordering is applied. The test would pass if the ordering were reversed, removed, or set to any arbitrary column.

## Invalidated Cases (False Positives)

### ~~3. `practice-session-starter.test.tsx` (lines 363, 381, 397)~~ -- Guards before real assertions

Tracer-bullet verification confirmed all three `toBeTruthy()` calls are **null-guards followed by stronger assertions** on the same elements (class token checks on lines 364-366, 382-391, 398). Not sole assertions.

### ~~4. `start-practice-session.test.ts:215`~~ -- Guard before detailed assertions

`toBeTruthy()` on line 215 is followed by detailed `paramsJson` property assertions on lines 217-240 (checking `questionIds` length, `count` value, `questionStates` shape via `toEqual`). Not a sole assertion.

## Impact

- The proxy test (case 1) and bookmark ordering test (case 2) assert existence rather than correctness, giving false confidence in those specific behaviors.

## Suggested Fix

- Case 1: Add `expect(res.status).toBe(200)` or verify the response is a `NextResponse.next()`.
- Case 2: Assert the specific column and direction of the ordering, not just that ordering exists.
