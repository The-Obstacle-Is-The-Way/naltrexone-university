# BUG-333: A Signed-In E2E Test Loses Its Clerk Session Partway Through a CI Run, Cause Unknown

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — diagnostics ship with BUG-330's pull request; closes only when a trace explains a loss, never on a quiet period
**Priority:** P3
**Date:** 2026-10-09
**Resolved:** —
**Verification receipts:** —

---

## Summary

Twice since 2026-10-08, one signed-in E2E test in a CI run has been sent to Clerk's sign-in page partway through, after its stored session restored normally. The other 62 tests passed, and each re-run passed. Nothing recorded why. [BUG-330](./bug-330-stored-clerk-session-lost-after-token-expiry.md) adds a trace that names Clerk's decisions at the next loss. This record holds the losses, the investigation and the hypotheses until a trace explains one.

## Evidence

- **2026-10-08, #1428, run 37781264035, first attempt.** `cross-page-navigation.spec.ts:26` had restored the session, confirmed the subscription and submitted an answer. Then `/app/dashboard` redirected to Clerk's hosted sign-in, as Playwright's failure snapshot showed (recorded on #1428). The run had no `[WebServer]` Clerk error, and the re-run passed.
- **2026-10-09, #1440, run 37983577282.** `session-review-navigation.spec.ts:37` failed with `startSession lost Clerk authentication and was redirected to sign-in`. The same head had passed E2E 63/63 locally minutes earlier. It was the first CI run with Clerk's 2026-10-01 release set (#1438). The cause was recorded on #1440 before its one re-run, which passed.
- **Census (measured).** An independent read-only investigation covered the CI history since 2026-08-25.
  - Before 2026-10-08: 1,150 E2E attempts with no mid-test loss. The one failed restore at the start of a test is #1422's, on 2026-10-07, which is BUG-330.
  - Since 2026-10-08: 50 attempts with these 2 losses.
  - No other E2E run overlapped either loss, so [DEBT-508](../debt/debt-508-concurrent-e2e-runs-share-clerk-budget-and-stripe-customer.md)'s overlap is not shown to cause it.
  - #1428's failing test was the first to start after the stored token expired. #1440's was not: 35 restores after expiry had succeeded.
- **What can send a page to sign-in (read in code).** Clerk's middleware sends a full-page request straight to sign-in, rather than refreshing it through its handshake, in four cases only (`@clerk/backend` `tokens/request.ts`, `tokens/handshake.ts`):
  1. the browser has neither `__session` nor `__client_uat`, as Clerk JS leaves it after signing itself out;
  2. the handshake answers with no session;
  3. the redirect-loop guard trips, which takes three handshakes within 2 seconds;
  4. token verification fails without a handshake.
- **Ruled out:**
  - the app itself: it never redirects to sign-in;
  - overlap and Clerk 429s: none in these runs;
  - Clerk's server SDK: its auth code is identical across 7.9.2, 7.9.4 and 7.9.10;
  - the BUG-323 limiter: it runs on live keys only;
  - the E2E reset and seed: they no longer call Clerk.
- **One floating variable.** Clerk JS loads from Clerk's CDN as `@clerk/clerk-js@6`, so the lockfile does not pin it. 6.38.0 and 6.38.1 came out around the losses, but their auth code did not change.

## Hypotheses (not yet decidable)

1. Clerk's Frontend API answered "no session" for the run's shared development browser, either through the handshake or to the page's own Clerk JS.
2. The redirect-loop guard tripped. Its log line goes to the server's stdout, which CI dropped until BUG-330's pull request.

## Impact

Each loss turns a required CI run red. It costs a documented re-run, and on a promotion it holds the production alias until then. About one attempt in 25 since 2026-10-08.

## Options

1. **Observe first** (decided). BUG-330's trace and piped server output decide between the hypotheses at the next loss, and change no test traffic.
2. **Retry or restore the session again when it is lost.** Rejected: it hides the next occurrence and its cause.
3. **Install Clerk's testing token in every test** (BUG-330 option 4). Deferred: its route retries and rewrites Frontend API traffic, which would change what the trace observes, and nothing shows the token is missing.
4. **Pin Clerk JS's version.** It removes the floating variable but is not shown to fix anything. Decide once a trace names the cause.

## Resolution

**Decided:** option 1. When a trace arrives, record it here (redacted, as printed), name the cause, and choose a fix against it. A quiet period does not close this record: it would not show whether the cause went away or only did not fire, since 1,150 attempts passed before the first loss.

## Verification

- [ ] A CI loss prints an `[E2E_CLERK_AUTH_TRACE]` trail, recorded here.
- [ ] The trail, with the server's output, names which of Clerk's four cases sent the page to sign-in, and why.
- [ ] A fix against that cause, test-first, or an explained acceptance.
