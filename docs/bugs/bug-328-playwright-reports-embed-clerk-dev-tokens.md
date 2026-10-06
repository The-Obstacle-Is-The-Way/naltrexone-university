# BUG-328: Public Playwright Reports Still Carry Clerk Development-Instance Tokens

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the fix is in this pull request; deleting the existing artifacts needs the owner's approval
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
- **The uploads.**
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

Options 1, 2, 4 and 5.
- Option 1 removes most exposure, since most runs pass.
- Option 2 guards the failure uploads and proves the fix, instead of trusting a blind scan again.
- Option 4 closes the path to a live session.
- Option 5 deletes the existing artifacts. That is a bulk delete of public artifacts, so it needs the owner's approval, as BUG-307's did.

Option 3 depends on Playwright's report internals, and is not needed once the others hold.

## Verification

Criteria to meet before closing; none is met yet.

- [ ] Workflow policy tests, red first: the HTML report uploads only on E2E failure in both workflows, and the scan step runs before any upload.
- [ ] The scan fails on a fixture report carrying each shape inside its embedded data, and passes on a clean one.
- [ ] Setup signs out every session it creates, with a test.
- [ ] The existing report artifacts are deleted (owner-approved), with the count recorded.
- [ ] BUG-307's archived closure gets a forward pointer here; its scan was blind to embedded data.

## Related

- BUG-305, BUG-306 and BUG-307 (archived): the earlier Clerk credential leaks in CI.
- [BUG-327](./bug-327-dependabot-branches-build-with-preview-secrets.md): the same audit's CI and build exposure.
