# BUG-225: Question Review Page Drops Repeated Review-Context Query Params

**Status:** Open
**Priority:** P4
**Date:** 2026-03-15

## Summary

The question review page accepts `string | string[]` query params, but it handles arrays by discarding them instead of normalizing them. Repeated `sessionId`, `attemptId`, `historyHref`, `historySeq`, or `historyIndex` therefore silently strip review context before it reaches the controller.

## Impact

- Session review can fall back to standalone review with no session hydration.
- Attempt-specific review links can lose the attempt id and show the wrong fallback state.
- History-review back-navigation and sequence context can disappear even though the query state is present.

## Verification Notes

1. `app/(app)/app/questions/[slug]/page.tsx:21-28` correctly acknowledges that these params can arrive as `string | string[]`.
2. `app/(app)/app/questions/[slug]/page.tsx:33-60` then handles every field with `typeof value === 'string' ? value : undefined`, which drops arrays outright instead of normalizing them.
3. `app/(app)/app/questions/[slug]/page.tsx:61-62` only applies mixed-id normalization after the array-dropping step, so duplicated `sessionId` / `attemptId` never reach that logic.
4. `app/(app)/app/questions/[slug]/question-page-client.tsx:463-470` forwards the already-dropped values into `useQuestionPageController(...)`.
5. Once that happens, the controller never receives the session/attempt/history context it needs to hydrate the correct review state.
6. The repo already has a shared normalization precedent in `app/(app)/app/history/history-search-params.ts:24-80`; this page currently stops short of using the same approach.

## Precise TDD Fix

1. Add failing page tests in `app/(app)/app/questions/[slug]/page.test.tsx` for array-valued `sessionId`, `attemptId`, `historyHref`, `historySeq`, and `historyIndex`.
2. Normalize each query param to its first scalar value instead of dropping arrays.
3. Keep the existing mixed-review rule (`sessionId` wins over `attemptId`) after normalization.
4. Consider extracting a tiny shared `normalizeSearchParam(...)` helper to prevent further page-level drift.
