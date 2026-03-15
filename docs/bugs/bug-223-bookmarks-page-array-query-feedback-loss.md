# BUG-223: Bookmarks Page Drops Repeated `error` / `toast` Query Params

**Status:** Open
**Priority:** P4
**Date:** 2026-03-15

## Summary

The bookmarks page still types `searchParams` as scalar strings and forwards them into parsers that only accept `string | undefined`. When Next.js provides arrays for repeated `error` or `toast` params, the page silently drops the remove-bookmark error banner and success toast.

## Impact

- A failed remove-bookmark redirect can land with no visible error feedback.
- A successful remove can land with no "Bookmark removed." toast.
- This makes the action feel flaky even when the redirect/query state is present.

## Verification Notes

1. `app/(app)/app/bookmarks/bookmarks-actions.ts:20-35` is the source of the page-level feedback contract: it redirects with `?error=...` or `?toast=bookmark_removed`.
2. `app/(app)/app/bookmarks/page.tsx:237-244` types `searchParams` as `Promise<Record<string, string | undefined>>` and forwards `searchParams?.error` / `searchParams?.toast` directly.
3. `app/(app)/app/bookmarks/bookmarks-errors.ts:16-20` only accepts `string | undefined`; a runtime array becomes a non-matching value and returns `undefined`.
4. `app/(app)/app/bookmarks/bookmarks-toast.tsx:8-20` likewise only accepts scalar `code: string | undefined`, so array-valued `toast` is ignored and no notification is shown.
5. This is the same runtime shape family already fixed in `app/(app)/app/billing/page.tsx:109-166` and `app/(app)/app/history/history-search-params.ts:24-80`.

## Precise TDD Fix

1. Add failing tests in `app/(app)/app/bookmarks/page.test.tsx` for array-valued `error` and `toast`.
2. Add a browser/spec regression in `app/(app)/app/bookmarks/bookmarks-toast.*` covering `code={['bookmark_removed'] as unknown as string}` or an equivalent page-boundary normalization test.
3. Widen the page-level `searchParams` typing to `string | string[]` and normalize once before calling `parseRemoveBookmarkErrorCode(...)` or rendering `BookmarksToast`.
4. Reuse the same first-value normalization policy already used by Billing and History.
