# BUG-213: Session Start Error Not Logged Server-Side

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

In `practice-page-session-start.ts:91`, when `startPracticeSessionFn` throws, the error is surfaced to the UI via `setSessionStartError(getThrownErrorMessage(error))` but there is no logging call. Server Action failures during session start produce no observability signal.

## Impact

- If session creation fails in production (DB issue, race condition, etc.), the error is only visible to the individual user who sees the generic message.
- No server-side log means no alerting, no metrics, and no ability to detect patterns of failures.

## Location

- `app/(app)/app/practice/practice-page-session-start.ts:91-97`

## Suggested Fix

Add a `console.error` or logging callback before setting the error state:

```typescript
} catch (error) {
  if (!isMounted()) return;
  console.error('Session start failed:', error);
  input.setSessionStartStatus('error');
  input.setSessionStartError(getThrownErrorMessage(error));
  input.setIdempotencyKey(input.createIdempotencyKey());
  return;
}
```

## Prevention

- All catch blocks in user-facing flows should log the error, even if they also set UI error state.
