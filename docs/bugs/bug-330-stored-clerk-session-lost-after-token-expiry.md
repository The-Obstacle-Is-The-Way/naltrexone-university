# BUG-330: Signed-In E2E Fails En Masse When the Stored Clerk Session Cannot Be Restored After Its Token Expires

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — built test-first in its pull request; still to show: a CI run that leaves no active E2E session, then two weeks of CI runs without a recurrence
**Priority:** P3
**Date:** 2026-10-07
**Resolved:** —
**Verification receipts:** —

---

## Summary

Global setup signs in once and stores the Clerk session, and every signed-in test restores it in a fresh browser context. Once the stored 60-second session token has expired, restoring the session needs Clerk's Frontend API (FAPI). In one CI run, the restored browser reported no session: `window.Clerk.session` was null once `clerk.loaded()` resolved. From then on every signed-in test failed, while the session stayed active on Clerk's side.

Our side has three defects that turn one failed restore into a red run nobody can diagnose:
- **No testing token in test contexts.** Test contexts never install Clerk's testing token.
- **No evidence.** A failed restore leaves nothing to diagnose it with.
- **Teardown fails open.** It skips the sign-out when no session is visible, and leaks the session.

## Evidence

- **The incident.** Promotion #1422's CI run 37664358412, attempt 1, on 2026-10-07: 30 signed-in tests failed, all in `requireStoredClerkE2ESession` (`tests/e2e/helpers/clerk-auth.ts`), with `window.Clerk.session` null after `clerk.loaded()`. 33 signed-out or earlier tests passed. Attempt 2 passed. The cause was recorded on #1422.
- **The split is the token lifetime.**
  - Global setup created the session at 18:18:13.565Z.
  - Session tokens last 60 seconds, and `@clerk/backend` 3.18.1 allows 5 seconds of clock skew, so the stored token was accepted until about 18:19:18Z.
  - Test 13 started at 18:19:15Z and passed. Test 14 started at 18:19:21Z and failed, and so did every later signed-in test.
  - Attempt 2 ran in the same order and timing, and its test 14 refreshed and passed 70 seconds after sign-in.
- **Clerk's side was intact.** Read-only Backend API reads just after showed:
  - the session still active, expiring 2026-10-14;
  - its client last updated at sign-in, still listing it active;
  - no other session for the E2E user in the window.
  No other CI run was active, the other agent sessions on this machine did nothing with the account, and Clerk's status page showed no incident.
- **Not the usual failures.** Backend API 429s and handshake errors log `[WebServer]` lines, as in run 37613122068, and this run has none. A FAPI 429 on `/v1/client` hangs `clerk.loaded()` until the 30-second timeout, but these failures took about one second. Every failure snapshot shows the normal home page, signed out.
- **Our defects.**
  - `clerk.loaded()` does not install the testing-token route; only `clerk.signIn()` does. `clerkSetup()` runs in the setup project's worker, so `CLERK_TESTING_TOKEN` never reaches test workers.
  - Playwright ignores the server's stdout by default, so Clerk's own log line for a silently signed-out client (an open upstream issue) is invisible. No FAPI status or Clerk trace ID is captured.
  - Teardown's `releaseClerkE2ESession` found no session and skipped the sign-out. That run's session stayed live until 2026-10-14, though its token was never published.
- **A related loss, 2026-10-08.** In #1428's first CI attempt, one signed-in test lost its session partway through. `cross-page-navigation.spec.ts:26` had signed in with the password, confirmed the subscription and submitted an answer; then `/app/dashboard` redirected to Clerk's hosted sign-in, as Playwright's failure snapshot showed (recorded on #1428). The other 62 tests passed. The run had no `[WebServer]` Clerk error, no other run overlapped it, and the re-run passed. Whether it shares this record's cause is not proven: here one test lost its session mid-test, while the incident failed every test that restored the stored session.
- **Frequency.** Up to the incident, it had happened once in the 1,209 CI runs since the stored-session design landed (`2f6b6223`, 2026-08-25). The related loss above is the only one seen since. [BUG-306](../_archive/bugs/bug-306-required-e2e-clerk-session-loss-and-accumulation.md), an intermittent session loss whose cause was never proven, led to that design.
- **What is not proven.** The two explanations the evidence leaves are:
  - FAPI rejected or rotated the stored development-browser token;
  - FAPI had failed for this client from the start, with tests passing on the unexpired token alone.
  There is no FAPI telemetry to decide between them.

