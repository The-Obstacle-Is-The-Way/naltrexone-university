# BUG-337: A Session's First Question Can Fail to Load With "Failed to Fetch"

**Status:** Open — on Playwright 1.64.1, trace the next CI failure and fix its cause; without one, require the clean-run count; due 2026-11-04
**Priority:** P3
**Date:** 2026-10-11

---

## Summary

In required E2E on CI, a practice session's page loaded, then its first question and the bookmarks panel both failed at once. The page showed its own error state, "Failed to fetch", with Try again. The 2026-10-11 local trace identified a server-action redirect blocked by the browser. The same alert recurred on a standalone question page on 2026-10-18 and in two practice-session tests on 2026-10-19. Those alerts alone do not identify the failed requests or their causes. Playwright 1.64.0 hides a redirected action when interception is enabled; upgrading restores diagnostic visibility, not authentication. The server logged nothing at that moment. The UI offers Try again. Whether the untraced recurrence can affect production is unknown.

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
  - a redirect that the browser cannot complete under CORS fails the fetch; crossing origins alone does not guarantee failure;
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
- **After option 9, in CI (2026-10-18 00:26Z, #1552's CI).** `history.spec.ts`, "shows missed questions and removes them after correct reattempt", failed while choosing C in the correct-answer loop, after earlier question visits (`history.spec.ts:51`; `question.ts:114`, `selectChoiceByLabel`). It was not the third question load in the whole test. The page snapshot shows the signed-in app shell, the question's alert "Failed to fetch" with Try again, and Submit disabled. The helper waited 30 s for radio C. So the 2026-10-11 question page that waited for radio D fits this failure too.
  - The page did not navigate to sign-in. Its already-rendered shell does not prove that the failed request remained authenticated; the capture neither confirms nor excludes BUG-333's cause.
  - The server logged nothing during the test's 36 s.
  - No application code changed in #1552: it changes CI's image pulls, and E2E reaches Postgres directly, not through the pooler. This narrows the suspect changes; it does not prove the CI environment had no effect. The same head passed the full local E2E.
  - Not an overlap: no other CI run was active in this repository, and the local E2E runs on that machine had ended 12 and 16 minutes earlier.
  - CI keeps no trace (BUG-328 keeps reports carrying Clerk tokens off CI), so which request failed is not known.
- **First session load, 2026-10-19 01:36:44Z, #1556's CI.** `practice.spec.ts:381` called `startSession(page, 'exam', 2)` and waited 15 seconds for "Exam Session". The snapshot shows "Tutor Session", "Failed to fetch" and Try again. `practice-session-page-view.tsx:242–243` falls back to tutor until `sessionInfo` arrives; this heading is evidence of the failed first load, not an exam becoming a tutor session. The other 62 tests passed. This head changed scripts and docs only. No overlap was reported; the server logged no error for the failure.
- **Timing refresh, 2026-10-19 06:43:05Z, #1561's CI — confounded.** The 72-second exam test at `exam-timing.spec.ts:13` installed a clock 20 seconds ahead mid-page, then dispatched focus. Its timing-action POST response waiter never resolved before the 180-second test limit. The snapshot shows "Failed to fetch", 0:00 and "Time is up. Submitting your exam." Finalization did not recover the session. The other 63 tests passed. No overlap was reported; the server logged no error for the failure. Installing Playwright's clock mid-page changes Date and restarts performance.now while timers continue in real time; Clerk also sees the focus event. This is a confounded recurrence, not evidence of the same cause. #1561 subsequently moved clock installation before page load and made the waiter end on request failure. This branch does not yet contain that spec.

### Redirect visibility, checked 2026-10-19

A controlled probe used a same-origin POST with a Next-Action header and a real 307 to another local origin refusing CORS. The owner supplied its four version/interception results; the prior local full runs independently caught the 1.64.0 intercepted failure. The upstream mechanism is [microsoft/playwright#43242](https://github.com/microsoft/playwright/issues/43242).

| Playwright / bundled Chromium | Interception | Observed events |
| --- | --- | --- |
| 1.63.0 / 153 | Absent or present | Response 307, then redirect-target requestfailed with `net::ERR_FAILED` |
| 1.64.0 / 156 | Absent | Response 307, then redirect-target requestfailed with `net::ERR_FAILED` |
| 1.64.0 / 156 | Any route registered | Original action requestfailed with `net::ERR_ABORTED`; no 307 event; target never contacted |

The page sees "Failed to fetch" in all four cases. `clerk-dev-browser-echo.ts:35–52` registers a context route in signed-in tests, so their redirected actions have the same visibility gap. The recorder cannot recover a response event Playwright never emits. This does not explain why Clerk redirected any application request.

On 2026-10-19, the standalone two-server contract on 1.64.0 failed with the echo-shaped context route (`requestfailed POST /trace-action net::ERR_ABORTED`, no redirect line), but passed 2/2 with only that route removed, isolating microsoft/playwright#43242; the contract is expected to pass on 1.64.1.

[Upstream #43249](https://github.com/microsoft/playwright/pull/43249) disables the Chromium feature responsible. The npm registry, read 2026-10-19, dates 1.64.1 packages on 2026-10-14: `playwright` at 11:54:49.998Z, `playwright-core` at 11:54:58.323Z and `@playwright/test` at 11:58:13.696Z. The seven-day release-age gate therefore admits the full package set on 2026-10-21 at 11:58:14Z; keep the gate. The contract now uses two local HTTP servers and an unrelated context route matching the echo filter's shape. It must remain failing on 1.64.0 and pass on 1.64.1 before claiming redirect wiring works. BUG-337 first failed on 2026-10-11, so this upgrade cannot be its original fix.

*Corrected 2026-10-19: the npm package timestamps require waiting until 11:58:14Z, later than the proposed 11:51Z. GitHub's release timestamp is 11:51:33Z; pnpm uses npm package timestamps. The earlier fixture comment blamed `route.fulfill`. A real HTTP redirect fails too. The confirmed condition is Chromium's redirect handling with any route registered, not the response's source.*

### Accepting cross-origin redirects: not established

On 2026-10-19, a read-only scan of the previous interrupted full run's 42 retained network chunks found 197 Clerk `/v1/` entries. Thirteen redirects were GET document handshakes back to the app, not preflighted fetches. Of 92 browser fetch entries, 46 were GETs without Content-Type and 46 were form POSTs with `application/x-www-form-urlencoded`; 69 answered 200 and 23 lacked a completed response. No fetch response showed a redirect to an accepting target. The remaining entries came from the helper's API requests. These are retained entries from an interrupted run, not a complete traffic census or 23 product failures.

The echo filter uses `route.fetch()` and then fulfills the browser request (`clerk-dev-browser-echo.ts:43–48`). Installed Playwright delegates this to its API request context and follows up to 20 redirects by default (`coreBundle.js:61235–61238`, `27742`). That can hide intermediate upstream redirects from browser events. The observed fetch methods and content types do not establish a preflighted redirect; the trace cannot prove absence either. [microsoft/playwright#43332](https://github.com/microsoft/playwright/issues/43332) describes a redirected CORS media request losing Origin, but no corresponding media path or accepting redirect was found here. Do not add option 4 without a concrete request/redirect receipt.

## Impact

**Users: the traced cause is specific to Clerk development instances.** The backend guards `dev-browser-missing` by instance type; it does not apply to a Clerk production instance. The three recurrences are not traced, so whether they share that cause, and so whether users can meet them, is not yet known.

**Tests:** required E2E can fail without identifying the failed request. The 2026-10-11 captures preceded option 9; the three recurrences above followed it.

### Required CI E2E frequency, counted 2026-10-19

The cutoff is 2026-10-19 15:10:20Z. Count completed `CI` workflow `E2E smoke` executions by run ID and attempt, assigning each by its step start time. Include earlier failed attempts even when a rerun passed. Exclude skipped steps, workflows that never reached E2E, the separate hosted-Stripe lane and one canceled E2E execution. Every completed non-successful E2E attempt in these windows was inspected: all three had a failed-test `error-context.md` containing "Failed to fetch". Passing step conclusions establish no failed tests, not absence of every background fetch rejection. Run/attempt and head receipts belong in the PR description.

| UTC window | Completed required E2E attempts | Failed tests showing "Failed to fetch" |
| --- | --- | --- |
| Option 9 merge, 10-13 07:45:35, to the requested 10-15 10:38 boundary | 68 | 0 |
| Requested 10-15 10:38 boundary to cutoff | 99 | 3 (3.03%); excluding the confounded attempt, 2/98 (2.04%) |
| Option 9 merge to the verified main promotion, 10-15 15:44:17 | 71 | 0 |
| Verified main promotion to cutoff | 96 | 3 (3.125%); excluding the confounded attempt, 2/95 (2.11%) |

*Corrected 2026-10-19: 10:38 was the bundle commit's Eastern time, not its main promotion in UTC. The bundle was committed at 14:38:36Z, merged in #1522 at 15:30:45Z, and promoted in #1523 at 15:44:17Z. Both requested and corrected windows are shown.*

These are calendar-window rates across different PR heads, not randomized browser-version comparisons. They do not prove that 1.64.0 caused the recurrences. Use the more conservative unconfounded requested-window rate, `p = 2/98`, for a clean-run threshold: `ceil(3/p) = 147` consecutive required CI E2E runs over at least seven days. The corrected promotion window would require 143; including the confounded failure would require only 99 or 96. Keep 147. This is the approximate 95% rule-of-three criterion, assuming comparable independent runs, not proof that an unknown cause is gone.

*Corrected 2026-10-19: replace the unknown recurrence rate and the one-week-only check with an attempt-inclusive CI census, a separate clock-confounded result and an explicit clean-run threshold.*

**A separate helper weakness, fixed 2026-10-11.** The first failure on 2026-10-11 left a second lead. `submitQuestionForOutcome` (`tests/e2e/helpers/question.ts`) read its outcome with a page-wide `getByText(outcome, { exact: true }).isVisible()` that did not wait, and it treated a throw as "not this outcome". A second exact "Correct" on the page makes Playwright's strict mode throw, so a correct answer was skipped and the helper moved on to the next choice. It now reads the verdict pill it has already waited for (`readVerdict`, with a red test in `question.test.ts`). This does not explain the traced "Failed to fetch", which is the Clerk race below.

## Audit, 2026-10-18

Historical captures above are preserved evidence. This audit re-read the current code, #1552's failed CI log and its error-context artifact; it did not re-create the earlier local captures.

| Claim | Finding and receipt |
| --- | --- |
| This captured alert came from the question-load path. | **Verified.** `question-page-client.tsx:331–340` renders `loadState.message`; `question-page-logic.ts:162–193` sets it from a rejected `getQuestionBySlug` call or an unsuccessful action result. `use-question-page-model.ts:145–169` supplies the server action and starts the load. The helper failed before submitting C (`question.ts:114`, `selectChoiceByLabel`); submit failures can also set this shared alert, but not at that step. This load is not an explicit REST fetch or the navigation's RSC request. |
| The alert alone proves a network failure. | **Unverified.** `error-message-helpers.ts:7–20` forwards returned or thrown messages. Next 16.4.1's `server-action-reducer.js:75–100` sends the action with fetch and rethrows rejection. A blocked CORS redirect, network interruption or aborted request can fail a fetch; ordinary HTTP error status is not itself a fetch rejection. The recurrence has no request capture. |
| Navigation cancels this load by design. | **Unverified.** `loadQuestion` uses `withTimeout`, which races promises without aborting (`lib/with-timeout.ts:10–16`). The page model suppresses stale and unmounted results (`use-question-page-model.ts:158–161`; `question-page-logic.ts:171–185`). The action fetch supplies no AbortSignal; Next's separate RSC fetch accepts one. Capture the failed request before changing cancellation behavior. |
| Option 9 covers only the environment event. | **Disproved.** `clerk-dev-browser-cookies.ts:42–75` intercepts every matching `document.cookie` removal and cancels it when a replacement arrives before its queued microtask. An unpaired removal still lands; HTTP Set-Cookie and another execution context are outside this setter. |
| Clerk only removes these cookies during refresh. | **Disproved.** Clerk JS 6.39.0's `core/auth/cookies/devBrowser.ts:49–71` removes both copies in the setter and exposes removal alone. `AuthCookieService.ts:125–127` clears an unauthenticated dev browser before setup. The keeper's discard test preserves that behavior. This is not evidence that the recurrence used it, or that the floating CDN still serves 6.39.0. |
| The traced dev-browser cause applies to production instances. | **Disproved.** The current lockfile resolves `@clerk/backend` 3.23.1; its `authenticateRequestWithTokenInCookie` checks `instanceType === "development"` before `DevBrowserMissing`. The earlier 3.22.0 receipt is historical. This does not establish the recurrence's production impact. |
| The pre-change CI diagnostics identify the recurrence. | **Disproved.** Before this change, `clerk-auth-trace.ts` recorded Clerk API and main-frame navigation answers, then printed only on sign-in. It omitted failed requests and action/RSC answers. `playwright.config.ts:40` disables CI traces under BUG-328. |

*Corrected 2026-10-18: the question load is a server action; a visible signed-in shell is not request authentication evidence; the C failure is the third choice in a later loop, not the test's third load. Cross-origin redirects are not inherently fetch failures, and option 9 covers synchronous rewrites regardless of trigger.*

## Options

For the recurrences after option 9, all three remain unverified:

1. **A browser-blocked cross-origin redirect.** Identify its originating action or RSC request, Clerk status/reason, redirect host and timing. A `dev-browser-missing` reason would reopen the cookie-gap investigation; it would not by itself identify a third trigger.
2. **An aborted request.** Correlate the failure with navigation and page teardown. Fix the test helper if it abandons work it needs; fix the client only if it displays an error for work it intentionally abandoned.
3. **A dropped connection or another cause.** Identify the failing request and transport error, then determine whether production shares the cause.

## Resolution (decided)

Trace the recurrence before choosing another fix. After this diagnostics PR merges, keep BUG-337 Open, not Verifying: no new fix has landed. Upgrade to Playwright 1.64.1 only after its release-age gate opens, in a separate dependency commit. That restores visibility and is not a BUG-337 fix. The status deadline is provisionally 2026-11-04 for a 2026-10-21 merge; update it to the actual merge date plus 14 days before merging. The existing Clerk trace now records failed requests, action/RSC redirects and event times. Sign-in and "Failed to fetch" alerts each report once, so an alert cannot suppress a later sign-in. A failed test reports before teardown only if neither already reported. The buffer holds 100 entries, preserving the leading Clerk answer and action failure through a 60-answer burst. Diagnostic reads share BUG-330's five-second limit and report when it expires.

Keep method, safe path, resource type, action-header presence, status/reason, redirect host and cookie names/lengths. Strict allowlists retain Clerk reason names, numeric `__client_uat` and redirect counts, and the session JWT's numeric `iat`/`exp`. Arbitrary values are reduced to lengths. Credential values, action IDs, other query values and bodies never enter the output. CI's Playwright trace remains off. `tests/clerk-auth-fixture-policy.test.ts` rejects signed-in specs that use Playwright's base test instead of `./helpers/clerk-auth-test`. It recognizes either the password helper or shared auth-state marker. On the next sync, convert #1561's exam-timing spec if it still uses the base test; keep its clock correction.

**Cookie evidence has a limit.** In the installed Playwright 1.64.0, Chromium's `CRNetworkManager._onLoadingFailed` calls `setRawRequestHeaders(null)` when no response exists; `Request.setRawRequestHeaders` falls back to provisional headers when raw headers have not already arrived. Those headers omit Cookie. Failed-request lines explicitly report cookies unavailable, not cookies absent. For a failed redirected fetch, only its redirect response line's request-cookie fields can show what was sent; an unavailable field proves nothing. The context snapshot is the jar at report time. A server-side comparison is still needed if the evidence conflicts.

*Corrected 2026-10-18: preserve BUG-333's later sign-in report, bound diagnostic waits, distinguish provisional headers from wire evidence, restore allowlisted reason names and times, and retain a full navigation burst. The C-selection receipt is `question.ts:114` in this checkout.*

BUG-333's option 9 fixed the demonstrated 2026-10-12 synchronous cookie rewrite. Keep it and the echo filter unchanged until a new capture proves what needs changing. Pinning Clerk JS remains DEBT-521's owner decision.

*Corrected 2026-10-18: option 9 did not end the symptom. The earlier cause is proven only for its captures; it does not resolve the untraced recurrence.*

A temporary server diagnostic, if needed to compare the browser's provisional headers with the wire, records names and lengths only. It stays local and never ships.

## Verification

- [x] The failing request is identified, with its trace (2026-10-11): a server action answered 307, signed out with `dev-browser-missing`.
- [x] The cause is named (2026-10-12): requests caught on the server inside Clerk JS's dev-browser cookie rewrite, which follows every environment fetch.
- [x] A fix with a red test: BUG-333's option 9 (2026-10-12).
- [x] Safe diagnostics, test-first (2026-10-18): request failure and redirect projections omit credential and action values; allowlisted reason names and numeric times remain; event times survive asynchronous header reads. Existing cookie and query formatters failed negative controls before correction. The cookie keeper and echo filter are unchanged.
- [x] Signed-in fixture coverage is executable, test-first (2026-10-19): unsafe synthetic imports and nested-spec discovery failed before the guard; this branch's specs pass.
- [ ] On Playwright 1.64.1, the two-server redirect contract passes with interception enabled, and the full required E2E run proves both diagnostic tests. Keep this unchecked on 1.64.0.
- [ ] The next CI recurrence supplies the failing request and Clerk's reason. Its trace becomes the next action. Keep local Playwright traces private; publish only sanitized text. Focused local repeats can capture evidence but add nothing to the CI clean-run count.
- [ ] Close as Resolved only after a traced failure names Clerk's reason and a fix for that cause lands with a failing test first, is promoted where applicable, and passes its stated verification. This diagnostics PR leaves the record Open.
- [ ] Without a recurrence, consider closure only after **147 consecutive required CI E2E runs over at least seven days after this PR merges** (`N ≥ 3/p`, with `p = 2/98`). A recurrence resets the count and makes its trace the next action; canceled, skipped and local runs do not count as clean CI runs. Any closure on this basis must explicitly say **the cause was never found**.

## Related

- BUG-333 and BUG-330: Clerk session behavior during E2E navigation.
- BUG-334: Next.js's E592 during E2E, not seen in this run.
