# BUG-337: A Session's First Question Can Fail to Load With "Failed to Fetch"

**Status:** Open — "Failed to fetch" recurred in required CI on 2026-10-18, after option 9; trace the failing request before choosing a fix
**Priority:** P3
**Date:** 2026-10-11

---

## Summary

In required E2E on CI, a practice session's page loaded, then its first question and the bookmarks panel both failed at once. The page showed its own error state, "Failed to fetch", with Try again. The browser's `fetch` rejected, so the request failed at the network level rather than returning an error. The server logged nothing at that moment. A learner hitting this sees the same error and must press Try again.

## Evidence

- **2026-10-20, #1575's CI (run 39370814142), twice.** `exam-timing.spec.ts` failed 2.3 s in: the timing request its window `focus` started was aborted (`net::ERR_ABORTED`), while 63 other tests passed and the same head passed locally. A local probe showed a window `focus` starts two requests at once, the app's server action and Clerk's `POST /v1/client/sessions/<id>/touch`; a `visibilitychange` starts only the app's. On the development instance the touch rewrites cookies, the race BUG-333 describes. The test now signals the tab return with `visibilitychange`. Whether the first-question failures below share this mechanism is not established.
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
  - Clerk JS 6.38.0 rewrites its cookies (removing both, then setting them) when a response carries the echo header, when the page URL carries the token, and after every environment fetch. The filter strips only the echo. *Corrected 2026-10-12: the first reading missed the environment fetch.*
- **A second capture, from BUG-333 (2026-10-12, 04:00:38Z, another session's local E2E).** A page navigation, not a server action, shows the same contradiction. Its request carried both dev-browser cookies (31 characters, the same token as Clerk JS's echoed and dropped header) and both session copies, yet the app answered `handshake` with `dev-browser-missing`. Then the handshake signed the browser out and set a new dev-browser token. So two traces, on two request kinds, showed the server answering `dev-browser-missing` although the trace recorded the cookie. *Corrected 2026-10-12: the browser had not sent it; the trace's header was provisional (see the 12:03 capture).* `proxy.ts` passes the request to Clerk's middleware unchanged.
- **The server's view, logged (2026-10-12, 05:15–05:39Z).** A local-only branch, never pushed, logged one line for every request that Clerk's middleware did not mark signed in. Each line gave the reason, whether the URL carried the dev-browser token, and the names and lengths of the cookies, both raw and as Next.js parsed them. No values were logged.
  - **Five runs, 282 tests, no loss:** four runs on one clone (219 tests) and one full suite on another (63 tests).
  - **Every `dev-browser-missing` came from a request with no `Cookie` header.** There were 291 of them, all for anonymous pages and the health check. No request carrying `__clerk_db_jwt` was read as missing.
  - These runs had no loss, so they cannot show what happens in one. They do show that Clerk read the cookie whenever the header carried it, so a loss had to be a request that reached the server without the dev-browser cookies. *Corrected 2026-10-12: the catches below confirm it; it is the dev-browser cookies that go missing, not the whole header.*
