# BUG-220: Weak Test Assertions Provide False Confidence

**Status:** Open
**Priority:** P3
**Date:** 2026-03-13

## Summary

Several tests use `toBeTruthy()` or `toBeDefined()` as their sole assertion on a value, providing weak coverage that could pass even when the implementation is incorrect.

## Cases

### 1. `proxy.test.ts:63` -- `expect(res).toBeDefined()` only

The test "returns NextResponse.next() when NEXT_PUBLIC_SKIP_CLERK=true" only asserts that the response exists. It does not verify the response status, type, or any meaningful property. Compare with other proxy tests that check `res.status` and `res.text()`. This test would pass even if the middleware returned an error response.

### 2. `drizzle-bookmark-repository.test.ts:149` -- `expect(queryArgs?.orderBy).toBeDefined()`

This is the **only** assertion on the ordering behavior for `findByUserId`. It confirms an `orderBy` key exists but not what ordering is applied. The test would pass if the ordering were reversed, removed, or set to any arbitrary column.

### 3. `practice-session-starter.test.tsx` (lines 363, 381, 397, 448, 458) -- `toBeTruthy()` as null guard

Multiple tests use `expect(element).toBeTruthy()` on DOM elements from `querySelector`. While these accidentally work because `querySelector` returns `null` (falsy) on miss, `expect(element).not.toBeNull()` would be semantically precise.

### 4. `start-practice-session.test.ts:215` -- `toBeTruthy()` on createInput

Guard assertion before structural assertions. `expect(createInput).not.toBeUndefined()` would be more precise.

## Impact

- Weak assertions can pass when implementation is incorrect, giving false confidence.
- The proxy test (case 1) and bookmark ordering test (case 2) are the most concerning -- they assert existence rather than correctness.

## Suggested Fix

- Case 1: Add `expect(res.status).toBe(200)` or check the response type.
- Case 2: Assert the specific column and direction of the ordering.
- Cases 3-4: Replace `toBeTruthy()` with `not.toBeNull()` or `not.toBeUndefined()`.
