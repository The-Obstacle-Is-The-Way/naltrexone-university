# BUG-307: Public Playwright Artifacts Expose TEST Session Credentials

**Status:** Open
**Severity:** P2
**Date:** 2026-08-28
**Confirmed:** 2026-08-26; scope corrected and owner containment reverified 2026-08-28
**Component:** Required and hosted E2E / Playwright artifacts / Clerk testing / CI evidence hygiene

---

## Summary

The containment sweep for BUG-305 found two distinct defects:

1. BUG-305's eight-run sample materially understated its public-log history.
   A frozen GitHub Actions API sweep downloaded 1,364 of 1,386 enumerated log
   archives. Among the 1,210 scanned `CI` workflow logs, 455 contained 873
   unredacted `__clerk_db_jwt` values. Excluding 104 Dependabot-branch CI logs
   gives 452 of 1,106. The previously reported “455 of 1,128 retained CI runs”
   is not reproducible from the sweep data: it combined an all-CI numerator
   with a differently scoped denominator. The values occurred from
   2026-05-28T16:14Z through 2026-08-25T02:12Z, including 95 `main` runs and
   105 `dev` runs.
2. Both E2E workflows publish `playwright-report/` and `test-results/` as
   artifacts. A retried Playwright test records full network traffic in a
   trace, and the HTML reporter copies trace attachments into its own output.
   Those traces contained development-instance Clerk credentials and session
   cookies. Console redaction cannot sanitize a trace file.

The repository is public. GitHub's artifact API permits unauthenticated reads
for public resources, and GitHub's web documentation says signed-in users with
repository read access can download workflow artifacts. Playwright separately
warns that stored browser state can contain cookies and headers capable of
impersonating the test account.
([GitHub artifact API](https://docs.github.com/en/rest/actions/artifacts#get-an-artifact),
[GitHub artifact downloads](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts),
[Playwright authentication](https://playwright.dev/docs/auth))

## Current-Tree Evidence

- `.github/workflows/ci.yml:141-150` uploads both output directories whenever
  the job is not cancelled, with 30-day retention.
- `.github/workflows/stripe-hosted-checkout-smoke.yml:104-112` repeats the same
  publication under a different artifact name.
- `playwright.config.ts:17,24` uses two CI retries and `on-first-retry` tracing.
  A trace is therefore expected whenever an initial attempt fails and retries.
- `tests/e2e/helpers/clerk-auth-state.ts:3` stores suite authentication under
  `test-results/.auth/`. `tests/e2e/global-teardown.ts:9-25` normally signs out
  and deletes it, but an interrupted runner or a dependency-bypassing command
  can leave the file for the unconditional upload.
- `tests/e2e/helpers/e2e-log-redaction.ts:9-13` redacts Clerk query fields only
  from console strings. It neither reads artifacts nor redacts the repository's
  standing Stripe object-identifier pattern.

The initial artifact census found 21 trace-bearing public artifacts from
2026-08-03 through 2026-08-26. Scheduled hosted run `33110618884` then failed
all three paid-checkout attempts and published a twenty-second trace-bearing
artifact; one non-printing inspection counted 108 dev-browser values and 90
session-cookie values. Manual hosted run `33175157228` repeated the same
three-attempt failure and published the twenty-third artifact.

Both hosted runs failed at
`tests/e2e/stripe-hosted-paid-checkout.spec.ts:83`: the code requested an exact
textbox name of `CVC`, while all three preserved accessibility snapshots named
the control “Credit or debit card CVC/CVV” and retained the `CVC` placeholder.
That selector drift is a DEBT-471 observational-lane incident. It is not the
cause of the credential exposure; it merely exercised the unsafe artifact path.

## Credential Boundary and Impact

Only the shared Clerk development instance, local/CI test database, and Stripe
TEST mode were in scope. No production Clerk credential, live Stripe key,
production database credential, or real-user session was found.

The short-lived `__session` token expires after roughly one minute, but Clerk's
development-browser value maintains session state across the longer session
lifetime and is query-string borne. Clerk explicitly says that development
mechanism is not secure enough for production because query strings can enter
logs and history. A trace captured both classes plus testing tokens, so the
artifact could impersonate the shared TEST user while the associated session
remained valid.
([Clerk session architecture](https://clerk.com/docs/guides/how-clerk-works/overview))

The concrete consequence was bounded to reading development test data,
mutating the shared E2E user's state, and sabotaging CI evidence. P2 is
proportionate because credentials were publicly downloadable and continuously
refreshed, even though every affected system was non-production.

## Owner-Side Containment

Containment is complete and was reverified through count-only API calls:

- the Clerk Backend API batch revoked 4,585 active sessions with zero failures;
  a 2026-08-28 query found one matching TEST user and zero active sessions;
- Actions runs `32908317465`, `32914624781`, and `32916441885` each return 404;
- all 21 artifacts from the initial sweep plus hosted artifacts `9662647761`
  and `9687539019` return 404 — 23 deleted or absent, zero still present; and
- an independent scan downloaded every currently retained post-redaction `CI`
  log (70/70) and found zero unredacted dev-browser values.

Those actions invalidate and remove the known exposure. They do not correct the
workflow that can publish the next failing run.

## Required Fix

1. In both E2E workflows, upload `playwright-report/` after every non-cancelled
   run and upload `test-results/` only when the corresponding E2E step fails.
   Exclude `**/.auth/**` from every upload path.
2. Do not publish Playwright traces from this public repository. Keep local
   tracing for developer diagnosis, but disable hosted CI tracing rather than
   copying credential-bearing trace attachments into either output directory.
   Preserve failure screenshots, `error-context.md`, the HTML report, and the
   redacted list log.
3. Extend the E2E output redaction seam to the standing Stripe TEST object-ID
   pattern. This is defense in depth for logs, not a substitute for withholding
   traces.
4. Pin both workflow shapes and the CI trace policy in
   `tests/ci-workflow.test.ts` / the existing Playwright policy test, red-first.
5. After promotion, inspect the produced artifact with a non-printing
   credential-shape scan. Record only totals and pass/fail status.

## Verification

- [ ] Required CI uploads `playwright-report/` always and `test-results/` only
      when the E2E step failed.
- [ ] Hosted compatibility CI applies the same split.
- [ ] Neither artifact path can include `**/.auth/**` or a Playwright trace.
- [ ] Workflow and Playwright policy tests fail on the pre-fix shapes and pass
      on the corrected shapes.
- [ ] E2E console output redacts Clerk credential fields and Stripe TEST object
      identifiers without printing matched values.
- [ ] The promoted artifact passes a non-printing credential-shape scan.

## Related

- [BUG-305](../_archive/bugs/bug-305-clerk-dev-browser-credential-in-ci-logs.md)
  — resolved console-log surface whose exposure history this filing corrects.
- [BUG-306](../_archive/bugs/bug-306-required-e2e-clerk-session-loss-and-accumulation.md)
  — resolved suite-session lifecycle defect that created the backlog.
- [BUG-304](./bug-304-practice-session-start-no-navigation.md) — remains Open
  because its application-owned silent-handler seam still exists.
- [DEBT-471](../debt/debt-471-e2e-ci-external-fragility.md) — owns the hosted
  Checkout drift classification and non-blocking cadence.
- [DEBT-473](../debt/debt-473-green-without-evidence.md) — owns complete CI
  evidence reporting.
- [DEBT-474](../debt/debt-474-ci-secret-scope-and-action-immutability.md) — owns
  CI credential scope and action immutability.
