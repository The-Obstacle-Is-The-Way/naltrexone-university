# BUG-214: `runTransitionedAsyncAction` Silently Swallows Errors in Production

**Status:** Open
**Priority:** P2
**Date:** 2026-03-13

## Summary

In `question-flow-actions.ts:139-146`, `runTransitionedAsyncAction` catches errors from `input.run()` and only logs them in development mode (`process.env.NODE_ENV === 'development'`). In production, errors are silently swallowed -- no logging, no error reporting, no user notification beyond whatever the caller happens to set.

## Impact

- Any unhandled error in the `run()` callback (submit answer, next question, session navigation) is completely invisible in production.
- The comment says "The caller owns error state" but if the caller's error handling has its own bug, the safety net produces zero signal.
- Production debugging is severely hampered.

## Location

- `app/(app)/app/practice/shared/question-flow-actions.ts:139-146`

## Suggested Fix

Remove the `NODE_ENV` guard so errors are always logged:

```typescript
} catch (error) {
  console.error('runTransitionedAsyncAction: unhandled error in run()', error);
}
```

Or add integration with Sentry/error reporting for production visibility.

## Prevention

- Avoid `NODE_ENV` guards on error logging. Logging infrastructure should handle environment-appropriate output levels.
