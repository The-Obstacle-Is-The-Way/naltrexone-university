# BUG-333: A Signed-In E2E Test Loses Its Clerk Session When It Navigates During Clerk JS's Cookie Rewrite

**Status:** Verifying — every check is recorded, and the record closes; due 2026-10-24
**Priority:** P3
**Date:** 2026-10-09
**Resolved:** —
**Verification receipts:** —

---

## Summary

Since 2026-10-08, a signed-in E2E test has sometimes been sent to Clerk's sign-in page partway through, after its stored session restored normally, while the other tests passed.
- **Two captures, 2026-10-10.** One came through BUG-330's trace, one through a kept Playwright trace. Both show the cause: the test navigated while Clerk JS was rewriting its dev-browser cookies.
- **Three earlier losses**, twice in CI and once locally, left no trace. They fit the same race, but are not shown to be it.
- **The fix.** E2E contexts drop Clerk's echo of the dev-browser token (2026-10-10). They also keep both dev-browser cookies in place while Clerk JS rewrites them after every environment fetch (2026-10-12): a page script holds each removal until the current script ends, and drops it if a write of the same cookie comes first, so each write replaces the cookie in place.
- **The CI week.** In the week after the fix, and through 2026-10-23, CI had no loss from this race. Its losses had BUG-337's signature instead.

## Evidence

- **2026-10-08, #1428, run 37781264035, first attempt.** `cross-page-navigation.spec.ts:26` had restored the session, confirmed the subscription and submitted an answer. Then `/app/dashboard` redirected to Clerk's hosted sign-in, as Playwright's failure snapshot showed (recorded on #1428). The run had no `[WebServer]` Clerk error, and the re-run passed.
- **2026-10-09, #1440, run 37983577282.** `session-review-navigation.spec.ts:37` failed with `startSession lost Clerk authentication and was redirected to sign-in`. The same head had passed E2E 63/63 locally minutes earlier. It was the first CI run with Clerk's 2026-10-01 release set (#1438). The cause was recorded on #1440 before its one re-run, which passed.
- **2026-10-10, #1436's local run, 01:27–01:31Z.** `practice.spec.ts:111` failed with the same `startSession` error, as test 23 of 63 on one worker. No CI or other local run overlapped it: #1443's CI had ended at 01:26:14Z. #1436 changes only scripts and docs. The loss is therefore not specific to CI runners. The failure's Playwright trace, which would have shown Clerk's headers, was overwritten by the re-run.
- **Census (measured).** An independent read-only investigation covered the CI history since 2026-08-25.
  - Before 2026-10-08: 1,150 E2E attempts with no mid-test loss. The one failed restore at the start of a test is #1422's, on 2026-10-07, which is BUG-330.
  - Since 2026-10-08: 50 attempts with these 2 losses.
  - No other E2E run overlapped either loss, so DEBT-508's overlap is not shown to cause it.
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
7. **Recover from this one cause, visibly.** When a navigation reaches sign-in and the trail shows `dev-browser-missing`, restore the stored session once and repeat the navigation, printing the trail. Unlike option 2, it acts only on the cause this record now explains.
8. **Drop Clerk's echo in tests** (decided 2026-10-10).
   - **The evidence.** In the traced capture, every Frontend API answer's `Clerk-Db-Jwt` header carried the same token as the request's `__clerk_db_jwt` (compared by hash, never value). So each rewrite set identical cookies: a no-op that opens the race.
   - **The change.** A context route (`tests/e2e/helpers/clerk-dev-browser-echo.ts`) passes Clerk JS's own Frontend API calls through and removes that header only when it equals the token the request sent. A different token still passes, so a real rotation is kept. Navigations, such as the handshake, are not intercepted.
   - **Where.** Every signed-in test's restore and global setup install it before their first navigation.
   - **Why not the testing token's route** (BUG-330 option 4). That route retries answers and rewrites their bodies. This one changes nothing but the trigger, now that the trace has named it.
9. **Make the rewrite one overwrite in tests** (built 2026-10-12). A context init script holds each removal of the two dev-browser cookies until the current script ends, and drops it if a write of the same cookie comes first. The write then replaces the value in place, and no request sees a gap. A removal with no write after it still happens, and the page sees the cookie gone at once. It changes only cookie timing in tests, whichever event triggers the rewrite.

