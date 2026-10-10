# BUG-333: A Signed-In E2E Test Loses Its Clerk Session When It Navigates During Clerk JS's Cookie Rewrite

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — no mid-run Clerk session loss in CI with the echo dropped; due 2026-10-17
**Priority:** P3
**Date:** 2026-10-09
**Resolved:** —
**Verification receipts:** —

---

## Summary

Three times since 2026-10-08, one signed-in E2E test has been sent to Clerk's sign-in page partway through, after its stored session restored normally: twice in CI and once in a local run. Each time the other 62 tests passed, and each re-run passed. Nothing recorded why. [BUG-330](../_archive/bugs/bug-330-stored-clerk-session-lost-after-token-expiry.md) adds a trace that names Clerk's decisions at the next loss. This record holds the losses, the investigation and the hypotheses until a trace explains one.

## Evidence

- **2026-10-08, #1428, run 37781264035, first attempt.** `cross-page-navigation.spec.ts:26` had restored the session, confirmed the subscription and submitted an answer. Then `/app/dashboard` redirected to Clerk's hosted sign-in, as Playwright's failure snapshot showed (recorded on #1428). The run had no `[WebServer]` Clerk error, and the re-run passed.
- **2026-10-09, #1440, run 37983577282.** `session-review-navigation.spec.ts:37` failed with `startSession lost Clerk authentication and was redirected to sign-in`. The same head had passed E2E 63/63 locally minutes earlier. It was the first CI run with Clerk's 2026-10-01 release set (#1438). The cause was recorded on #1440 before its one re-run, which passed.
- **2026-10-10, #1436's local run, 01:27–01:31Z.** `practice.spec.ts:111` failed with the same `startSession` error, as test 23 of 63 on one worker. No CI or other local run overlapped it: #1443's CI had ended at 01:26:14Z. #1436 changes only scripts and docs. The loss is therefore not specific to CI runners. The failure's Playwright trace, which would have shown Clerk's headers, was overwritten by the re-run.
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

- **Keeping the evidence.** A local failure keeps a Playwright trace (`test-results/<test>/trace.zip`, kept on failure). It holds every response's Clerk headers and the redirect chain. Before re-running after a local loss, copy that test's folder somewhere private: it contains Clerk tokens and must never be published. Then record what it shows here.

## The first traced loss, 2026-10-10

BUG-330's branch, in its own local gate (`stripe-hosted` project, trial add-card), lost the session at its last step. The trace printed the chain, and the test's Playwright trace showed each request's cookies.

