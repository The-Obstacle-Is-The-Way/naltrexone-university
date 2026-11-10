# BUG-376: The E2E Browser Reports Some Completed Responses as Aborted

**Status:** Open — upgrade Playwright to 1.65.0 with a red-first regression contract once the release-age gate admits it (2026-11-12 20:17:41Z); due 2026-11-13
**Priority:** P3
**Date:** 2026-11-10

---

## Summary

E2E runs Playwright 1.64.1's bundled Chromium, 156.0.8078.4. That Chromium can report a request as failed with `net::ERR_ABORTED` after the page has read its whole response. The case is a `Cache-Control: no-store` response read through a stream reader, when the end of the body arrives separately from its last data. Next.js server-action and RSC responses fit it. The server finished and the page got its result, so the app is unaffected. The tests are not:
- every listener built on Playwright's `requestfailed` can name a request that succeeded: exam-timing's `BUG-337 evidence` lines, the failed server actions `startSession` adds to its error, and the Clerk trace's failed-request lines. This made BUG-337's aborted reads look like an unexplained failure;
- exam-timing counts a timing read as successful only on `requestfinished`, so this defect fails the test when both of a session's timing reads are misreported. It failed that way on 2026-11-08, with no capture to prove the cause.

Chromium fixed the defect upstream on 2026-10-06, first in 157. Playwright 1.65.0 bundles Chromium 158.0.8127.18, and the repository's seven-day release-age gate admits it on 2026-11-12.

## Evidence

