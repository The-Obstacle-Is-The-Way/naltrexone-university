# BUG-131: E2E Bookmarks Empty State Assertion Fails After Remove

**Status:** Open
**Priority:** P2
**Date:** 2026-02-10

---

## Description

`bookmarks.spec.ts` removes a bookmark and then asserts:
```typescript
await expect(page.getByText('No bookmarks yet.', { exact: true })).toBeVisible();
```

The "No bookmarks yet." text exists in the component source (`app/(app)/app/bookmarks/page.tsx`), but the assertion times out after removing the last bookmark.

## Affected Tests

- `bookmarks.spec.ts` (line 35)

## Root Cause (Probable)

Timing issue. After clicking "Remove", the page may need to:
1. Complete the server action
2. Revalidate/re-render the bookmark list
3. Show the empty state

The 5-second default assertion timeout may not be enough if the server action + revalidation takes time. Additionally, a confirmation dialog or toast may be overlaying the empty state text.

Alternatively, the test may have stale bookmark data from prior test runs (the test user accumulates bookmarks across E2E runs, and removal of one bookmark may not result in zero bookmarks).

## Fix

1. Increase timeout on the empty state assertion
2. Verify the test properly removes ALL bookmarks before asserting empty state
3. Check if confirmation dialog or toast obscures the text

## Verification

- [ ] `pnpm test:e2e -- bookmarks.spec.ts` passes

## Related

- `app/(app)/app/bookmarks/page.tsx:119-130` — empty state rendering
- `tests/e2e/bookmarks.spec.ts` — test source
