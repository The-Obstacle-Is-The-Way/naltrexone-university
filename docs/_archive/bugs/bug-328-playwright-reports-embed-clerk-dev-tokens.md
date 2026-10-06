# BUG-328: Public Playwright Reports Still Carry Clerk Development-Instance Tokens

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-06; promoted, green main E2E, zero artifacts, and report cleanup recorded
**Priority:** P3
**Date:** 2026-10-05 (found); filed 2026-10-06 with its fix
**Resolved:** 2026-10-06
**Verification receipts:** [#1405](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1405), [promotion #1406](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1406), [main CI](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/37489435958).

---

## Summary

Every CI run publishes a Playwright HTML report as a downloadable artifact of this public repository. The report embeds Clerk development-instance credentials:
- the dev-browser token (`__clerk_db_jwt`, a `dvb_…` value);
- Clerk testing tokens.

They sit inside a zip encoded in the report's `index.html`, where a plain-text scan cannot see them. BUG-307 (archived) closed this class of leak on a scan of that kind: it counted one file and found no credential shape, because it never opened the embedded data.

A dev-browser token lets its holder act as the shared TEST user while that browser's session is live. CI's teardown signs that session out before the upload, so a normally finished run publishes a token with no session behind it. That is why this is P3, not BUG-307's P2. It becomes P2 if any published token is found to map to a live session.

## Evidence

- **Measured 2026-10-05 on a CI report** (artifact from 20:10 UTC). Counted without printing values, then the download was deleted:
  - outside the embedded data: zero;
  - inside it: one distinct `__clerk_db_jwt` value, one `dvb_` value and three distinct `__clerk_testing_token` values.
- **Breadth (independent reviewer).** All 16 sampled reports from 2026-09-06 to 2026-10-05 carry them. 895 CI and 30 hosted-checkout reports are in retention.
- **Where they come from.** `@clerk/testing`'s `setupClerkTestingToken` route handler calls `route.fetch`. Playwright 1.63 records each call as a step of `tests/e2e/global.setup.ts`, with the full Clerk API URL, query string included, as the step's subtitle.
- **The uploads, at filing.**
  - `.github/workflows/ci.yml:154-164` uploads `playwright-report/` after every non-cancelled run. `.github/workflows/stripe-hosted-checkout-smoke.yml:105-115` does the same.
  - The `!**/trace.zip` exclusion does not match trace copies inside the HTML report (`data/<sha1>.zip`). Only CI's `trace: 'off'` (`playwright.config.ts:23`) keeps traces out.
- **When a session can outlive the upload.**
  - The setup project retries twice in CI (`playwright.config.ts:30`). Each attempt creates a session, but teardown signs out only the stored one.
  - A teardown that fails also leaves the session live.
  - Clerk's default session lifetime is 7 days.
  - Playwright page waits have no timeout by default, and nothing in this repository set one. A hung Clerk wait therefore ran until the setup test's timeout closed the page.
- **Other public surfaces, measured 2026-10-06** (counts only, downloads deleted):
  - the 5 failure-output artifacts in retention (65 files): no credential shape;
  - 21 recent public CI logs, including the 5 runs whose E2E step failed: no credential shape, raw, percent-encoded or as a JSON Web Token.

## Options

1. **Upload the HTML report only when E2E fails,** as `test-results/` already is. A green run then publishes nothing.
2. **Scan before upload.** Decode the report's embedded data and fail the job on `__clerk_db_jwt=`, `dvb_` or `__clerk_testing_token=`, printing counts only.
3. **Redact at the source.** Rewrite the report's step titles, or keep the Clerk testing-token setup out of the reported steps.
4. **Sign out every session a setup attempt creates,** not only the stored one.
5. **Delete the existing report artifacts.**

## Resolution (decided)

Options 1 (revised), 2 (revised), 4 and 5.
- **Option 1, revised: the HTML report is never uploaded.** The tokens sit in the setup steps that every run executes: `setupClerkTestingToken`'s route handler records each Clerk API call, with both tokens in its URL, as a step. A report upload gated on a scan would be refused on every failed run, so both workflows drop it. With tracing off in CI, the report adds little to the failure output and the job log.
- **Option 2, revised: the failure output passes an allow-list before it uploads.** `scripts/ci/scan-playwright-output.ts test-results` runs only when E2E failed, before the `test-results/` upload, which requires it to pass.
  - It accepts only regular UTF-8 text files (`.md`, `.txt`, `.json`, `.log`); under our config Playwright writes only `error-context.md` there. It refuses anything else, such as a zip, a report, an image or a symbolic link, instead of decoding it. A first version decoded zips and reports, and the independent review found formats it would miss; decoding every format is a race the scan cannot win.
  - It looks for the Clerk credential shapes after undoing percent-encoding and JSON `\u` escapes. The shapes are defined once, in `tests/shared/clerk-credential-shapes.ts`, which E2E console redaction also uses, so the two look for the same things. Redaction works on the text as logged; only the scan decodes. The shapes are a heuristic for the forms Clerk's tokens take in URLs, cookies, headers and JSON: the parameter names, `dvb_` values and JSON Web Tokens, the last found anywhere in a run of token characters, in linear time, with overlapping candidates redacted as one span. A clean scan does not prove a file holds no credential; the allow-list is what bounds what can be published.
  - It skips only what the upload never publishes: hidden files, which include the stored auth state, and `trace.zip`. A missing directory means nothing to upload; any other read error fails the step.
  - It prints counts and file paths only.
  - `tests/ci-workflow.test.ts`, over every workflow:
    - no step names `playwright-report`, by any means of publishing;
    - only the scan and scan-gated uploads name `test-results`;
    - every step using an upload action passes the scan, with nothing between the two and no way around its result, or is a listed exemption keyed by its artifact name and path (the mutation report is the one exemption);
    - no upload includes hidden files.

    A step that publishes without naming either directory, such as `curl` on a computed path, is beyond what a workflow test can see; review of workflow changes covers it.
- **Option 4: a failed setup attempt signs out its own session.**
  - `createClerkE2ESession` signs out when an attempt fails after signing in. If the sign-out also fails, it warns and keeps the original error.
  - Both phases have deadlines: 30 seconds to sign in and 20 to sign out (`tests/e2e/helpers/clerk-session-deadlines.ts`). Clerk's sign-in and sign-out run `page.evaluate`, which Playwright never times out, and its route handler retries each request for up to about a minute.
  - Global setup reserves both deadlines once its preparation ends, so a slow preparation cannot cut the sign-out short. Until then the setup test has a 60-second preparation budget; `clerkSetup` alone retries for over half a minute, and CI's whole setup takes about 5 seconds. A preparation that runs out of time fails the attempt before it signs in, so it leaves no session.
  - A sign-in that finishes after its deadline never saves its state. If it finishes after the sign-out has checked for a session, that session is not signed out, and stays live until Clerk expires it.
  - The `setup` and `cleanup` projects also bound page waits and navigations at 15 seconds, so a hung wait fails with its own error.
  - Known limit: an attempt stopped from outside, such as a cancelled CI job, cannot sign out, and its session stays live until Clerk expires it. With nothing published, that session's token does not leave the runner.
- **Option 5 deletes the existing artifacts.** That is a bulk delete of public artifacts, so it needed the owner's approval, as BUG-307's did; the owner gave it on 2026-10-06. Every artifact named `playwright-report` or `stripe-hosted-checkout-report` was deleted. The failure-output artifacts are clean and stay, as do the mutation reports. The post-promotion cleanup found none to delete; its count is recorded below.

Option 3 (redacting at the source) is what bringing the report back would need. It depends on Playwright's report internals, and nothing needs the report in CI.

## Verification

- [x] Workflow policy tests, red first (`tests/ci-workflow.test.ts`). They fail on:
  - the pre-fix workflow;
  - an upload of `.`;
  - `include-hidden-files: true`;
  - `|| true` on the scan, or a `shell` or `working-directory` set on the scan, its job or the workflow;
  - `|| always()` on the upload;
  - a scan placed before E2E, or `continue-on-error` on it;
  - an upload through another action, or an unlisted upload;
  - a cache, Codecov or release step naming either directory;
  - an exemption whose path changed.
- [x] The scan refuses zips, reports, images, files without a text type, invalid UTF-8, UTF-16 text and symbolic links, and fails on an unreadable directory. It finds each credential shape in raw and encoded form, in linear time, and passes clean output (`scripts/ci/scan-playwright-output.test.ts`, `tests/shared/clerk-credential-shapes.test.ts`). On this clone's last local run it refused the report and passed `test-results/`.
- [x] E2E console redaction removes the same shapes, including in a nested URL (`tests/e2e/helpers/e2e-log-redaction.test.ts`).
- [x] Setup signs out the session of a failed attempt, including after either deadline passes, and never saves the state of a late sign-in; global setup reserves both deadlines once preparation ends (`tests/e2e/helpers/clerk-auth.test.ts`, `tests/e2e/helpers/clerk-session-deadlines.test.ts`, `playwright.config.test.ts`).
- [x] BUG-307's archived closure has a forward pointer here; its scan was blind to embedded data.
- [x] The existing report artifacts are deleted, with the owner's approval of 2026-10-06: 984 deleted (955 CI, 29 hosted-checkout), none failed, none left.
- [x] Promotion #1406 merged as `0f324edd`, carrying #1405 merge `24a4bb25` and exact-head approval 5430633755 on `4e18861f`. Main run 37489435958 passed E2E; scan and upload steps skipped; the artifacts API reports zero artifacts. Vercel confirms production assignment at 2026-10-06T15:53:43.858Z.
- [x] Cleanup receipt: the owner reports 984 reports deleted with approval and no upload between deletion and promotion, so the second deletion count is **0**. The external audit read the complete current artifact listing and found zero report artifacts. Historical deletion count and authorization are retained owner evidence; the listing cannot reconstruct deleted artifacts. No artifact was deleted by this audit.

## Related

- BUG-305, BUG-306 and BUG-307 (archived): the earlier Clerk credential leaks in CI.
- [BUG-327](../../bugs/bug-327-dependabot-branches-build-with-preview-secrets.md): the same audit's CI and build exposure.
