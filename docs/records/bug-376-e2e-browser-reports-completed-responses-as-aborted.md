# BUG-376: The E2E Browser Reports Some Completed Responses as Aborted

**Status:** Open — upgrade Playwright to 1.65.0 with a red-first regression contract once the release-age gate admits it (2026-11-12 20:17:41Z); due 2026-11-13
**Priority:** P3
**Date:** 2026-11-10

---

## Summary

E2E runs Playwright 1.64.1's bundled Chromium, 156.0.8078.4. That Chromium can report a request as failed with `net::ERR_ABORTED` after the page has read its whole response. The case is a `Cache-Control: no-store` response read through a stream reader, when the end of the body arrives separately from its last data, and Next.js server-action responses fit it. The server finished and the page got its result, so the app is unaffected. The tests are not:
- exam-timing's `BUG-337 evidence` lines name actions that succeeded, which made BUG-337's aborted reads look like an unexplained failure;
- exam-timing counts a timing read as successful only on `requestfinished`, so it fails when both of a session's timing reads are misreported, as it did on 2026-11-08.

Chromium fixed the defect upstream on 2026-10-06, first in 157. Playwright 1.65.0 bundles Chromium 158.0.8127.18, and the repository's seven-day release-age gate admits it on 2026-11-12.

## Evidence

