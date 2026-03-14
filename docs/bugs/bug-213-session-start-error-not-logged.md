# BUG-213: Session Start Thrown Errors Are Not Reported Client-Side

**Status:** Open
**Priority:** P3 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

`startSession()` catches thrown failures from `withTimeout(...)` / server-action invocation, surfaces a user-facing error, and rotates the idempotency key, but it never reports the caught error on the client. The common expected controller failures do not use this catch path at all; they come back as structured `ActionResult`s. The real observability gap is the thrown-error / timeout path.

## Impact

- Client-side timeouts and transport/invocation failures during session start are invisible to client telemetry.
- Expected server-side/controller failures are already surfaced via the `!res.ok` path, and unknown controller exceptions are already logged server-side before they are converted to `INTERNAL_ERROR`.
- This is a partial observability gap in a core user flow, not total loss of monitoring for every failure class.

## Verification Notes

Tracer-bullet verification narrowed the real issue:

1. **The local catch is real.** `app/(app)/app/practice/practice-page-session-start.ts:77-97` catches thrown failures, sets error UI state, rotates the idempotency key, and returns without any local logging/reporting call.
2. **The production hook wires this to the real server action.** `app/(app)/app/practice/hooks/use-practice-session-start.ts:122-136` passes `startPracticeSession` into `startSession(...)`.
3. **The common controller path does not throw.** `src/adapters/controllers/practice-controller.ts:110-156` defines `startPracticeSession` via `createAction(...)`, and `src/adapters/controllers/create-action.ts:31-49` converts parse/execute failures into `ActionResult`s instead of letting them escape to the client helper.
4. **Unknown server-side exceptions are already logged upstream.** `src/adapters/controllers/action-result.ts:32-61` logs unknown controller errors at line 59 before returning `INTERNAL_ERROR`. Expected `ApplicationError` / `ZodError` failures also come back as structured `!res.ok` results rather than entering the thrown-error catch.
5. **The thrown path is therefore narrower than the original bug implied.** The real lost cases are client-side `TimeoutError`s from `lib/with-timeout.ts:10-15` and transport/runtime failures that reject before a structured `ActionResult` is returned.
6. **There is no client-side reporting coverage today.** Existing tests at `app/(app)/app/practice/practice-page-logic.test.ts:1048-1165` verify UI behavior for both `!res.ok` and thrown failures, but nothing requires the helper to preserve or report the original cause.
7. **Server-side request telemetry exists, but it is not this boundary.** `instrumentation.ts:26` exports `onRequestError = Sentry.captureRequestError`, so uncaught request/server-action failures have a server-side capture path; that does not change the missing client reporting at the `startSession(...)` catch site.

## Precise TDD Fix

1. Add failing unit tests in `app/(app)/app/practice/practice-page-logic.test.ts` proving a thrown `TimeoutError` and a thrown generic `Error` both report the original error before the helper updates UI state.
2. Add an optional `reportError?: (error: unknown, context: { action: 'startSession' }) => void` callback to `startSession(...)`, or wire the shared DEBT-286 client reporter directly.
3. Call that reporter in the `catch` branch before `setSessionStartStatus('error')`.
4. Thread the reporter from `usePracticeSessionStart(...)` using the eventual shared `reportClientError()` / `Sentry.captureException(...)` path from DEBT-286.
