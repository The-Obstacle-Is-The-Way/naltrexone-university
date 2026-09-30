# BUG-312: E2E Helpers' Clerk Calls Do Not Retry a Transient Failure

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress
**Priority:** P3
**Date:** 2026-09-30
**Resolved:** —
**Verification receipts:** —

---

## Description

Before every E2E test, the user-state reset looks up the E2E user through Clerk's API (`resolveClerkUserIdByEmail` in `tests/e2e/helpers/e2e-reset-shared.ts`). The run's credential health check makes the same lookup, and checks the password, in `tests/e2e/helpers/credential-health-check.ts`.

Each of these was a single request. A dropped connection, a 429 or a 5xx failed the test at once with `CLERK_API_UNAVAILABLE`. The app's own Clerk calls retry exactly those failures with `DEFAULT_RETRY_OPTIONS` (three attempts, 100 ms doubling to at most 1 s) and `isTransientExternalError`.

Most spec files reset in `beforeEach`, so a run makes dozens of these lookups, and a brief network blip is likely to hit one of them.

Expected: the E2E helpers retry what the app retries.

## How it was found

Main CI run **36737453772**, after promotion #1254 (2026-09-30), failed three E2E tests in about 40 ms each, before any assertion:
- `cross-page-navigation.spec.ts:61`
- `review-mode-audit.spec.ts:67`
- `review-mode-audit.spec.ts:315`

Each reset failed with `Clerk API request failed while resolving E2E user. Cause: fetch failed` ← `read ECONNRESET`. The promotion was documentation only. One re-run passed, and the production alias waited on it for about half an hour.

## Impact

CI only. No user or data impact. A red required check on `main` holds the production alias (Vercel Deployment Checks), so a network blip delays a release until someone re-runs CI. P3.

## Fix

`fetchClerkWithRetry` in `credential-health-check.ts` wraps `fetchWithTimeout` in the app's `retry` with `DEFAULT_RETRY_OPTIONS`. It retries:
- a thrown error that `isTransientExternalError` recognizes, on the error or on its cause, because undici reports a dropped connection as `fetch failed` with the socket code on `cause`;
- a 429 or 5xx response.

Before each further attempt it cancels the superseded response's body, which could otherwise hold undici's connection (#1256 review). Once retries run out, it returns the last response, body unread, or throws the last error, so each caller maps failures exactly as before. The reset's user lookup, the health check's lookup and its password check all use it.

It does not retry a timeout (15 s per attempt) or any other error, and it does not retry an auth or validation answer.

## Verification

- **Red first, in `e2e-reset-shared.test.ts`.** The reset lookup retries a connection reset, a 503 and a 429, then resolves the user. It gives up after three attempts on a persistent reset or 503 and maps the failure as before. It does not retry a 401 or an error with no transient cause.
- **`credential-health-check-clerk-retry.test.ts`.** The helper retries a dropped connection and a 503 and keeps the request's method. It returns the last 429 and throws the last dropped connection once retries run out. It returns a 401 or 422 at once. It cancels each superseded body and leaves the last one readable; skipping the cancel fails that case.
- **Mutation checks.** Dropping the cause-code check fails the connection-reset cases. Dropping the transient-status throw fails the 429 and 503 cases.
