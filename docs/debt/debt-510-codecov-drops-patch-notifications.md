# DEBT-510: Codecov Sometimes Drops the Patch Notification After a Successful Upload

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — resolution decided below
**Priority:** P3
**Date:** 2026-10-07
**Resolved:** —
**Verification receipts:** —

---

## Summary

CI uploads coverage, and Codecov processes it, but sometimes never posts `codecov/patch`. The merge guard rightly requires that check on a code change (ADR-020), so the PR stops until someone notices and re-runs CI. A re-run uploads again and the check posts. That is a manual remedy for a dropped message, not a fix.

## Evidence

- **Two misses on 2026-10-07.**
  - **#1421 (head `e766254d`).** The first upload was processed at 15:11:12Z and CI finished at 15:15:38Z, but no `codecov/patch` posted. After the re-run, the second upload was processed at 15:42:29Z and the check posted at 15:43:13Z.
  - **#1418 (head `a2e0c651`).** Attempt 1 was cancelled before any upload. Attempt 2's upload was processed at 16:58:22Z, and nothing posted for 53 minutes. After attempt 3's upload, processed at 17:50:30Z, the check posted at 17:51:24Z.
  - Each re-run's cause was recorded on its PR. Upload times come from Codecov's public API.
- **Frequency.** Over the last 200 CI runs (2026-10-03 to 2026-10-07):
  - 151 of the 154 successful non-Dependabot PR heads got `codecov/patch`, and the other three have known causes.
  - That leaves two hard misses in about 152 uploading heads (about 1.3%), both on 2026-10-07. A third head, `bc5619a1` (#1410), posted 14 minutes late with nothing to trigger it.
  - Normally the check posts a median of 32 seconds after processing, and within 65 seconds in 90% of cases.
- **Not our configuration.** Read from Codecov's worker source (`codecov/umbrella`):
  - `ci_passed` reads only the commit's statuses (Vercel and CodeRabbit here), never check runs, so it is always true for this repository. `wait_for_ci`, `require_ci_to_pass` and `after_n_builds` therefore change nothing.
  - Nothing CI does re-triggers a notification: Codecov's webhook re-runs one only on `status` events.
  - `codecov.yml` sets only `ignore`.
- **Codecov has reported this kind of failure before.** Its status page showed no incident on 2026-10-07. On 2026-07-26 it reported that a server out of memory "caused drop in PR notifications". Codecov's server logs are not available to us, so the server-side drop is the best-supported cause, not a proven one.
- **The guard is right.** Treating a missing `codecov/patch` as passing would let a real coverage regression merge. [DEBT-497](../_archive/debt/debt-497-codecov-outage-blocks-merges-behind-green-ci.md) settled which paths may lack it.

## Impact

A code PR that is approved, with CI green, stops at the merge guard until a person notices that the status is missing and re-runs CI. Each re-run costs about 14 minutes of CI and an E2E window on the shared test identity ([DEBT-508](./debt-508-concurrent-e2e-runs-share-clerk-budget-and-stripe-customer.md)).

## Options

1. **Re-run CI when it happens.** This is today's practice: a manual remedy that costs a full run each time.
2. **Loosen the guard.** Rejected: a missing status would then pass a real coverage regression.
3. **Send the notification a second time, from CI** (recommended).
   - As the job's last coverage step, run the same pinned `codecov/codecov-action` with `run_command: send-notifications` and the same token.
   - Codecov then checks the uploads exist, waits for processing, and runs the same notify task.
   - Codecov's own trigger stays (`manual_trigger` remains false), so either trigger can post.
   - The step cannot create a pass, because Codecov still computes patch coverage from the uploads.
4. **Measure coverage in CI and drop Codecov.** This is DEBT-497's option 4, whose trigger, code blocked for more than a day, has not been met.

## Resolution

**Decided:** option 3.

- **The step.** A "Send Codecov notifications" step runs near the end of the job, after E2E, about five minutes after the upload, so it does not collide with Codecov's own processing.
  - It runs only when the upload succeeded and the run was not cancelled.
  - It uses the same pinned action and token, with `fail_ci_if_error: true` and `continue-on-error: true`. A failed notification is visible in the job but does not fail it, the same as the upload step.
- **The tests.** `tests/ci-codecov-notification.test.ts` pins:
  - the step's place after E2E;
  - its condition, action pin and command;
  - its not failing the job.
  The secret-scope test lists the step as `CODECOV_TOKEN`'s second consumer.
- **The runbook.** AGENTS.md's Codecov section gains one check for what is still missed: the upload was processed but no check posted after about five minutes. Re-trigger it with one re-run, recorded on the PR, rather than waiting.

## Verification

- [ ] The step runs on this record's PR and on `main` after promotion, and `codecov/patch` posts.
- [ ] Over the next two weeks of PR heads, misses are counted the way the evidence above counts them, and the count falls below the 1.3% baseline.