- **The upstream defect.** [microsoft/playwright#42742](https://github.com/microsoft/playwright/issues/42742), opened 2026-09-16, reproduced it on Chromium 151, 153, 154 and 156, and Playwright's bot found that Firefox and WebKit report the same request finished. A Playwright maintainer filed Chromium issue 568852319 and wrote the fix, [Chromium change 8508456](https://chromium-review.googlesource.com/c/chromium/src/+/8508456), merged 2026-10-06 at main position 1712735.
  - **What it fixes.** When the end of a no-store body was signaled on its own, Chromium told the stream before recording that the body was done. The stream closed and canceled the consumer, which was still loading. DevTools then got `Network.loadingFailed` with `net::ERR_ABORTED` and `canceled: true` instead of `loadingFinished`, and lost the response body. The change fixes the same report for an empty body the page never read, and notes that an errored body was reported as canceled the same way.
  - **Which versions have it.** M156 branched at main position 1706539 and M157 at 1717349, and Gerrit shows no merge of the fix to a release branch, so 157 is the first milestone with it.
- **Why the app's requests meet it.** Next.js 16.4.3 answers server actions with `Cache-Control: no-cache, no-store, max-age=0, must-revalidate` (`next/dist/server/app-render/action-handler.js`) and dynamic RSC requests with `private, no-cache, no-store, …` (`next/dist/server/base-server.js`). Its router reads RSC responses with `body.getReader()` (`fetch-server-response.js`), and the page read action responses through a stream reader in the reproduction below. RSC requests were not instrumented there.
- **Reproduced against the app, 2026-11-10.** A production build of `dev` on Playwright 1.64.1, with the page's fetch and stream reader instrumented, CDP's network events, and a server-side probe of each action's response. For eleven actions, the server finished the response with status 200 and no redirect, the page read it to the end, and CDP reported `loadingFailed` with `net::ERR_ABORTED` and `canceled: true` within the same millisecond:
  - **On the starter page:** `getIncompletePracticeSession`, `getTags`, `countAvailableQuestions`, `startPracticeSession` and, during sign-out, `invalidateCacheAction`.
  - **On the session page:** `getBookmarkQuestionIds`, `getPracticeSessionSummary`, `getNextQuestion`, `getPracticeSessionReview`, `getPracticeSessionTiming` and `finalizeExamAnswers`.
  - **No navigation is needed.** A probe called `startPracticeSession` on a page that did not navigate, and it was misreported. Repeating the call with the same idempotency key succeeded, and exactly one session was created. These were probe-issued calls, not the app's own flow.
  - **Not Clerk, not Playwright.** A synthetic page with no Clerk and no cookies showed the same, as did Chromium driven over raw CDP without Playwright.
  - **Ruled out:**
    - an AbortController, since the action fetches carry no signal;
    - a reader or stream cancellation, since none was logged on an action's response stream;
    - a truncated or errored body, since every listed read ended `done` with no rejection;
    - Playwright's clock, routes and tracing, since the reproducing run used none of them.
- **A minimal reproduction.** The server answers with a 16,012-byte text body in two parts, 2 ms apart, and the page reads it with `getReader()`. The table counts requests reported aborted, of 30 per encoding, with every body complete. The controls send the same bodies with a cacheable header.

  | Browser | Uncompressed | gzip | Brotli | Cacheable controls |
  | --- | --- | --- | --- | --- |
  | Chromium 156 headless shell, raw CDP | 19 | 13 | 2 | 0 of 90 |
  | Chromium 156 through Playwright | 13 | 16 | 0 | 0 of 90 |
  | Chrome 157.0.8103.39 | 0 | 0 | 0 | 0 of 90 |

  A separate 11-byte JSON prototype showed that an explicit abort and a reader cancellation still fail with `net::ERR_ABORTED` on both versions, so the fix does not hide real cancellations.
- **A deterministic contract, 2026-11-10.** `tests/e2e/browser-stream-completion.spec.ts` follows the upstream regression test: the server sends each part of a no-store JSON body only after the page has read the one before it, so the end of the body always arrives on its own. A canceled read is its control. On Playwright 1.64.1's Chromium 156.0.8078.4 it failed 3 of 3 runs, the page holding the whole body while Playwright reported `requestfailed: net::ERR_ABORTED`; on Chrome 157.0.8103.39 it passed 3 of 3. The control passed on both.
- **A CI failure with this pattern, 2026-11-08, #1653's first attempt.** exam-timing failed "At least one timing read in the session succeeds" (received 0), after both of its timing reads were logged `net::ERR_ABORTED`. That run has no page-side capture, so it is not proven to be this defect, but this defect produces exactly that failure. BUG-337's thirty-day census counted eight exam-timing failures with aborted timing reads.
- **A separate, genuine abandonment.** Starting a session leaves the starter page with a full navigation (`app/(app)/app/practice/client-navigation.ts`). In Chrome 157, a `countAvailableQuestions` sent 1 ms before `beforeunload` was dropped. The server closed it with nothing written, and CDP reported no terminal event, so Playwright would see it neither finish nor fail. The page no longer needed the count. This was not observed on Chromium 156 under Playwright, and it is not this defect. Whether its database query finished is not established.

## Impact

**Users: no effect on the page found.** Chromium before 157 has the defect (reproduced on 151, 153, 154 and 156), so it reached users of Chrome 156, stable from 2026-10-20 until 157 shipped on 2026-11-03, and still reaches lagging installs and other Chromium-based browsers. On it, the page still receives the full response. The misreport was seen only through DevTools and CDP, which also lose the body; other observers, such as Resource Timing, were not checked.

**Tests:** required E2E can fail falsely in exam-timing, and failed-request diagnostics can name successful requests. Until the upgrade, an `ERR_ABORTED` line for an action or RSC request does not show that it failed. A redirect status or Clerk reason in the same line still marks a real failure.

## Options

1. **Upgrade Playwright to 1.65.0 (Chromium 158).** This removes the cause. It waits only for the release-age gate: `playwright-core` 1.65.0, the last of the three packages, was published 2026-11-05 at 20:17:40.688Z, so the gate admits the set at 20:17:41Z on 2026-11-12. Keep the gate.
2. **Count exam-timing's timing reads by the page's own result.** This would stop the false failure without the upgrade, but it reshapes the test around a browser defect the upgrade removes.
3. **Change the actions' cache headers, or ignore aborted requests.** Rejected: `no-store` is Next.js's default for these responses, and ignoring aborts would also hide genuine cancellations.
4. **Run E2E on the installed Chrome (`channel: 'chrome'`).** Rejected: CI's browser would then follow the runner image rather than the lockfile.

## Resolution (decided)

Option 1, test-first, in one pull request with this record:
1. **Red first.** The contract above fails on Playwright 1.64.1.
2. **The upgrade.** Upgrade `@playwright/test` to 1.65.0 with its lockfile entries; CI installs the browser the package names. The contract passes.
3. **exam-timing.** Its comment says timing reads are aborted "for a reason not yet known (BUG-337)"; name this cause instead. Its note that Chrome can discard a server action's body ("No data found for resource") describes the same lost body. Decide, from the upgrade's runs, whether one failed timing read should still be tolerated. Keep the evidence logging.
4. **If Dependabot's grouped update brings Playwright 1.65.0 first,** re-author it with the contract before it merges.
5. **If the upgrade cannot merge by 2026-11-17,** because 1.65.0 regresses or review is delayed, revisit Option 2.

## Verification

- [x] The cause is reproduced against the app and in a minimal page, and matched to Chromium's fix (2026-11-10).
- [x] The contract fails on Playwright 1.64.1 and passes on Chrome 157 (2026-11-10, locally).
- [ ] The contract passes on Playwright 1.65.0, with the full gate and E2E.
- [ ] The upgrade is promoted and main's CI passes the contract; then close.

## Related

- BUG-337: the aborted reads its evidence records, and the exam-timing failures its census counts.
- BUG-333: the focus-touch cookie race that BUG-337's 2026-10-20 entries suspected for an aborted timing read.
