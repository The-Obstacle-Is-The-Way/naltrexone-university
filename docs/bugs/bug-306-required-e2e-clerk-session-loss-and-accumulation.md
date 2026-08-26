# BUG-306: Required E2E Can Lose Clerk Session and Accumulates Sessions

**Status:** Open
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

## Resolution

Open. The red-first lifecycle and diagnostic changes are branch-local on PR #837.
Close only after the exact head passes the complete local gate, required
CI has no first-attempt E2E failure or raw credential leak, CodeRabbit approves
that exact head with zero unresolved threads, the fix is promoted to `main`,
and post-merge CI/deploy complete. Closure must continue to state that the
original session-loss cause was not reproduced.

The historical active-session backlog is deliberately not mutated in this PR.
Before closure, the owner must verify whether those TEST-instance sessions are
used by any other workflow, then either revoke the obsolete sessions without
rotating the shared E2E user or record why natural expiry is the safer choice.

## Related

- [BUG-304](./bug-304-practice-session-start-no-navigation.md) — the required
  E2E investigation whose follow-up gate exposed this independent auth failure.
- [BUG-305](./bug-305-clerk-dev-browser-credential-in-ci-logs.md) — the same
  Clerk test seam can emit sensitive runtime-generated query values after a
  context closes; log redaction remains independently required.
- [DEBT-473](../debt/debt-473-green-without-evidence.md) — treats skipped or
  retry-recovered evidence as an explicit test-infrastructure defect.