## Resolution (decided)

**Decided:** option 1, done; option 8, built (the echo trigger); option 9, built on 2026-10-12. Option 9 covers the environment-fetch trigger and any other rewrite Clerk JS makes through `document.cookie` within one script run: `devBrowserCookieKeeper` (`tests/e2e/helpers/clerk-dev-browser-cookies.ts`) does this in every signed-in test's pages and in global setup. Option 7 was not needed. Option 5, reporting the race to Clerk, is the owner's call, and would let options 8 and 9 go once Clerk fixes it. A quiet period does not close this record: it would not show whether the cause went away or only did not fire, since 1,150 attempts passed before the first loss.

*Corrected 2026-10-11: BUG-337 shows a mid-run sign-out after the echo drop. A server action was answered `signed-out`, `dev-browser-missing`, in CI twice and locally once, so this record's check is in doubt. The two are being fixed together.*

*Corrected 2026-10-12: the echo is not the only trigger.*
- **The second trigger.** Clerk JS 6.38.0 and 6.39.0 also rewrite both dev-browser cookies, with the unchanged token, after every environment fetch. Each full-page load fetches the environment, which emits `environment:update`, and the cookie service answers it with `devBrowser.refreshCookies()`.
- **Two requests caught inside that rewrite.** BUG-337's server logging caught two requests that arrived about 70 ms after `/v1/environment` answered: one with only the unsuffixed copy, one with neither. The setter removes the suffixed copy, then the unsuffixed one, then sets both.
- **The trace's cookie header is not what was sent.** For the second request, Playwright's trace recorded both cookies. But its headers were the provisional set (no `host` or `sec-fetch-*`), and its `Cookie` header was 105 bytes longer than the one the server received: exactly the two cookies. So the contradiction this record and BUG-337 reported came from the trace, not the server.
- **What was left.** Option 8 removed one trigger. Option 9, chosen and built the same day, covers the other; option 6 could not cover the app's own requests during the load.

*Corrected 2026-10-13: before merge, option 9's first version skipped every removal of the two cookies, not only one a write follows.* Clerk JS discards a dev browser that its Frontend API no longer accepts: it removes both cookies, then reads them at once, and asks for a new one only if it finds none. With every removal skipped, it would have kept the stale token, and Clerk's load would have failed. A pre-review sweep found it in Clerk JS 6.39's source. The keeper now holds a removal only until the script ends, and hides the held cookie from the page meanwhile.

## Verification

- [x] A loss prints an `[E2E_CLERK_AUTH_TRACE]` trail, recorded here. *2026-10-10: a local gate's hosted lane, above; a CI one would show whether the earlier losses share it.*
- [x] The trail, with the server's output, names which of Clerk's four cases sent the page to sign-in, and why. *2026-10-10: case 2, after a `dev-browser-missing` handshake, caused by a navigation during Clerk JS's cookie rewrite.*
- [x] A fix against the echo trigger, test-first. *2026-10-10: option 8, unit-tested. In #1452's pull request: three local E2E runs and two stripe-hosted runs, then CI, without a loss. Another session's synced run and promotion #1455's CI also ran without one. That day's rate before it was about one loss in two runs.*
- [x] A fix against the environment-fetch trigger, test-first. *2026-10-12: option 9.*
  - Six jsdom tests: five run the function from its source text as Playwright does, and one checks that the source binds no function to a name. The discard case and a cookie that only shares the prefix were red against the first version. Ten mutations each turn one red, among them a stale task applying a newer batch of removals, and removals applied a task late.
  - In Chromium (2026-10-13), on a local page replaying Clerk JS 6.39's cookie writes, a synchronous request sent between the removals and the write carried both cookies with the script, and neither without it. During a discard, the page saw both gone at once, and they left the jar when the script ended.
  - In a local experiment under load, with the first version, 12 full E2E runs with the script had no loss, against 2 losses in 11 runs without it. One unrelated failure was a slow page.