- **The upstream defect.** [microsoft/playwright#42742](https://github.com/microsoft/playwright/issues/42742), opened 2026-09-16, reproduced it on Chromium 151, 153, 154 and 156, and Playwright's bot found that Firefox and WebKit report the same request finished. A Playwright maintainer filed Chromium issue 568852319 and wrote the fix, [Chromium change 8508456](https://chromium-review.googlesource.com/c/chromium/src/+/8508456), merged 2026-10-06 at main position 1712735.
  - **What it fixes.** When the end of a no-store body was signaled on its own, Chromium told the stream before recording that the body was done. The stream closed and cancelled the consumer, which was still loading. DevTools then got `Network.loadingFailed` with `net::ERR_ABORTED` and `canceled: true` instead of `loadingFinished`, and lost the response body.
  - **Which versions have it.** M156 branched at main position 1706539 and M157 at 1717349, and Gerrit shows no merge of the fix to a release branch, so 157 is the first milestone with it.
- **Why server actions meet it.** Next.js 16.4.3 answers every server action with `Cache-Control: no-cache, no-store, max-age=0, must-revalidate` (`next/dist/server/app-render/action-handler.js`), and the page reads the response with a stream reader, as the instrumented `getReader()` calls below show.
- **Reproduced against the app, 2026-11-10.** The setup was a production build of `dev` at 1fbe3940 on Playwright 1.64.1, with the page's fetch and stream reader instrumented, CDP's network events, and a server-side probe of each action's response. For eleven actions, the server finished the response, the page read it to the end, and CDP then reported `loadingFailed` with `net::ERR_ABORTED` and `canceled: true`:
  - **On the starter page:** `getIncompletePracticeSession`, `getTags`, `countAvailableQuestions`, `startPracticeSession` and, during sign-out, `invalidateCacheAction`.
  - **On the session page:** `getBookmarkQuestionIds`, `getPracticeSessionSummary`, `getNextQuestion`, `getPracticeSessionReview`, `getPracticeSessionTiming` and `finalizeExamAnswers`.
  - **No navigation is needed.** `startPracticeSession` was misreported on a page that did not navigate. Repeating the call with the same idempotency key returned the same session, and one session was created.
  - **Not Clerk, not Playwright.** The misreported responses answered 200 with no redirect. A synthetic page with no Clerk and no cookies showed the same, as did Chromium driven over raw CDP without Playwright.
  - **Ruled out:**
    - an AbortController, since the action fetches carry no signal;
    - a reader cancellation, since none was logged;
    - React or Next.js teardown, since this was a production build and the requests were action POSTs, not RSC prefetches;
    - Playwright's clock, routes and tracing, since the reproducing run used none of them;
    - a truncated response, since truncated controls fail with `net::ERR_CONTENT_LENGTH_MISMATCH` instead.
- **A minimal reproduction.** The server sends an 11-byte no-store JSON body in two writes, and the page reads it with `getReader()`. The table counts requests reported aborted, of 30 per encoding; the controls send the same bodies with a cacheable header.

  | Browser | Uncompressed | gzip | Brotli | Cacheable controls |
  | --- | --- | --- | --- | --- |
  | Chromium 156 headless shell, raw CDP | 19 | 13 | 2 | 0 of 90 |
  | Chromium 156 through Playwright | 13 | 16 | 0 | 0 of 90 |
  | Chrome 157.0.8103.39 | 0 | 0 | 0 | 0 of 90 |

  Every body arrived complete. An explicit abort and a reader cancellation still fail with `net::ERR_ABORTED` on both versions, so the fix does not hide real cancellations.
- **A CI failure with this pattern, 2026-11-08, #1653's first attempt.** exam-timing failed "At least one timing read in the session succeeds" (received 0), after both of its timing reads were logged `net::ERR_ABORTED`. That run has no page-side capture, so it is not proven to be this defect, but this defect produces exactly that failure. BUG-337's thirty-day census counted eight exam-timing failures with aborted timing reads.
- **A separate, genuine abandonment.** Starting a session leaves the starter page with a full navigation (`app/(app)/app/practice/client-navigation.ts`). In Chrome 157, a `countAvailableQuestions` sent 1 ms before `beforeunload` was dropped. The server closed it with nothing written, and CDP reported no terminal event, so Playwright sees it neither finish nor fail. The page no longer needed the count. This matches BUG-337's "hanging request" entry and is not this defect. Whether its database query finished is not established.

## Impact

**Users: none found.** Chrome 156 was the stable release from 2026-10-20 until 157 shipped on 2026-11-03. On it, a user's page still receives the full response; only DevTools shows the request as cancelled and loses its body.

**Tests:** required E2E can fail falsely in exam-timing, and its evidence lines name successful actions. Until the upgrade, a `BUG-337 evidence` abort line does not show that the action failed.

## Options

1. **Upgrade Playwright to 1.65.0 (Chromium 158).** This removes the cause. It waits only for the release-age gate: `playwright-core` 1.65.0, the last of the three packages, was published 2026-11-05 at 20:17:40.688Z, so the gate admits the set at 20:17:41Z on 2026-11-12. Keep the gate.
2. **Count exam-timing's timing reads by the page's own result.** This would stop the false failure without the upgrade, but it reshapes the test around a browser defect the upgrade removes two days later.
3. **Change the actions' cache headers, or ignore aborted requests.** Rejected: `no-store` is Next.js's default for actions, and ignoring aborts would also hide genuine cancellations.
4. **Run E2E on the installed Chrome (`channel: 'chrome'`).** Rejected: CI's browser would then follow the runner image rather than the lockfile.

## Resolution (decided)

Option 1, test-first, in one pull request:
1. **Red first.** Add a diagnostic contract to E2E that needs no app server and no Clerk. A local server sends a no-store JSON body in two writes, the page reads it with `getReader()`, and the test expects `requestfinished` for every one of 30 requests. An explicit-abort control must still fail. The contract fails on Playwright 1.64.1.
2. **The upgrade.** Upgrade `@playwright/test` to 1.65.0 with its lockfile entries; CI installs the browser the package names. The contract passes.
3. **exam-timing.** Its comment says timing reads are aborted "for a reason not yet known (BUG-337)"; name this cause instead. Its note that Chrome can discard a server action's body ("No data found for resource") describes the same lost body. Decide, from the upgrade's runs, whether one failed timing read should still be tolerated. Keep the evidence logging.
4. **If Dependabot's grouped update brings Playwright 1.65.0 first,** re-author it with the contract before it merges.

## Verification

- [x] The cause is reproduced against the app and in a minimal page, and matched to Chromium's fix (2026-11-10).
- [ ] The contract fails on Playwright 1.64.1.
- [ ] The contract passes on 1.65.0, with the full gate and E2E.
- [ ] The upgrade is promoted and main's CI passes the contract; then close.

## Related

- BUG-337: the aborted reads its evidence records, and the exam-timing failures its census counts.
- BUG-333: the focus-touch cookie race that BUG-337's 2026-10-20 entries suspected for an aborted timing read.
