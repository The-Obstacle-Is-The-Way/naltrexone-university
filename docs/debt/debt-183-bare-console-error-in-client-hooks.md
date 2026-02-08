# DEBT-183: Bare `console.error` in Client Hooks (Not Observable)

**Status:** Open
**Priority:** P3
**Date:** 2026-02-08

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

1. **`use-practice-session-tags.ts`:** Tags fail silently — the state already transitions to `tagLoadStatus: 'error'` which the UI can show. The `console.error` is redundant but harmless. Replace with no-op or keep as-is (lowest priority).

2. **`use-practice-session-navigator.ts`:** Already sets error state. The `console.error` is redundant. Remove it.

3. **`practice-page-logic.ts`:** Bookmark toggle failure. Should surface via the notification system (`notify({ message: 'Failed to save bookmark', tone: 'error' })`). Reference `practice-page-bookmarks.ts` which already does this correctly via a `logError` callback.

4. **`fire-and-forget.ts`:** This is a catch-all for fire-and-forget async operations. Keep `console.error` here as a safety net — this is the equivalent of a global unhandled rejection handler for UI actions.

## Verification

- [ ] `use-practice-session-navigator.ts` no longer has bare `console.error`
- [ ] `practice-page-logic.ts` bookmark failure surfaces via notification or callback
- [ ] `fire-and-forget.ts` `console.error` retained (intentional safety net)
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` passes

## Related

- `app/(app)/app/practice/hooks/use-practice-session-tags.ts`
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-navigator.ts`
- `app/(app)/app/practice/practice-page-logic.ts`
- `app/(app)/app/practice/fire-and-forget.ts`
- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts` (reference — does this correctly)
- Frontend tracker: FE-043
