# BUG-337: A Session's First Question Can Fail to Load With "Failed to Fetch"

**Status:** Open — caught on the server: a request lacked the suffixed dev-browser cookie; name the cookie write that removed it; due 2026-10-14
**Priority:** P3
**Date:** 2026-10-11

---

## Summary

In required E2E on CI, a practice session's page loaded, then its first question and the bookmarks panel both failed at once. The page showed its own error state, "Failed to fetch", with Try again. The browser's `fetch` rejected, so the request failed at the network level rather than returning an error. The server logged nothing at that moment. A learner hitting this sees the same error and must press Try again.

## Evidence

- **#1467's CI, 2026-10-11 22:25:49Z.** `review-mode-audit.spec.ts` › "session breakdown links open questions in review mode" failed in 3.1 s. `startSession` reported `Failed to fetch` | `Bookmarks unavailable.` The server output between 22:25:40Z and 22:25:52Z holds only normal request logs: no error and no E592 (BUG-334).
- **#1467's earlier CI run, first attempt, 21:00:34Z.** The same spec, another test. A question page loaded without its answer choices, and the helper waited 30 s for radio D. This may be the same failure, but it is not shown.
- **Not this PR's code.** #1467 changes no runtime file (`git diff origin/dev...HEAD` touches a test import and a comment), and its full local gate passed this spec three times.
- **Not an overlap.** No other CI run, and no reported local E2E run, used the shared Clerk user in either window.
- **New.** No other failed CI run since 2026-09-25 has `Failed to fetch`. Runs that passed on a re-run drop out of that search.
- **Reproduced locally, with a trace** (2026-10-11 23:23:39Z, the full gate on #1467). The same test failed with `startSession failed before navigation: Failed to fetch`. Its Playwright trace, kept local, shows:
  - four `POST /app/practice` server actions within 250 ms, all with the same Clerk cookies (`__clerk_db_jwt`, `__session` and their suffixed copies);
  - the first three answered 200;
  - the fourth answered **307 to Clerk's sign-in page, with `x-clerk-auth-status: signed-out` and `x-clerk-auth-reason: dev-browser-missing`**;
  - a `fetch` that follows a redirect to another origin fails as `Failed to fetch`;
  - 120 ms earlier, Clerk JS's `/v1/client` and `/v1/environment` responses carried a `clerk-db-jwt` header. BUG-333's echo filter drops that header only when it repeats the token the request sent; a different token passes by design.
- **Not an overlap.** No CI run used the shared Clerk user then: #1465's CI E2E ran 23:16:08 to 23:19:39Z.
- **The trace, examined further (2026-10-12).** Token values were compared by hash only.
  - The `clerk-db-jwt` header Clerk JS's Frontend API calls echoed carried the **same** token as the cookie and the request URL. So the earlier lead, a different token passing BUG-333's filter, is ruled out.
  - The 307 request's recorded `Cookie` header carried both dev-browser cookies (`__clerk_db_jwt` and its suffixed copy) and both session cookies, identical to the request answered 200 fifty milliseconds earlier.
  - `@clerk/backend` 3.22.0, the version the app runs, returns `dev-browser-missing` only when neither the URL nor the cookies supply a dev-browser token. That contradicts the recorded header: either the server parsed a different header than the trace shows, or the decision came from elsewhere.
  - Clerk JS 6.38.0 rewrites its cookies (removing both, then setting them) only when a response carries the echo header, or when the page URL carries the token. The filter strips the echo, so that gap should not open.
- **A second capture, from BUG-333 (2026-10-12, 04:00:38Z, another session's local E2E).** A page navigation, not a server action, shows the same contradiction. Its request carried both dev-browser cookies (31 characters, the same token as Clerk JS's echoed and dropped header) and both session copies, yet the app answered `handshake` with `dev-browser-missing`. Then the handshake signed the browser out and set a new dev-browser token. So two traces, on two request kinds, show the server failing to see a dev-browser cookie that the browser sent. `proxy.ts` passes the request to Clerk's middleware unchanged.
- **The server's view, logged (2026-10-12, 05:15–05:39Z).** A local-only branch, never pushed, logged one line for every request that Clerk's middleware did not mark signed in. Each line gave the reason, whether the URL carried the dev-browser token, and the names and lengths of the cookies, both raw and as Next.js parsed them. No values were logged.
  - **Five runs, 282 tests, no loss:** four runs on one clone (219 tests) and one full suite on another (63 tests).
  - **Every `dev-browser-missing` came from a request with no `Cookie` header.** There were 291 of them, all for anonymous pages and the health check. No request carrying `__clerk_db_jwt` was read as missing.
  - These runs had no loss, so they cannot show what happens in one. They do show that Clerk read the cookie whenever the header carried it. The leading explanation for the losses is a request that reached the server without its `Cookie` header, although Playwright's trace records one. Only a captured loss can settle that.
- **A third capture, without server logging (2026-10-12 08:48:59Z, another clone's local E2E).** `practice.spec.ts`, "reopens post-exam review at the first question…", was sent to sign-in.
  - A page navigation, 33 ms after a server action that succeeded, carried both dev-browser cookies with the same token as every earlier request. The app answered `handshake` with `dev-browser-missing`.
  - The handshake URL the server built carried no dev-browser token, although the one it built 1.9 s earlier did. So the server itself had no token; the reason is not mislabelled.
  - The echo filter worked: the page received Clerk's API responses without the echo header.
  - No CI run or other E2E run used the Clerk user then. Another clone's integration tests, which do not call Clerk, were running on the same machine, so it was loaded.
- **Caught on the server (2026-10-12 11:12:03Z, the fourth of nine logged local runs, with unit tests running alongside for load).**
  - A server action from "practice page shows continue-session card and resumes session" reached the server with the unsuffixed `__clerk_db_jwt` but without its suffixed copy.
  - The suffixed session and client cookies were there, so Clerk reads the suffixed dev-browser cookie (`usesSuffixedCookies()` in `@clerk/backend`). It found none and answered `dev-browser-missing`. The raw and parsed headers matched: the server read what arrived.
  - So the browser did send an incomplete set. The cookie order shows that the unsuffixed dev-browser cookie was created after the session cookies, and that the client cookies were rewritten after it.
  - Clerk JS 6.39.0, the version the CDN serves (the app loads `@6`, so the version floats), sets the suffixed copy before the unsuffixed one. A request caught inside that setter would carry only the suffixed copy. This one carried only the unsuffixed copy, so another write removed the suffixed copy. That write is not yet named.
  - The test passed, because the action ran in the background as the test moved on.
  - Five more runs, with browser traces kept, caught nothing before the lane was needed.
- **In CI too (2026-10-12, about 09:58Z, #1472's second attempt).** In `review-mode-audit.spec.ts`, "history questions: correct and incorrect open review mode", a `page.goto` to a question page landed on Clerk's sign-in page. CI keeps no trace and no server log, so this one shows only that the loss happens there as well.

## Impact

**Users: none.** `dev-browser-missing` exists only on Clerk development instances; production uses a production instance, which has no dev-browser token.

**Tests:** required E2E fails at random, three times in about two and a half hours on 2026-10-11 (twice in CI, once locally), each time in `review-mode-audit.spec.ts` right after sign-in.

**A separate helper weakness, fixed here.** The first failure on 2026-10-11 left a second lead. `submitQuestionForOutcome` (`tests/e2e/helpers/question.ts`) read its outcome with a page-wide `getByText(outcome, { exact: true }).isVisible()` that did not wait, and it treated a throw as "not this outcome". A second exact "Correct" on the page makes Playwright's strict mode throw, so a correct answer was skipped and the helper moved on to the next choice. It now reads the verdict pill it has already waited for (`readVerdict`, with a red test in `question.test.ts`). This does not explain the traced "Failed to fetch", which is the Clerk race below.

## Options

The first is now shown; the others are ruled out for the traced failure.

1. **A request redirected to another origin.** *Shown.* A server action or RSC request that Clerk's middleware answers with a handshake redirect to Clerk's domain fails as a CORS error, which the browser reports as "Failed to fetch". BUG-333 and BUG-330 show that Clerk session refreshes during E2E navigation are real.
2. **A request aborted by navigation.** The session page's client navigation cancels the in-flight question and bookmark fetches.
3. **The server dropped connections** under load, for example during a `next start` worker restart.

## Resolution (decided)

Not yet decided. The failing request is identified, so the next step is a fix that holds for server actions, decided with BUG-333. Candidates:
- drop every dev-browser echo in tests, not only those that repeat the sent token;
- wait in the sign-in helper for Clerk JS's first client sync before the test acts;
- run E2E against a Clerk instance configured like production.

The trace answered the first question (the echo was the same token). Server-side logging then caught a loss: the request arrived without the suffixed dev-browser cookie, so the cause is on the browser side, not in Clerk's middleware.

Next, by 2026-10-14: catch one loss with both the browser trace and the server log, to name the write that removes the suffixed copy. Then choose among the candidates above, adding one:
- pin the Clerk JS version the app loads, so a CDN release cannot change cookie handling between deploys.

The logging records names and lengths only, never values. It is diagnostic, and it never ships.

## Verification

- [x] The failing request is identified, with its trace (2026-10-11): a server action answered 307, signed out with `dev-browser-missing`.
- [ ] A fix with a red test, or a reasoned no-fix with evidence.

## Related

- BUG-333 and BUG-330: Clerk session behaviour during E2E navigation.
- BUG-334: Next.js's E592 during E2E, not seen in this run.
