# BUG-328: Public Playwright Reports Still Carry Clerk Development-Instance Tokens

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — after promotion, a green `main` run publishes no Playwright artifact; deleting the existing artifacts needs the owner's approval; due 2026-10-13
**Priority:** P3
**Date:** 2026-10-05 (found); filed 2026-10-06 with its fix
**Resolved:** —
**Verification receipts:** —

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

## Options

1. **Upload the HTML report only when E2E fails,** as `test-results/` already is. A green run then publishes nothing.
2. **Scan before upload.** Decode the report's embedded data and fail the job on `__clerk_db_jwt=`, `dvb_` or `__clerk_testing_token=`, printing counts only.
3. **Redact at the source.** Rewrite the report's step titles, or keep the Clerk testing-token setup out of the reported steps.
4. **Sign out every session a setup attempt creates,** not only the stored one.
5. **Delete the existing report artifacts.**

## Resolution (decided)

Options 1 (revised), 2, 4 and 5.
- **Option 1, revised: the HTML report is never uploaded.** The tokens sit in the setup steps that every run executes: `setupClerkTestingToken`'s route handler records each Clerk API call, with both tokens in its URL, as a step. A report upload gated on the scan would therefore be refused on every failed run. Both workflows drop the report upload. With tracing off in CI, the report adds little to the failure output and the job log.
- **Option 2 guards the failure output.** `scripts/ci/scan-playwright-output.ts test-results` runs only when E2E failed, before the `test-results/` upload, and the upload requires it to pass. The scan:
  - reads every file the upload publishes;
  - opens zip files and reports' embedded data;
  - fails closed on data it cannot read;
  - prints counts only.
- **Option 4 closes the path to a live session.** `createClerkE2ESession` signs out the session when a setup attempt fails after signing in. If the sign-out also fails, it warns and keeps the original error. Known limit: a setup attempt stopped by its timeout closes the page first, and that session stays live until Clerk expires it.
- **Option 5 deletes the existing artifacts.** That is a bulk delete of public artifacts, so it needs the owner's approval, as BUG-307's did.

Option 3 (redacting at the source) is what bringing the report back would need. It depends on Playwright's report internals, and nothing needs the report in CI.

## Verification

- [x] Workflow policy tests, red first (`tests/ci-workflow.test.ts`): no workflow uploads the HTML report; in both E2E workflows the scan runs only when E2E failed, before the failure-output upload, and that upload requires the scan to pass.
- [x] The scan fails on fixture output carrying each shape in a report's embedded data, a zip file or a plain file, fails closed on data it cannot read, and passes clean output (`scripts/ci/scan-playwright-output.test.ts`). On this clone's last local run it refused the report (4, 4 and 3 matches) and passed `test-results/`.
- [x] Setup signs out the session of a failed attempt (`tests/e2e/helpers/clerk-auth.test.ts`).
- [x] BUG-307's archived closure has a forward pointer here; its scan was blind to embedded data.
- [ ] After promotion, a green `main` run publishes no Playwright artifact.
- [ ] The existing report artifacts are deleted (owner-approved), with the count recorded.

## Related

- BUG-305, BUG-306 and BUG-307 (archived): the earlier Clerk credential leaks in CI.
- [BUG-327](./bug-327-dependabot-branches-build-with-preview-secrets.md): the same audit's CI and build exposure.
