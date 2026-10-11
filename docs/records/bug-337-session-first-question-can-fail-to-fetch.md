# BUG-337: A Session's First Question Can Fail to Load With "Failed to Fetch"

**Status:** Open — reproduce under CI load with request traces, and find which request fails; due 2026-10-14
**Priority:** P2
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

## Impact

A session or question page can show an error instead of the question. The learner recovers with Try again. That it happened twice in two hours on CI's runner, and never in local runs, suggests timing or load.

## Options

These are hypotheses to test, not fixes:

1. **A request redirected to another origin.** A server action or RSC request that Clerk's middleware answers with a handshake redirect to Clerk's domain fails as a CORS error, which the browser reports as "Failed to fetch". BUG-333 and BUG-330 show that Clerk session refreshes during E2E navigation are real.
2. **A request aborted by navigation.** The session page's client navigation cancels the in-flight question and bookmark fetches.
3. **The server dropped connections** under load, for example during a `next start` worker restart.

## Resolution (decided)

Investigate first: capture a Playwright trace with network entries for `review-mode-audit.spec.ts` on CI (kept local, as traces are). Repeat the spec under load until it fails, and record which request failed and its response or redirect. Then choose a fix, and file its verification here.

## Verification

- [ ] The failing request is identified, with its trace.
- [ ] A fix with a red test, or a reasoned no-fix with evidence.

## Related

- BUG-333 and BUG-330: Clerk session behaviour during E2E navigation.
- BUG-334: Next.js's E592 during E2E, not seen in this run.
