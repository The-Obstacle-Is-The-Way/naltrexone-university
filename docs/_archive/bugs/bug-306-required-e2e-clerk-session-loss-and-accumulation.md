# BUG-306: Required E2E Can Lose Clerk Session and Accumulates Sessions

**Status:** Resolved 2026-08-28 — cause unproven; mitigation verified
**Severity:** P3
**Date:** 2026-08-25
**Confirmed:** 2026-08-25 (required-E2E first attempt redirected a freshly signed-in test to Clerk; the suite-wide session leak and diagnostic hang are independently reproducible)
**Component:** Required E2E / Clerk authentication / Playwright lifecycle

---

## Summary

The local full gate on `fix/bug-304-navigation-event-wait` failed the first
attempt of `tests/e2e/session-review-navigation.spec.ts`, case **Session Summary
→ sequential review with prev/next navigation**. Global setup and the test's
Clerk sign-in succeeded, **Start session** was clicked, and the next protected
navigation reached Clerk's hosted sign-in page instead of the practice session.
The retry passed, producing the misleading aggregate `1 flaky` / `41 passed`.

The intermittent session loss did not reproduce in eleven retry-free executions
of the exact case, so its root cause is not established. Two adjacent defects
are established:

1. The E2E suite called `signInWithClerkPassword()` 47 times across 14 spec
   files and never signed out. A read-only TEST-instance census found 70,403
   sessions for the one shared test user: 4,684 active and 65,719 expired.
2. After the redirect removed the practice starter, the helper's diagnostic
   `Start session` locator probe had no bound. It consumed the remainder of the
   case's 180-second timeout and hid the auth redirect behind a bare timeout.

