# BUG-307: Public Playwright Artifacts Expose TEST Session Credentials

**Status:** Resolved
**Resolution State:** Promoted to `main`; post-merge CI, deploy, and artifact scan verified 2026-08-28
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
2. Before this fix, both E2E workflows published `playwright-report/` and
   `test-results/` as artifacts. A retried Playwright test recorded full network
   traffic in a trace, and the HTML reporter copied trace attachments into its
   own output. Those traces contained development-instance Clerk credentials
   and session cookies. Console redaction cannot sanitize a trace file.

The repository is public. GitHub's artifact API permits unauthenticated reads
for public resources, and GitHub's web documentation says signed-in users with
repository read access can download workflow artifacts. Playwright separately
warns that stored browser state can contain cookies and headers capable of
impersonating the test account.
([GitHub artifact API](https://docs.github.com/en/rest/actions/artifacts#get-an-artifact),
[GitHub artifact downloads](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts),
[Playwright authentication](https://playwright.dev/docs/auth))

## Current-Tree Evidence

- `.github/workflows/ci.yml:141-163` now uploads `playwright-report/` after every
  non-cancelled run and uploads `test-results/` only when `e2e_smoke` failed;
  both paths exclude `**/.auth/**` and `**/trace.zip`.
- `.github/workflows/stripe-hosted-checkout-smoke.yml:88-127` gives the hosted
  E2E step a stable ID and applies the same split and exclusions.
- `playwright.config.ts:17,24` retains two CI retries but resolves tracing to
  `off` in CI and `on-first-retry` locally.
- `tests/e2e/helpers/clerk-auth-state.ts:3` stores suite authentication under
  `test-results/.auth/`. `tests/e2e/global-teardown.ts:9-25` normally signs out
  and deletes it; the upload exclusions now remain effective even if an
  interrupted runner or dependency-bypassing command leaves that file behind.
- `tests/e2e/helpers/e2e-log-redaction.ts:9-17` redacts Clerk query fields and
  the repository's standing Stripe TEST object-identifier pattern from console
  strings. It deliberately does not attempt to rewrite binary artifacts.

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

Those actions invalidate and remove the known exposure. At filing time, they
did not correct the workflow that could publish the next failing run; the
implementation below closes that source-level gap.

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

## Implementation Receipt (2026-08-28)

The implementation is complete on this branch without expanding the threat
model beyond the two known workflows:

- each workflow has one always-after-noncancellation HTML-report upload and one
  failure-only results upload keyed to the corresponding E2E step outcome;
- every upload path excludes auth-state directories and trace archives;
- hosted CI tracing is disabled while local `on-first-retry` tracing remains;
- the shared E2E log-redaction seam now covers all 13 standing Stripe TEST
  object-identifier prefixes, and the session helper consumes that one seam
  instead of carrying a duplicate pattern; and
- the pre-fix focused run failed four new assertions across the two workflow
  shapes, trace policy, and Stripe redaction. The corrected focused run passed
  73/73 across those contracts plus the existing session-diagnostic suite.

## Closure Receipt (2026-08-28)

Source PR #865 was CodeRabbit-APPROVED on exact head `829ae687` with zero
unresolved threads and green CI run `33217468155`, then merged to `dev` as
`481b6ee2`. Promotion PR #866 was CodeRabbit-APPROVED on exact head `481b6ee2`
with zero unresolved threads and green promotion CI run `33220909431`, then
merged to `main` as `7af01e44`. `origin/dev` and `origin/main` were
tree-identical at `683d9b6766c37a48c5c8b883b8984bae8bbdf0b0`.

Post-merge main run `33227567754` passed its required `test` job, including the
first E2E execution, and its production deploy trigger. The successful E2E step
published one `playwright-report` artifact and correctly skipped the
failure-only results upload. A non-printing scan downloaded that promoted
artifact and counted one file, zero auth-state files, zero trace archives, and
zero files containing an unredacted Clerk credential shape or standing Stripe
TEST object-identifier shape. The scan status was PASS; no matched content or
identifier was printed.

## Verification

- [x] Required CI uploads `playwright-report/` always and `test-results/` only
      when the E2E step failed.
- [x] Hosted compatibility CI applies the same split.
- [x] Neither artifact path can include `**/.auth/**` or a Playwright trace.
- [x] Workflow and Playwright policy tests fail on the pre-fix shapes and pass
      on the corrected shapes.
- [x] E2E console output redacts Clerk credential fields and Stripe TEST object
      identifiers without printing matched values.
- [x] The promoted artifact passes a non-printing credential-shape scan.

## Related

- [BUG-305](./bug-305-clerk-dev-browser-credential-in-ci-logs.md)
  — resolved console-log surface whose exposure history this filing corrects.
- [BUG-306](./bug-306-required-e2e-clerk-session-loss-and-accumulation.md)
  — resolved suite-session lifecycle defect that created the backlog.
- [BUG-304](../../bugs/bug-304-practice-session-start-no-navigation.md) — remains Open
  because its application-owned silent-handler seam still exists.
- [DEBT-471](../../debt/debt-471-e2e-ci-external-fragility.md) — owns the hosted
  Checkout drift classification and non-blocking cadence.
- [DEBT-473](../../debt/debt-473-green-without-evidence.md) — owns complete CI
  evidence reporting.
- [DEBT-474](../../debt/debt-474-ci-secret-scope-and-action-immutability.md) — owns
  CI credential scope and action immutability.
