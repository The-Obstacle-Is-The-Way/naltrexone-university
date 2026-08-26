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
the value is not masked by GitHub, and two of the eight most recent successful
CI runs contained two such warnings each.

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

## Resolution

Open. The branch-local mitigation is red-first:

- `tests/e2e/helpers/e2e-log-redaction.ts` wraps the test process's five console
  channels once and redacts Clerk dev-browser, testing-token, and session query
  values while preserving the warning and non-string arguments;
- `signInWithClerkPassword()` installs it before Clerk registers or exercises
  its route handler; and
- the focused test first failed because the seam did not exist, then passed
  3/3; together with the existing Clerk helper case the focused run passed 4/4.

Close only after exact-head CI proves the mitigation and the owner decides how
to contain the historical public artifacts: revoke affected development
sessions and/or delete the affected run logs. Do not rotate or delete the
shared E2E user or Stripe customer. The closing receipt must inspect raw log
output without ever printing credential values.

## Related

- [DEBT-474](../debt/debt-474-ci-secret-scope-and-action-immutability.md) — the
  broader required-CI credential-scope work; its implementation audit must add
  runtime-generated credentials, not only job-level `secrets.*` values.
- [BUG-304](./bug-304-practice-session-start-no-navigation.md) — its exact-head
  verification exposed this independent logging defect.