## Impact

A red run holds a promotion's production alias until it is diagnosed and re-run. Without diagnostics, the next occurrence is as opaque as this one.

## Options

1. **Re-run when it happens.** Rejected: an unexplained failure becomes routine.
2. **Sign in per test.** Rejected: it brings back BUG-306's session pile-up, and spends the Clerk budget DEBT-503 and [DEBT-508](../debt/debt-508-concurrent-e2e-runs-share-clerk-budget-and-stripe-customer.md) protect.
3. **Make a failed restore diagnosable and deterministic** (decided, first).
   - Record FAPI status codes, Clerk error codes, trace IDs and `Clerk.status` on a failed restore, never tokens.
   - Pipe the web server's output through the existing log redaction.
   - Fail the remaining signed-in tests at once after the first failed restore, with one clear error.
   - Have teardown revoke the stored session through the Backend API by its session ID, instead of signing out through FAPI.
   - Give preflight's Clerk calls one deadline that ends inside setup's 60-second budget, so a Clerk outage fails with the credential error rather than Playwright's setup timeout. Today each call can spend three 15-second attempts and up to about 10 seconds of waits, about 110 seconds for preflight's two.
4. **Carry the testing token into every test context** (decided, second). Run `clerkSetup()` in Playwright's `globalSetup`, so workers inherit the token, and install the testing-token route in each signed-in context through a fixture. This matches Clerk's testing design.
5. **A live "keeper" context that refreshes the session** and re-exports its state before each signed-in test. Revisit only if a failure recurs with options 3 and 4 in place.

## Resolution

**Decided:** options 3 and then 4, test-first, in one PR after [DEBT-503](../debt/debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 1, which has daily impact.

## Progress

**2026-10-09: built in one pull request, test-first** (options 3 and 4).

- **Teardown revokes the session.** `revokeClerkE2ESession` ends the stored session through the Backend API by its ID, which setup stores beside the state. Only an active session can be revoked; on any refusal it reads the session, and one that had already ended needs nothing. It replaces the browser sign-out that skipped a session it could not see.
- **A failed restore fails fast.**
  - The first failed restore records one error naming what the Frontend API answered, then `Clerk.status`: method, path, status, and for a refusal Clerk's error codes and trace ID.
  - It never names a query string, header or message, so no token.
  - A wait for Clerk that times out is recorded too, with its error.
  - The error lives in `test-results/.auth/`, not in module state, because Playwright starts a new worker after a failed test. Every later signed-in test fails with it without loading a page. Setup and teardown clear it.
- **The testing token reaches every test.**
  - `clerkSetup()` moved to Playwright's `globalSetup`, which runs in the main process, so every worker inherits the token.
  - Every page that loads Clerk installs the token's route first, through `loadClerkWithTestingToken`.
  - It runs in the restore step all 20 signed-in spec files already call, rather than in a new fixture, so no spec changes. `@clerk/testing` registers the route once per browser context.
- **Preflight's deadline.** `fetchClerkWithRetry` takes an optional deadline: no attempt runs, and no retry waits, past it. Preflight's two Clerk calls share one 30-second deadline, inside setup's 60-second budget.
- **The server's output is shown, redacted.**
  - `webServer.stdout` is `pipe`, and Playwright's runner passes everything it writes, the `[WebServer]` lines included, through the E2E log redaction.
  - The redaction runs in the runner rather than the server process, so the server loads nothing extra.
  - A credential split across two chunks of the server's output would pass. The runner writes whole lines, and the server's chunks are its own writes.

## Verification

- [x] A failed restore, forced in a helper test, fails the remaining signed-in tests with one error that names the FAPI status and trace ID and prints no token. *2026-10-09: `tests/e2e/helpers/clerk-auth.test.ts`.*
- [ ] Teardown revokes the stored session through the Backend API, shown by a helper test and by a CI run leaving no active E2E session. *2026-10-09: the helper test is `clerk-session-revocation.test.ts`; the CI run remains.*
- [x] Test contexts carry the testing token, shown by a helper test of the fixture. *2026-10-09: a helper test of the restore step's load (`loadClerkWithTestingToken`), which stands in for the fixture, and a config test that the token is fetched in `globalSetup`.*
- [x] A helper test shows preflight's Clerk calls, timing out on every attempt, fail with the credential error inside setup's budget. *2026-10-09: `credential-health-check.test.ts`, on fake timers.*
- [ ] No recurrence across the first two weeks of CI runs after the fix.
