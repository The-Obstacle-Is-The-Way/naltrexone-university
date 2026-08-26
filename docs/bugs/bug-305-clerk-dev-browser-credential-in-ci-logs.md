# BUG-305: Clerk Dev-Browser Credential Appears in Public CI Logs

**Status:** Open
**Severity:** P2
**Date:** 2026-08-25
**Confirmed:** 2026-08-25 (public Actions logs contain an unmasked development-browser credential)
**Component:** Required E2E / Clerk testing / credential-safe diagnostics

---

## Summary

Required E2E can finish green while `@clerk/testing` prints a failed route-fetch
warning containing the `__clerk_db_jwt` query value. The repository is public,
the value is not masked by GitHub, and an initial eight-run census found two
successful runs with two such warnings each. The first mitigation's hosted run
became a third affected run and proved that local/unit success was insufficient.

This is a TEST/development-instance credential, not a production Clerk secret.
It is still sensitive: Clerk documents the dev-browser object as linked directly
to the client token, used to maintain state across the session lifetime, and
unsafe in a query string because logs and browser history can expose it.
([Clerk, “Instances / Environments”](https://clerk.com/docs/guides/development/managing-environments#session-architecture-differences))

## Evidence

- PR #837 exact-head run `32914624781` passed required E2E 42/42 but emitted
  two `FAPI request failed after 4 attempts` warnings after a test context ended.
  Both warning URLs contained the dev-browser query field with an unmasked
  value. The value is deliberately omitted from this record.
- Run `32908317465` contained the same two-warning shape. Six other successful
  runs in the eight-run census contained none, so the disclosure is
  intermittent rather than absent.
- First-mitigation run `32916441885` passed required E2E 42/42 but again emitted
  two unmasked warnings immediately after the second bookmarks case. A
  non-printing raw-log parser counted two unmasked dev-browser values and zero
  redacted values. This falsified the target-level idempotence guard before
  merge.
- The repository visibility is `PUBLIC`.
- Installed `@clerk/testing` 2.2.24 catches the exhausted `route.fetch()` call
  and passes the original `request().url()` to `console.warn`. Registry release
  2.2.30 was inspected on 2026-08-25 and retains the same behavior, so a current
  package upgrade does not close the leak.
- The logged value is neither a configured Actions secret nor GitHub-masked.
  It is generated during Clerk's development session flow. GitHub's masking
  guidance warns that values which are not registered secrets must be masked by
  the workflow itself.
  ([GitHub, “Using secrets in GitHub Actions”](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#using-secrets-in-a-workflow))

The separate Clerk Testing Token is not the exposed value. The package injects
`__clerk_testing_token` into the forwarded request but logs the original URL;
that URL already contains `__clerk_db_jwt`. This correction matters because the
Testing Token's short-lived, instance-specific contract does not establish the
dev-browser credential's lifetime.

## Root Cause

`setupClerkTestingToken()` installs a Playwright route handler for Clerk's
Frontend API. When the page or context closes while a routed request is still
in flight, the handler retries `route.fetch()` four times. Its terminal warning
prints the original request URL without credential redaction. GitHub cannot
mask a runtime-generated value it was never given as an Actions secret.

The request failure itself occurs after the test consumer has gone away, so it
does not invalidate the completed assertion. The unredacted diagnostic is the
bug.

## Resolution State

Open. The branch-local mitigation is red-first and the failed first attempt is
part of the record:

- `tests/e2e/helpers/e2e-log-redaction.ts` wraps the test process's five console
  channels and redacts Clerk dev-browser, testing-token, and session query
  values while preserving the warning and non-string arguments;
- `signInWithClerkPassword()` installs it before Clerk registers or exercises
  its route handler; and
- the focused test first failed because the seam did not exist, then passed
  3/3; together with the existing Clerk helper case the focused run passed 4/4.

That first implementation tracked the target object as “installed.” Hosted run
`32916441885` proved that this was not the property required across test
boundaries: a restored console method could remain raw while the target-level
guard refused to reinstall. A fourth focused case models that reset and failed
red with the fake credential unchanged (1 failed / 3 passed). The corrected
implementation tracks the wrapper functions themselves, skips a method only
while its current function is already a redacting wrapper, and rewraps a
restored method. The redaction suite then passed 4/4; with the existing Clerk
helper case the focused run passed 5/5.

The corrected mitigation is now promoted to `main` through PR #835, merge
commit `47b31234`. CodeRabbit approved exact head `92c35965`; PR run
`32955114161` and post-merge main run `32960005070` each passed required E2E
43/43 on the first attempt. Non-printing raw-log censuses found zero flaky
markers and zero assignments for the three redacted Clerk query fields in both
runs. Production deployment `6102157792` completed successfully.

BUG-305 remains Open until every exposed development session has either been
revoked or verified expired. Historical public-log deletion or equivalent
access containment is a separate required action; it cannot substitute for
invalidating a still-usable session. Do not rotate or delete the shared E2E user
or Stripe customer. The closing receipt must continue to inspect raw log output
without ever printing credential values.

## Related

- [DEBT-474](../debt/debt-474-ci-secret-scope-and-action-immutability.md) — the
  broader required-CI credential-scope work; its implementation audit must add
  runtime-generated credentials, not only job-level `secrets.*` values.
- [BUG-304](./bug-304-practice-session-start-no-navigation.md) — its exact-head
  verification exposed this independent logging defect.
- [BUG-306](./bug-306-required-e2e-clerk-session-loss-and-accumulation.md) — the
  same per-test Clerk seam accumulated sessions without teardown and later lost
  a fresh session on a protected navigation; causality remains unproven.
