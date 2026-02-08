# DEBT-183: Bare `console.error` in Client Hooks (Not Observable)

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

Several client-side hooks use bare `console.error()` for error reporting:

1. `app/(app)/app/practice/hooks/use-practice-session-tags.ts` (line 29): `console.error('[PracticeSessionControls] Tag load failed:', ...)`
2. `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-navigator.ts` (line 56): `console.error('Failed to load question navigator', error)`
3. `app/(app)/app/practice/practice-page-logic.ts` (line 163): `console.error('Failed to toggle bookmark', error)`
4. `app/(app)/app/practice/fire-and-forget.ts` (line 2): `console.error('Unhandled async UI action error', error)`

These represent recoverable errors that either silently log to the console (invisible to users and unobservable in production) or should surface via the notification system.

Note: `console.error` in `error.tsx` files is acceptable — those are last-resort error boundaries.

## Impact

- Production errors are invisible without browser devtools open.
- No observability tooling captures these client-side failures.
- Users don't know something went wrong (e.g., tag load failure, bookmark toggle failure).

## Resolution

For each file, choose the appropriate pattern:

1. **`use-practice-session-tags.ts`:** Removed bare `console.error`; hook now relies on explicit `tagLoadStatus: 'error'` state.

2. **`use-practice-session-navigator.ts`:** Removed bare `console.error`; navigator failures now set structured error state only.

3. **`practice-page-logic.ts`:** Added explicit bookmark-error callback path (`onBookmarkError`) so thrown/non-ok failures surface to UI state.

4. **`use-practice-question-bookmarks.ts` + `practice-view.tsx`:** Wired bookmark error messaging into user-facing notifications with `tone: 'error'`.

5. **`fire-and-forget.ts`:** Retained `console.error` intentionally as global client safety net for unhandled async action errors.

## Verification

- [x] `use-practice-session-navigator.ts` no longer has bare `console.error`
- [x] `practice-page-logic.ts` bookmark failure surfaces via callback and user-facing message
- [x] `fire-and-forget.ts` `console.error` retained (intentional safety net)
- [x] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `app/(app)/app/practice/hooks/use-practice-session-tags.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-navigator.ts`
- `app/(app)/app/practice/practice-page-logic.ts`
- `app/(app)/app/practice/fire-and-forget.ts`
- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts` (reference — does this correctly)
- Frontend tracker: FE-043
