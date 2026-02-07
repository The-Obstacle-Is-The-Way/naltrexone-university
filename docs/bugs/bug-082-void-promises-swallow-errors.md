# BUG-082: Void Promises Silently Swallow Errors in Practice Page

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

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

Option A — Add `.catch()` at call sites for safety:
```typescript
onAbandon={() => {
  sessionControls.onAbandonIncompleteSession().catch(() => {
    // Error already handled internally
  });
}}
```

Option B — Create a `fireAndForget` utility that logs unhandled rejections:
```typescript
function fireAndForget(promise: Promise<unknown>): void {
  promise.catch((error) => console.error('Unhandled async error:', error));
}
```

## Verification

- [ ] All async UI actions show error feedback when they fail
- [ ] No silent promise rejections in production
- [ ] Network failure during session abandon shows error message

## Related

- `app/(app)/app/practice/practice-page-logic.ts` — Async action helpers with try-catch
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` — Session page helpers