- [x] No mid-run Clerk session loss from the cookie-rewrite race in CI for a week after the merge, due 2026-10-24. A loss whose trace names another cause in the app or in Clerk JS's cookie handling reopens the investigation, unless an open record already holds that cause. *Re-dated 2026-10-22 from 2026-10-21:* the check was not recorded by its date. The next records pull request records it, and weighs the 2026-10-22 local loss below.
  - *Reopened 2026-10-12.* Another session's local E2E lost its session at `practice.spec.ts:307` (04:00:38Z), and its trace was kept. The echo had been dropped as designed. The navigation's request carried both dev-browser cookies, unchanged, and both session copies, yet the server answered `dev-browser-missing`, which `@clerk/backend` 3.22 returns only when it finds no dev-browser token. That is the contradiction BUG-337's trace shows for a server action. The rewrite mechanism above does not explain it. BUG-337 owns the next step, which is to log the server's own view of each signed-out request.
  - *Explained the same day:* see the 2026-10-12 correction under Resolution.
  - *2026-10-22, a local loss with an external cause.* #1586's local E2E on d05a2f22 lost the session in `mobile-layout.spec.ts:71` (mobile-smoke) at 00:04Z. The Playwright trace and the server's output show why:
    - Session restore succeeded. The stored token had expired, so the first request handshook (`session-token-expired-refresh-non-eligible-no-refresh-cookie`), and the handshake set a fresh session and both dev-browser cookies.
    - From 00:04:11Z, Clerk's development Frontend API answered every Clerk JS request with 503 (HTML), then 500 (JSON): `/v1/environment`, `/v1/client` and the session-token refreshes. It continued to at least 00:04:37Z, the last request traced.
    - With no token refresh, the server answered `/pricing` with five handshakes in 3.6 s (`session-token-iat-before-client-uat`), each returning without a session. Clerk's redirect-loop guard then served the page signed out (case 3), and the server logged "infinite redirect loop".
    - Every request carried both dev-browser cookies and both session copies, so the cookie rewrite was not involved.
    - status.clerk.com posted no Frontend API incident. The Frontend API answered 200 again by 00:08Z, and the rerun on the same head passed E2E 64/64 and hosted Checkout 7/7.
    - *Decided 2026-10-22, in the pull request that adds this evidence, which also holds BUG-333's due check:* the loss is out of scope. It does not count against the CI-week check, which covers CI runs, and this run was local. It does not reopen the investigation either: the trace names an outage of Clerk's development Frontend API, not another cause in the app or in Clerk JS's cookie handling, and this record cannot fix an outage.
  - *2026-10-23, a CI loss with BUG-337's signature.* This pull request's CI run 39932700884, on `fb0551b8`, lost the session in `review-mode-audit.spec.ts:116` at 09:52Z. Its Clerk trace shows why:
    - Up to the last server action that answered 200, every request carried both `__client_uat` cookies at the sign-in time, and both session copies.
    - The next server action and the RSC fetches after it carried both `__client_uat` cookies as `0`, while both session copies and both dev-browser cookies were still present. The server answered each with 307 to Clerk's development host: `auth=signed-out`, `reason=session-token-but-no-client-uat`.
    - The dev-browser cookies were present throughout, so the cookie rewrite this record fixed was not involved. The re-run on the same head passed.
    - *Decided 2026-10-23, in this pull request:* the loss does not count against the CI-week check, which covers this record's race. What writes `__client_uat` as `0` is BUG-337's open question, and this trace goes there as evidence; it reopens nothing here, since an open record already holds that cause.
  - *Recorded 2026-10-23: no loss from this race.* #1480 merged on 2026-10-13 at 07:45Z. In the week after, CI's E2E ran 207 times and failed 6 times. Through 2026-10-23 it ran 318 times and failed 16 times. The count covers every attempt, re-runs included.
    - This race ends at sign-in after a `dev-browser-missing` answer. Since 2026-10-09, a signed-in test that reaches sign-in prints the `sign-in` trace with Clerk's reason for each answer. No failed job printed one.
    - Seven failures, three of them in the week, had BUG-337's signature instead: the signed-in page showed "Failed to fetch" and never reached sign-in. The three on or after 2026-10-22 also traced `session-token-but-no-client-uat`. As decided for the 2026-10-23 loss above, they belong to BUG-337, which holds that cause.
    - The other nine were eight exam-timing failures (BUG-347) and one entitlement-loss test that failed because its page had already closed.
  - **The record closes on options 8 and 9, not on this week.** As the decision says, a quiet period alone would not show the cause gone. Both were built test-first against their trigger, as recorded above; the week shows that CI's losses no longer take this path.
