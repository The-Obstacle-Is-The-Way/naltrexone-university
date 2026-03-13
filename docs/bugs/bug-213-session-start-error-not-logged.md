# BUG-213: Session Start Error Not Logged Client-Side

**Status:** Open
**Priority:** P3 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

In `practice-page-session-start.ts:91`, when `startPracticeSessionFn` throws, the error is surfaced to the UI but not logged on the client side.

## Verification Notes

Tracer-bullet verification revealed this is **partially mitigated**:

- `startPracticeSessionFn` is a Next.js server action. When a server action throws, the server-side `instrumentation.ts` exports `onRequestError = Sentry.captureRequestError`, which captures the error into Sentry server-side.
- The **server side** already has the error logged for server-originated failures.
- The gap is only for **client-only errors** (e.g., `withTimeout` firing a `TimeoutError` before the server responds). These are caught, shown to the user as a message, but never reported to any monitoring system.
- This stems from the same root cause as DEBT-286: zero `Sentry.captureException()` calls exist in client-side application code.

Downgraded from P2 to P3: the most common failure mode (server error) is already captured server-side. Only client-side timeouts are truly lost.

## Location

- `app/(app)/app/practice/practice-page-session-start.ts:91-97`

## Suggested Fix

Add `console.error('Session start failed:', error)` before setting error state, or better yet, add `Sentry.captureException(error)` as part of the DEBT-286 client-side error reporting work.
