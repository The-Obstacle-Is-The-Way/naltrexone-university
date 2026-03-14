# BUG-220: Two Tests Still Assert Existence Instead of Behavior

**Status:** Open
**Priority:** P4 (downgraded from P3 after verification)
**Date:** 2026-03-13

## Summary

The original report was directionally right but too broad. A wider grep finds many `toBeTruthy()` / `toBeDefined()` assertions, but most are guard assertions followed by stronger behavior checks. The verified issue is narrower: two tests still use an existence check as their only assertion on the behavior they claim to protect.

## Impact

- These tests can pass while the underlying behavior regresses.
- The gap is in regression coverage quality, not production runtime behavior.
- This is test debt and should be tracked as such.

## Verification Notes

1. **The proxy skip-Clerk test is genuinely weak.** `proxy.test.ts:51-64` claims to verify `NextResponse.next()` under `NEXT_PUBLIC_SKIP_CLERK=true`, but the only assertion is `expect(res).toBeDefined()`. The implementation under test at `proxy.ts:119-120` specifically returns `NextResponse.next()`, so the current test would still pass for many incorrect but truthy responses.
2. **The bookmark ordering test is genuinely weak.** `src/adapters/repositories/drizzle-bookmark-repository.test.ts:130-150` claims `listByUserId` returns bookmarks ordered by `createdAt`, but its only ordering assertion is `expect(queryArgs?.orderBy).toBeDefined()`. The implementation under test at `src/adapters/repositories/drizzle-bookmark-repository.ts:52-56` specifically uses `orderBy: desc(bookmarks.createdAt)`, so the test does not currently prove either the column or the direction.
3. **Previously flagged `practice-session-starter` assertions are guards, not the real bug.** `app/(app)/app/practice/components/practice-session-starter.test.tsx:359-404` and `app/(app)/app/practice/components/practice-session-starter.test.tsx:444-462` use `toBeTruthy()` / `toBeDefined()` before additional token/content assertions on the same DOM nodes.
4. **Previously flagged `start-practice-session` assertion is also a guard.** `src/application/use-cases/start-practice-session.test.ts:200-240` uses `expect(createInput).toBeTruthy()` before detailed assertions on `paramsJson.questionIds`, `paramsJson.count`, and `paramsJson.questionStates`.

## Precise TDD Fix

1. Strengthen `proxy.test.ts:51-64` so it asserts the actual `NextResponse.next()` behavior returned by `proxy.ts:119-120`, not just that some response object exists.
2. Strengthen `src/adapters/repositories/drizzle-bookmark-repository.test.ts:130-150` so it proves the `orderBy` clause targets `bookmarks.createdAt` in descending order, using the same SQL/AST inspection style already used in other repository tests.
3. Keep guard-style truthiness checks only when they are followed by stronger behavioral assertions; the two verified cases should no longer rely on existence-only assertions.
