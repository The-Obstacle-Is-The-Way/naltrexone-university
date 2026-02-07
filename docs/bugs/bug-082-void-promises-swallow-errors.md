# BUG-082: Void Promises Silently Swallow Errors in Practice Page

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-06
**Resolved:** 2026-02-07

---

## Description

The practice page uses `void` to suppress unhandled promise rejection warnings on async operations. While the called functions currently have internal try-catch handlers, the `void` pattern is fragile — if anyone removes the internal error handling during refactoring, errors become invisible to the user.

**Observed:** No active bug currently. This is a latent defect — the error safety relies on implementation details of the called functions rather than being enforced at the call site.

**Expected:** Async operations should have error handling enforced at the call site, not just internally.

## Affected Files

1. `app/(app)/app/practice/page.tsx:49` — `void sessionControls.onAbandonIncompleteSession()`
2. `app/(app)/app/practice/page.tsx:76` — `void sessionControls.onStartSession()`
3. `app/(app)/app/practice/page.tsx:88` — `void sessionControls.onOpenSessionHistory(sessionId)`
4. `app/(app)/app/practice/page.tsx:104-109` — `void questionFlow.onToggleBookmark()` and `void questionFlow.onSubmit()`

## Root Cause

The `void` operator suppresses TypeScript's "floating promise" lint rule, but also suppresses all error handling:

```typescript
onAbandon={() => {
  void sessionControls.onAbandonIncompleteSession();
}}
```

All current `void` calls wrap functions with internal try-catch. But the error safety is implicit, not enforced by the compiler.

## Fix

Implemented `fireAndForget` helper:

- `app/(app)/app/practice/fire-and-forget.ts`

Replaced raw `void` calls in `app/(app)/app/practice/page.tsx` with explicit `fireAndForget(...)` calls for:

- `onAbandonIncompleteSession`
- `onStartSession`
- `onOpenSessionHistory`
- `onToggleBookmark`
- `onSubmit`

## Verification

- [x] Call sites now attach explicit rejection handlers via `fireAndForget`
- [x] Unit coverage added in `app/(app)/app/practice/fire-and-forget.test.ts`
- [x] Existing UI tests and full unit suite pass after wiring change

## Related

- `app/(app)/app/practice/practice-page-logic.ts` — Async action helpers with try-catch
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` — Session page helpers
- `app/(app)/app/practice/fire-and-forget.ts`
