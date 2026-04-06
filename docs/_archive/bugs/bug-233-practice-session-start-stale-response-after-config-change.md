# BUG-233: Practice Session Start Can Commit a Stale Response After Config Changes

**Status:** Open
**Priority:** P3
**Date:** 2026-04-03
**Confirmed:** 2026-04-03
**Component:** Practice / Session Start / Client State

---

## Description

The practice-session starter shows a loading state on the start button, but it does not freeze the rest of the configuration surface while a session-start request is in flight. Users can still change mode, count, status, difficulty, and tags before the request settles.

Observed behavior:

- Changing controls during an in-flight start rotates local state and idempotency keys.
- The original request still resolves against the old configuration.
- `startSession(...)` has no request-sequencing guard, so the stale response still commits navigation or error state.

Expected behavior:

- Once a start request is in flight, either the configuration surface should be frozen or stale completions should be discarded.
- The app should never navigate into a session that no longer matches the currently visible configuration.

## Impact

- Users can unintentionally start a tutor/exam session with superseded filters or question count.
- Slow network conditions make the UI feel inconsistent: the visible controls say one thing while the eventual session reflects older input.
- This belongs to the same stale-async-commit family already fixed in other hooks.

## Steps to Reproduce

1. Open `/app/practice`.
2. Start a session on a slow or artificially delayed network.
3. While the button shows `Starting…`, change one or more controls, such as mode, status, tags, or question count.
4. Let the original request finish.
5. Observe the app navigate into a session created from the old settings, not the current visible configuration.

## Root Cause

Tracer-bullet path:

1. [`app/(app)/app/practice/components/practice-session-starter.tsx`](../../app/(app)/app/practice/components/practice-session-starter.tsx) only disables the start button while `sessionStartStatus === 'loading'`; the rest of the controls remain interactive.
2. The control handlers in [`app/(app)/app/practice/practice-page-session-start.ts`](../../app/(app)/app/practice/practice-page-session-start.ts) keep mutating filters and rotating the local idempotency key during that loading window.
3. [`app/(app)/app/practice/hooks/use-practice-session-start.ts`](../../app/(app)/app/practice/hooks/use-practice-session-start.ts) captures the current filters/mode/count in the `onStartSession` closure and delegates to `startSession(...)`.
4. [`app/(app)/app/practice/practice-page-session-start.ts`](../../app/(app)/app/practice/practice-page-session-start.ts) checks only `isMounted()` after the await; it has no request token, no stale-config guard, and no comparison against the latest idempotency key.
5. A stale success therefore still calls `navigateTo(...)`, and a stale failure still commits error UI, even after the user has moved the UI to a newer configuration.

## Recommended Fix

- Add a request-sequencing guard to the session-start flow so only the latest in-flight attempt can commit navigation or error state.
- As defense in depth, disable or freeze the rest of the starter controls while session start is loading.
- Add browser regression coverage for "start, change controls before response settles, stale response ignored."

## Verification

- [x] Code-level tracer-bullet verified on 2026-04-03.
- [x] Existing hook/browser tests cover idempotency-key rotation and thrown-error logging, but not stale-response suppression after config changes.
- [ ] Add regression coverage for stale success and stale error after control changes during loading.
- [ ] Manual browser verification under throttled network conditions.

## Related

- [`app/(app)/app/practice/components/practice-session-starter.tsx`](../../app/(app)/app/practice/components/practice-session-starter.tsx)
- [`app/(app)/app/practice/practice-page-session-start.ts`](../../app/(app)/app/practice/practice-page-session-start.ts)
- [`app/(app)/app/practice/hooks/use-practice-session-start.ts`](../../app/(app)/app/practice/hooks/use-practice-session-start.ts)
- [`app/(app)/app/practice/hooks/use-practice-session-start.browser.spec.tsx`](../../app/(app)/app/practice/hooks/use-practice-session-start.browser.spec.tsx)
- [`docs/_archive/bugs/bug-190-history-session-reopen-race-applies-stale-result.md`](../_archive/bugs/bug-190-history-session-reopen-race-applies-stale-result.md)
- [`docs/_archive/bugs/bug-230-post-exam-review-retry-race.md`](../_archive/bugs/bug-230-post-exam-review-retry-race.md)
