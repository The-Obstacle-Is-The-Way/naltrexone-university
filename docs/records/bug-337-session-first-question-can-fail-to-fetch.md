# BUG-337: A Session's First Question Can Fail to Load With "Failed to Fetch"

**Status:** Open — E2E's `__client_uat` keeper is a mitigation; close after 178 consecutive clean required CI E2E runs (58 by 2026-11-15); due 2026-12-01
**Priority:** P3
**Date:** 2026-10-11

---

## Summary

In required E2E on CI, a practice session's page loaded, then its first question
(or a standalone question's choices) failed with the page's own error state,
"Failed to fetch", with Try again. The traced cause is specific to Clerk's
development instance: requests carrying a live session token arrived with a
signed-out `__client_uat` of "0", and Clerk's middleware answered with a
cross-origin handshake redirect that the page's fetch could not complete.

Clerk JS writes that cookie from the page only on development instances, so
production does not take this path. What leaves Clerk JS with a client that has
no signed-in session while the session is live was never reproduced. Since
2026-11-08, E2E keeps the signed-in value while a session cookie is present, a
mitigation that a clean-run count in CI judges.

## Evidence

- **Frequency.** A census of required CI E2E from 2026-10-09 to 2026-11-08 found
  this page error in 10 of 593 completed executions (1.69%), the last on
  2026-10-24. That rate sets the closing threshold.
- **The signature,** from the first traced recurrence (2026-10-22, #1591's CI)
  and three later traces (2026-10-23 twice, 2026-10-24):
  - a test's navigation left a page after its Clerk JS received
    `/v1/environment` and before `/v1/client` answered;
  - about 320 ms after the new document, its first server action and its RSC
    prefetches went out with both `__client_uat` cookies "0" beside a live
    `__session`, while the cookie jar held a numeric value before and after;
  - each drew a 307 to Clerk's development host, `auth=signed-out
    reason=session-token-but-no-client-uat`, and failed there with
    `net::ERR_FAILED`, which the page reports as "Failed to fetch".
- **The writer.** In Clerk JS 6.40.0 through 6.41.0, read on 2026-11-08,
  `setClientUatCookieForDevelopmentInstances()` is the only code that writes
  these cookies from the page. It runs at load, after each environment fetch,
  each token update and sign-out, only on a non-production instance, and writes
  "0" when the client has no active or pending session.
- **Not reproduced.** Three local probes on 2026-11-08 (a held `/v1/client`, a
  failed one, and the census's navigation precondition, 26 of 26 runs) left both
  cookies numeric.
- **Earlier captures** (2026-10-11 and 12) had a different trigger,
  `dev-browser-missing`, from Clerk JS's dev-browser cookie rewrite. BUG-333's
  option 9 fixed it.
- **Aborted reads are not this bug.** Read actions that end `net::ERR_ABORTED`
  around a navigation also appear in passing runs; BUG-376 found the E2E
  browser can report a completed response as aborted.

## Impact

- **Users:** none known. The traced trigger needs a development instance.
- **Tests:** a required E2E run can fail on it.

## Options

1. Reproduce the "0" locally, then fix the window test-first. Tried; not
   reproduced.
2. Keep the signed-in value in E2E, and let CI's clean-run count judge it.
   Chosen.

## Resolution (decided)

**2026-11-08: mitigate in E2E.** `tests/e2e/helpers/clerk-client-uat-cookie.ts`,
installed beside BUG-333's cookie keeper, ignores each removal of a
`__client_uat` cookie, and each "0" written to one, while a session cookie is
present. Its unit test failed first. `signOut()` removes the session cookie
before it writes "0", so sign-out still works. A session that ends another way
keeps its old value until its token expires, and the server then answers
`session-token-expired-*`; no E2E flow ends a session that way.

**Reading a recurrence.** On a page error, the E2E trace prints
`[E2E_CLERK_AUTH_TRACE]` (`tests/e2e/helpers/clerk-auth-trace.ts`) with each
failed request, redirect status, Clerk reason and numeric `__client_uat`;
`startSession`'s error names the failed actions. A "0" means another writer; a
numeric value with `session-token-but-no-client-uat` means another trigger;
`session-token-expired-*` may be this trigger, held by the keeper. A failed
request's cookie fields can be unavailable, which proves nothing; only its
redirect's response line shows what was sent.

Reporting the behavior to Clerk stays the owner's call, as for BUG-333.

## Verification

- [x] The trigger is traced (2026-10-22): a server action and four RSC fetches
      answered 307 with `session-token-but-no-client-uat`.
- [x] The keeper lands with a failing test first (2026-11-08, #1655).
- [ ] **No page error in 178 consecutive required CI E2E runs over at least
      seven days after the keeper** (`N ≥ 3/p`, `p = 10/593`). By 2026-11-15:
      58 clean executions from 2026-11-08 23:22Z, all passed, with no "Failed
      to fetch" and no `[E2E_CLERK_AUTH_TRACE]` in their logs. At about eight
      a day, 178 arrives around 2026-11-30.
  - Count only `CI` workflow executions whose E2E step ran and whose tested
    revision contains the keeper (a5795c0f). Skipped, canceled and local runs
    do not count, nor does one whose signed-in tests did not run.
  - A recurrence resets the count, and its trace is the next action. An aborted
    read without the page error does not reset it.
  - **Closing:** close as Resolved, and say that **the cause was never found**.
    The count cannot separate the keeper from Clerk JS's releases since 6.41.0
    (6.42.0 to 6.43.1 by 2026-11-15), which the app loads from Clerk's CDN as
    `@6`; the closure cites both.

## Related

- BUG-333: Clerk JS's dev-browser cookie race and its keeper.
- BUG-330: E2E's testing token.
- DEBT-521: Clerk JS stays floating (decided 2026-11-15).

Corrected 2026-11-15: counted the clean runs after the keeper (58 by 2026-11-15); Clerk JS had moved past 6.41.0; DEBT-521 decided to keep Clerk JS floating. Finished investigation history, the censuses, the Playwright 1.64 redirect study and the 2026-10-18 audit are in git at 34d9aea0.
