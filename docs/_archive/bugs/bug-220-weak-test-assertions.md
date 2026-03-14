# BUG-220: Two Tests Still Assert Existence Instead of Behavior

**Status:** Resolved
**Priority:** P4 (downgraded from P3 after verification)
**Date:** 2026-03-13
**Resolved:** 2026-03-14 (PR #215)

## Summary

Two tests used existence-only assertions (`toBeDefined()`, `toBeTruthy()`) as their sole check on the behavior they claimed to protect: the proxy skip-Clerk response and the bookmark repository ordering clause.

## Resolution

Strengthened `proxy.test.ts` to assert the actual `NextResponse.next()` status and headers instead of just `toBeDefined()`. Strengthened `drizzle-bookmark-repository.test.ts` to inspect the SQL AST and verify the `orderBy` clause targets `bookmarks.created_at desc`, with an explicit `toBeDefined()` guard before serialization for clearer failures.