Clerk recommends authenticating once and reusing Playwright `storageState`, and
warns E2E suites that repeatedly sign in the same user to control session
lifetime. Playwright separately treats stored auth state as sensitive and
supports project teardown after dependent projects.
([Clerk authenticated flows](https://clerk.com/docs/guides/development/testing/playwright/test-authenticated-flows),
[Clerk session options](https://clerk.com/docs/guides/secure/session-options),
[Playwright authentication](https://playwright.dev/docs/auth),
[Playwright teardown](https://playwright.dev/docs/test-global-setup-teardown))

## Incident Evidence

- The failed first attempt began at 2026-08-26 01:06:07Z. Clerk reported an
  active session by 01:06:09Z and the helper clicked **Start session** at
  01:06:10Z.
- The page then committed to hosted Clerk sign-in with the local practice route
  as its return target. No secret, session identifier, provider identifier, or
  full credential-bearing URL is reproduced here.
- The outcome poll expired after its 20-second bound. Its catch path then called
  `startSessionButton.isEnabled()` on a locator that no longer existed and
  consumed the rest of the test's 180-second budget.
- The first-attempt `error-context.md` shows the Clerk sign-in page. The
  preserved `trace.zip` belongs to the passing retry because the configuration
  was `trace: 'on-first-retry'`; it cannot prove the failed attempt's network
  cause.
- The original artifacts were copied out of the working tree before subsequent
  runs. Their stable relative paths are
  `test-results/session-review-navigation--8f59c-w-with-prev-next-navigation-chromium/error-context.md`
  and the corresponding retry directory's `trace.zip`.

This was not a database crash. The isolated Postgres logs show it remained
healthy throughout the original 01:06Z failure and was explicitly stopped by a
separate command only at 01:18Z.

## Characterization

An initial ten-repeat attempt is invalid as Clerk evidence: a separate process
explicitly stopped the healthy Docker database, so all ten cases failed with
connection refusal. Those failures are retained as an orchestration observation
but are excluded from the reproduction count.

After restarting the isolated database:

| Run | Configuration | Result | Wall time |
| --- | --- | --- | --- |
| Exact case | Chromium, retries 0, trace on | setup + case passed (2/2) | 31.1 s |
| Ten repeats | Chromium, retries 0, trace on, stop after first failure | setup + ten cases passed (11/11) | 2.0 min |
| Post-fix exact case | Chromium, retries 0, trace on, teardown enabled | setup + case + cleanup passed (3/3) | 32.1 s |

The database stayed healthy throughout the valid characterization. No failing
trace exists, so neither session volume nor any specific Clerk transition is
claimed as the cause of the original redirect.

## Root-Cause Boundary

The following are proven:

- a fresh client session was active before the failing protected navigation;
- that navigation redirected to hosted sign-in;
- repeated per-test sign-in created unbounded TEST-instance session churn;
- the suite had no sign-out lifecycle; and
- an unbounded diagnostic locator call transformed the auth redirect into a
  180-second timeout.

The following is not proven: why Clerk rejected or lost the fresh session in
the original attempt. Eleven clean repetitions are evidence against a
deterministic repository bug, not proof that the intermittent defect is gone.

## Red-First Fix

Seven focused cases initially failed across the Playwright config, lane-policy,
Clerk helper, and practice-session helper suites. A further fail-closed case
then failed before the lifecycle refactor. The final focused result is 31/31:

- global setup creates at most one Clerk session and persists its ignored,
  sensitive Playwright state under `test-results/.auth/`;
- all 14 authenticated specs explicitly opt into that state, while public-page
  specs retain Playwright's signed-out default;
- the historical `signInWithClerkPassword()` call now verifies the stored
  session and throws if it is absent instead of silently creating a replacement;
- a cleanup project signs out the suite session after every project depending
  on setup and removes the local auth-state file even when sign-out fails;
- the source-policy test fixes the authenticated-spec census at 14 and requires
  each one to declare the shared state;
- practice-session outcome polling recognizes `/sign-in` as auth loss and
  reports it without echoing the credential-bearing URL; and
- the fallback Start-button diagnostic is bounded at one second.

The exact real-browser seam passed setup, the previously failing case, and
cleanup retry-free in 32.1 seconds. The auth-state file was absent afterward and
the local app server did not remain listening.

## Impact and Severity

The observed defect can make the required merge lane red or, with retries,
green-without-clean-evidence. The unbounded session churn also burdens a shared
TEST Clerk instance and makes future auth failures harder to interpret. No
production user, production credential, billing state, or durable application
data was affected, and the product flow was not shown to fail outside E2E.
P3 is therefore proportionate.

## Resolution State

Resolved with the original intermittent cause explicitly unproven. The
red-first lifecycle and diagnostic changes were promoted to `main` through PR
PR `#835`, merge commit `47b31234`. CodeRabbit approved exact head
`92c35965` with zero unresolved threads; PR run `32955114161` and post-merge
main run `32960005070` each passed required E2E 43/43 on the first attempt with
zero flaky results or raw Clerk credential assignments. Production deployment
`6102157792` completed successfully, and the production site and database
health checks passed.

That proves the repository-owned properties: one setup-created session is reused
by every authenticated spec, missing stored auth fails closed, teardown signs
out and removes the state file, a sign-in redirect is reported directly, and
the fallback diagnostic is bounded. A five-file focused verification command
completed 51/51 on 2026-08-28; the total includes adjacent Playwright policy
and log-redaction cases, so it is a command receipt rather than a claim that all
51 assertions belong to BUG-306.

The historical backlog is also contained. The incident-time census during the
2026-08-26 investigation counted 4,684 active sessions. At the later owner
containment action that day, a fresh active-session enumeration returned 4,585;
the Backend API revoked all 4,585 successfully, and a subsequent count-only API
query found zero active sessions. The 99-session difference belongs to the two
time-separated snapshots: those sessions were no longer in Clerk's active set
when containment began, and the retained evidence does not distinguish expiry
from another lifecycle transition. Closure rests on the post-action zero-active
query, not on treating the two snapshot totals as identical. The shared E2E
user was not rotated.

No evidence establishes why the original fresh session redirected to sign-in,
and this closure does not claim otherwise. Keeping an item Open solely until an
uncontrolled external event happens again would create no executable next step.
The proven lifecycle and diagnostic defects are fixed and the backlog is gone;
a recurrence should be adjudicated from the bounded auth-loss diagnostic and
filed or reopened with its own evidence.

## Related

- [BUG-304](../../bugs/bug-304-practice-session-start-no-navigation.md) — the required
  E2E investigation whose follow-up gate exposed this independent auth failure.
- [BUG-305](./bug-305-clerk-dev-browser-credential-in-ci-logs.md) — the same
  Clerk test seam can emit sensitive runtime-generated query values after a
  context closes; its log redaction and owner containment are resolved.
- [BUG-307](../../bugs/bug-307-public-playwright-artifacts-expose-test-session-credentials.md)
  — owns the separate public trace/artifact surface found during containment.
- [DEBT-473](../../debt/debt-473-green-without-evidence.md) — treats skipped or
  retry-recovered evidence as an explicit test-infrastructure defect.