- **The trail** (as printed; Stripe's paths left out):
  ```text
  +31161ms GET 127.0.0.1/app/billing 200                       (the test's page.reload)
  +31533ms GET 127.0.0.1/app/dashboard 307 auth=handshake/dev-browser-missing
           → <instance>.clerk.accounts.dev/v1/client/handshake hs_reason=dev-browser-missing
  +31637ms GET 127.0.0.1/app/dashboard 307 auth=signed-out/session-token-missing; cookies: __session_<suffix> cleared, __client_uat=0
  +31641ms GET 127.0.0.1/app/dashboard 307 auth=signed-out/session-token-and-uat-missing → <instance>.accounts.dev/sign-in
  ```
- **The cookies sent** (names only):
  - The billing reload's prefetches at 12:43:07.90–.93 carried both `__clerk_db_jwt` and `__clerk_db_jwt_<suffix>`.
  - The dashboard navigation at 07.981, the test's `page.goto('/app/dashboard')`, carried `__clerk_db_jwt` and the other suffixed cookies, but not `__clerk_db_jwt_<suffix>`.
  - No response in between removed it.
  - The stored state's cookies expire in 2027.
- **Why the server saw no dev browser.** `@clerk/backend` 3.22.0 reads the token from the `__clerk_db_jwt` query parameter or, through `getSuffixedOrUnSuffixedCookie`, the suffixed cookie when the request uses suffixed cookies, as this one did. With the suffixed copy gone, it handshakes with `dev-browser-missing`. That handshake carries no dev browser, so Clerk's Frontend API answers signed out, and the next request goes to sign-in: case 2 above.
- **Why the suffixed copy was gone.**
  - Clerk JS 6.39.0, which the billing page loaded at 07.915, stores the dev-browser token from any Frontend API answer that carries a `Clerk-Db-Jwt` header.
  - That page's `/v1/environment` and `/v1/client` answers, at 07.872, both did.
  - Its cookie setter removes both copies, suffixed first, and only then sets both. A navigation that starts during that rewrite carries the plain copy without the suffixed one.
  - The setter is the same in 6.37.0, 6.38.0, 6.38.1 and 6.39.0. So the race is not new code, though something else may have made it likelier from 2026-10-08, such as how often Clerk's answers carry the header.
- **Scope.** Development instances only: a production instance has no dev browser. Real users are not affected.
- **A second capture, the same day.** Another session's local run, on a branch without the trace, lost `session-review-navigation.spec.ts:37` at `startSession`. Its Playwright trace was kept before the re-run.
  - At 12:52:07.649, the page's `/v1/environment` and `/v1/client` answers carried `Clerk-Db-Jwt`.
  - At 07.748, the navigation to the new session's page carried neither `__clerk_db_jwt` cookie: both copies removed, neither set yet.
  - The handshake then answered signed out, and the next request went to sign-in.

  It is the same race, caught at the other point in the rewrite.
- **Not yet shown:** that the earlier three losses were this race. Each was also a navigation shortly after a page load, which fits.

## Hypotheses before the trace

1. Clerk's Frontend API answered "no session" for the run's shared development browser, either through the handshake or to the page's own Clerk JS.
2. The redirect-loop guard tripped. Its log line goes to the server's stdout, which CI dropped until BUG-330's pull request.

## Impact

Each loss turns a required CI run red. It costs a documented re-run, and on a promotion it holds the production alias until then. About one attempt in 25 since 2026-10-08.

## Options

1. **Observe first** (done 2026-10-10: the trace above names the cause). BUG-330's trace and piped server output decide between the hypotheses at the next loss, and change no test traffic.
2. **Retry or restore the session again when it is lost.** Rejected: it hides the next occurrence and its cause.
3. **Install Clerk's testing token in every test** (BUG-330 option 4). Deferred: its route retries and rewrites Frontend API traffic, which would change what the trace observes, and nothing shows the token is missing.
4. **Pin Clerk JS's version.** Rejected: the cookie setter is the same in every version since at least 6.37.0.
5. **Report the race to Clerk.** Ask that the dev-browser setter overwrite in place, or skip an unchanged token. That is the root fix, in Clerk's code, and filing it publicly is the owner's call.
6. **Let tests navigate only once Clerk JS has stored its answers.** A navigation helper waits until no Frontend API request is pending on the page before it moves. That narrows the window but cannot close it: token refreshes answer at any time.
8. **Drop Clerk's echo in tests** (decided 2026-10-10).
   - **The evidence.** In the traced capture, every Frontend API answer's `Clerk-Db-Jwt` header carried the same token as the request's `__clerk_db_jwt` (compared by hash, never value). So each rewrite set identical cookies: a no-op that opens the race.
   - **The change.** A context route (`tests/e2e/helpers/clerk-dev-browser-echo.ts`) passes Clerk JS's own Frontend API calls through and removes that header only when it equals the token the request sent. A different token still passes, so a real rotation is kept. Navigations, such as the handshake, are not intercepted.
   - **Where.** Every signed-in test's restore and global setup install it before their first navigation.
   - **Why not the testing token's route** (BUG-330 option 4). That route retries answers and rewrites their bodies. This one changes nothing but the trigger, now that the trace has named it.
7. **Recover from this one cause, visibly.** When a navigation reaches sign-in and the trail shows `dev-browser-missing`, restore the stored session once and repeat the navigation, printing the trail. Unlike option 2, it acts only on the cause this record now explains.

## Resolution

**Decided:** option 1, done; option 8, built. Option 5, reporting the race to Clerk, is the owner's call, and would let option 8 go once Clerk fixes it. A quiet period does not close this record: it would not show whether the cause went away or only did not fire, since 1,150 attempts passed before the first loss.

## Verification

- [x] A loss prints an `[E2E_CLERK_AUTH_TRACE]` trail, recorded here. *2026-10-10: a local gate's hosted lane, above; a CI one would show whether the earlier losses share it.*
- [x] The trail, with the server's output, names which of Clerk's four cases sent the page to sign-in, and why. *2026-10-10: case 2, after a `dev-browser-missing` handshake, caused by a navigation during Clerk JS's cookie rewrite.*
- [x] A fix against that cause, test-first, or an explained acceptance. *2026-10-10: option 8, unit-tested. In #1452's pull request: three local E2E runs and two stripe-hosted runs, then CI, without a loss. Another session's synced run and promotion #1455's CI also ran without one. That day's rate before it was about one loss in two runs.*
- [ ] No mid-run Clerk session loss in CI for a week with the echo dropped, due 2026-10-17. A loss with a trace that names another cause reopens the investigation.