- **A third capture, without server logging (2026-10-12 08:48:59Z, another clone's local E2E).** `practice.spec.ts`, "reopens post-exam review at the first question…", was sent to sign-in.
  - A page navigation, 33 ms after a server action that succeeded, carried both dev-browser cookies with the same token as every earlier request. The app answered `handshake` with `dev-browser-missing`.
  - The handshake URL the server built carried no dev-browser token, although the one it built 1.9 s earlier did. So the server itself had no token; the reason is not mislabelled.
  - The echo filter worked: the page received Clerk's API responses without the echo header.
  - No CI run or other E2E run used the Clerk user then. Another clone's integration tests, which do not call Clerk, were running on the same machine, so it was loaded.
- **Caught on the server (2026-10-12 11:12:03Z, the fourth of the afternoon's logged local runs, with unit tests running alongside for load).**
  - A server action from "practice page shows continue-session card and resumes session" reached the server with the unsuffixed `__clerk_db_jwt` but without its suffixed copy.
  - The suffixed session and client cookies were there, so Clerk reads the suffixed dev-browser cookie (`usesSuffixedCookies()` in `@clerk/backend`). It found none and answered `dev-browser-missing`. The raw and parsed headers matched: the server read what arrived.
  - So the browser did send an incomplete set. The cookie order shows that the unsuffixed dev-browser cookie was created after the session cookies, and that the client cookies were rewritten after it.
  - Clerk JS 6.39.0, the version the CDN serves (the app loads `@6`, so the version floats), removes the suffixed copy first, then the unsuffixed one, then sets both. A request between the two removals carries only the unsuffixed copy, as this one did. *Corrected 2026-10-12: first read as the setter's order, which pointed at another writer.*
  - The test passed, because the action ran in the background as the test moved on.
  - Five more runs, with browser traces kept, caught nothing before the lane was needed.
- **Caught with both views (2026-10-12 12:03:15Z, the eleventh of the afternoon's logged runs).** `practice.spec.ts`, "resets the active question viewport after next and previous navigation", failed with `startSession lost Clerk authentication`.
  - The server received the navigation to the session page with no dev-browser cookie at all, and answered `handshake` with `dev-browser-missing`.
  - Playwright's trace recorded both dev-browser cookies on the same request. But those were its provisional headers (no `host` or `sec-fetch-*`), and its `Cookie` header was 105 bytes longer than the server's: exactly the two cookies. So this trace's "both cookies sent" was the trace's view, not the wire. The earlier traces were not compared with what the server received, but they fit the same pattern.
  - The request left about 70 ms after Clerk JS's `/v1/environment` call answered. Clerk JS answers each environment fetch with `devBrowser.refreshCookies()`, which removes both cookies and sets them again. Every capture fits that window.
- **In CI too (2026-10-12, about 09:58Z, #1472's second attempt).** In `review-mode-audit.spec.ts`, "history questions: correct and incorrect open review mode", a `page.goto` to a question page landed on Clerk's sign-in page. CI keeps no trace and no server log, so this one shows only that the loss happens there as well.
- **After the fix, in CI (2026-10-18 00:26Z, #1552's CI).** `history.spec.ts`, "shows missed questions and removes them after correct reattempt", failed on its third load of a question page in one test. The page snapshot shows the signed-in app shell, the question's alert "Failed to fetch" with Try again, and Submit disabled. The helper waited 30 s for radio C. So the 2026-10-11 question page that waited for radio D fits this failure too.
  - The session was not lost: the page stayed signed in, so this does not count against BUG-333's check.
  - The server logged nothing during the test's 36 s.
  - Not that PR's code: #1552 changes CI's image pulls, and E2E reaches Postgres directly, not through the pooler. The same head passed the full local E2E.
  - Not an overlap: no other CI run was active in this repository, and the local E2E runs on that machine had ended 12 and 16 minutes earlier.
  - CI keeps no trace (BUG-328 keeps reports carrying Clerk tokens off CI), so which request failed is not known.

## Impact

**Users: none, for the traced cause.** `dev-browser-missing` exists only on Clerk development instances; production uses a production instance, which has no dev-browser token. The 2026-10-18 recurrence is not traced, so whether it shares that cause, and so whether users can meet it, is not yet known.

**Tests:** required E2E fails at random.
- On 2026-10-11 it failed twice for certain and once possibly in about two and a half hours, each time in `review-mode-audit.spec.ts` right after sign-in. Once was in CI and once locally for certain; the earlier CI failure, a question page waiting for radio D, is not shown to be the same, though it matches 2026-10-18's.
- On 2026-10-18, six days after option 9, it failed once in CI, in `history.spec.ts` on a question page.

How often it recurs after option 9 is not yet known.

*Corrected 2026-10-18: the impact now covers the recurrence after option 9, whose cause and rate are not yet known.*

**A separate helper weakness, fixed here.** The first failure on 2026-10-11 left a second lead. `submitQuestionForOutcome` (`tests/e2e/helpers/question.ts`) read its outcome with a page-wide `getByText(outcome, { exact: true }).isVisible()` that did not wait, and it treated a throw as "not this outcome". A second exact "Correct" on the page makes Playwright's strict mode throw, so a correct answer was skipped and the helper moved on to the next choice. It now reads the verdict pill it has already waited for (`readVerdict`, with a red test in `question.test.ts`). This does not explain the traced "Failed to fetch", which is the Clerk race below.

## Options

The first is now shown; the others are ruled out for the traced failure.

1. **A request redirected to another origin.** *Shown.* A server action or RSC request that Clerk's middleware answers with a handshake redirect to Clerk's domain fails as a CORS error, which the browser reports as "Failed to fetch". BUG-333 and BUG-330 show that Clerk session refreshes during E2E navigation are real.
2. **A request aborted by navigation.** The session page's client navigation cancels the in-flight question and bookmark fetches.
3. **The server dropped connections** under load, for example during a `next start` worker restart.

## Resolution (decided)

*Corrected 2026-10-18: option 9 did not end the failure. It recurred in CI six days after the merge (Evidence), and that request is not yet identified.*

Fixed with BUG-333's option 9 (2026-10-12). The cause is BUG-333's race with a second trigger: Clerk JS rewrites the dev-browser cookies after every environment fetch, which BUG-333's echo drop did not stop. A request that left inside the rewrite reached the server without the cookies. A server action was then answered with a redirect to Clerk, which the browser reports as "Failed to fetch", and a navigation landed on sign-in.

In every signed-in E2E test's pages, a script now holds each removal of the two cookies until the current script ends, and drops it if Clerk JS writes that cookie first, so a rewrite replaces them in place. A removal that no write follows still lands, and the page sees the cookie gone at once, so Clerk JS can still discard a dev browser it no longer accepts. BUG-333 records the tests and the experiment. Pinning Clerk JS would not have helped: 6.38.0 and 6.39.0 behave the same. Production is unaffected, because a production instance has no dev-browser token.

The diagnostic logging records names and lengths only, never values. It stays on a local branch and never ships.

## Verification

- [x] The failing request is identified, with its trace (2026-10-11): a server action answered 307, signed out with `dev-browser-missing`.
- [x] The cause is named (2026-10-12): requests caught on the server inside Clerk JS's dev-browser cookie rewrite, which follows every environment fetch.
- [x] A fix with a red test: BUG-333's option 9 (2026-10-12).
- [ ] A week of CI without "Failed to fetch" or a sign-in loss, after a fix that holds. Option 9's week failed on 2026-10-18.
- [ ] The 2026-10-18 recurrence's failing request is identified, from a local trace or a CI trace kept within the job.

## Related

- BUG-333 and BUG-330: Clerk session behaviour during E2E navigation.
- BUG-334: Next.js's E592 during E2E, not seen in this run.
