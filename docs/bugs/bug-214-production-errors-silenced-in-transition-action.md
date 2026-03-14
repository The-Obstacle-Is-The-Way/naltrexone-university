# BUG-214: `runTransitionedAsyncAction` Dev-Only Error Logging

**Status:** Open
**Priority:** P4 (downgraded from P2 after verification)
**Date:** 2026-03-13

## Summary

`runTransitionedAsyncAction()` catches errors escaping `input.run()` and only logs them when `NODE_ENV === 'development'`. For current callers, ordinary operational failures are already handled deeper in the flow, so the real production gap is limited to unexpected errors that bypass those inner helpers.

## Verification Notes

Tracer-bullet verification confirmed the low-risk framing:

1. **The production catch is real.** `app/(app)/app/practice/shared/question-flow-actions.ts:135-151` resolves the transition promise even when `input.run()` throws, and the only built-in reporting is the development-only `console.error(...)` at lines 141-145.
2. **Both practice submit hooks delegate to helpers that already catch ordinary failures.** `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts:138-155` and `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts:181-206` both pass `submitAnswerForQuestion(...)`, which ultimately routes through `runSubmitAnswerFlow(...)`.
3. **`runSubmitAnswerFlow(...)` already handles thrown and structured operational failures.** `app/(app)/app/practice/shared/question-flow-actions.ts:196-226` catches `withTimeout(...)` / server-action errors, maps them to `{ status: 'error', message: ... }`, and also handles the `!res.ok` path without rethrowing.
4. **The question-page caller also handles its own normal failures.** `app/(app)/app/questions/[slug]/question-page-logic.ts:281-286` passes `submitSelectedAnswer(...)`, and `app/(app)/app/questions/[slug]/question-page-logic.ts:238-259` catches thrown failures plus the `!res.ok` path before returning.
5. **The outer catch is therefore a last-resort safety net.** In normal runtime it should only fire for programming errors or truly unexpected runtime failures that escape the inner helpers.
6. **The current test suite already documents that intent.** `app/(app)/app/practice/shared/question-flow-actions.test.ts:66-88` explicitly asserts the development-only `console.error(...)` behavior when `run()` throws.

Downgraded from P2 to P4: the missing production reporting is real, but this is defense-in-depth around an edge case rather than a user-facing functional bug. The proper telemetry rollout is already tracked by DEBT-286.

## Precise TDD Fix

1. Add a failing unit test in `app/(app)/app/practice/shared/question-flow-actions.test.ts` proving that the helper still resolves its promise while also reporting an escaped `run()` error in production mode.
2. Extend `runTransitionedAsyncAction(...)` with an optional `onUnhandledError?: (error: unknown) => void` hook, or call the shared DEBT-286 client reporter directly.
3. Invoke that hook in the catch block for all environments, while keeping the existing development `console.error(...)` for local debugging.
4. Thread the shared client reporter from the three current call sites only if centralizing it in the helper is not sufficient.
