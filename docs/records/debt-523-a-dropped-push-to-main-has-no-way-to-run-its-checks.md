# DEBT-523: A Push to Main That GitHub Drops Has No Way to Run Its Checks

**Status:** Verifying — a manual CI run on `main` executes and passes E2E on `main`'s exact head; due 2026-10-17
**Priority:** P2
**Date:** 2026-10-15

---

## Summary

On 2026-10-15, promotion #1523 merged, carrying #1522's twelve dependency updates. GitHub never processed the push of its merge commit:
- no check suite was created for the commit, so there was no CI run and no `test` check;
- no Vercel deployment was created either;
- production kept serving the previous promotion's release (#1519).

CI ran only on `pull_request` and on `push` to `main`, so nothing could run it on that commit. The promotion guide's manual route was also out of reach. It deploys with `vercel deploy --prod --skip-domain` and promotes only after `main`'s `test` passes on the exact commit, and that check could not exist.

The only recovery was another change through review and promotion, which takes hours because CodeRabbit's single review slot is shared by every session.

## Evidence

- **No suites.** The merge commit had no check suite from the merge at 15:44:17Z until 17:06Z. Then the scheduled upstream advisory watch ran on `main`'s head, and its suite was the only one. At 19:26Z there was still no CI suite and no deployment for the commit, and it had no statuses.
- **GitHub recorded no push.** GitHub's activity listing for `main` has no entry for the merge. Its newest entry is #1519's promotion, although `main` points at #1523's merge commit.
- **Not GitHub's status page.** githubstatus.com showed no incident.
- **Not the repository's settings.** #1519's promotion and #1522's merge into `dev` each got their suites within two seconds.
- **The receipts,** with SHAs, are on #1523.

## Impact

- **Production silently lags `main`.** Today that held twelve dependency updates, including Clerk and Sentry patches, out of production for hours.
- **The third time.** #509 (BUG-259) and #1367 had no production deployment either, but in those Vercel alone skipped, and CI ran. This is the first time GitHub dropped the push itself.

## Options

1. **Wait for the next promotion.** No change, but each occurrence costs a review slot and a promotion, and production lags meanwhile.
2. **Let CI be run by hand on `main`.** `workflow_dispatch` gives the dropped commit a full CI run, E2E included, within one run's time. That run is the evidence the guide's owner-approved route needs, which deploys with the CLI and promotes once `test` has passed on the exact commit.
   - **It cannot release by itself.** A manual run's `test` is not in the commit's status rollup, which lists only push and pull-request runs. The challenge found this on #1519's promotion commit, where a manual and a scheduled run are absent. So Vercel's Deployment Check is not shown to see it.
   - **It has to run E2E,** as a push run does, since it is the release evidence.
   - **It has to be bound to the dropped commit.** It must name its SHA and be refused unless that SHA is still `main`'s head. On a branch, or once `main` has moved on, it would spend an E2E run on the shared Clerk test user for no release.
   - **It must not cancel a push run.** Push runs on `main` share its concurrency group, and one may be a newer promotion's release check.
   - *Recommended.*
3. **Also replace the owner-approved CLI deploy with a Git-sourced one,** such as a Vercel deploy hook. Not pursued: no evidence shows that a Deployment Check holds such a deployment's alias.
4. **Post a `test` commit status from a workflow,** so the Deployment Check sees the manual run. Rejected: a status set with the Actions token counts as coming from GitHub Actions, the ruleset's required source, so a workflow could then pass any head's required check.

## Resolution (decided)

Option 2:
- **The trigger.** `.github/workflows/ci.yml` gains `workflow_dispatch` with a required `sha` input, and E2E runs for it.
  - A first step fails the run unless it is on `main` and `main`'s head is that SHA.
  - A manual run waits for a push run in its concurrency group instead of cancelling it.
- **The tests.** `tests/ci-workflow.test.ts` pins the triggers, the input, the refusal, the concurrency setting and E2E's condition.
- **The guide.** Promote to production has a step: confirm CI's push run in the first minute, and run CI by hand when it is missing.

## Verification

- [x] Red first: the trigger, concurrency and E2E-condition cases in `tests/ci-workflow.test.ts` all failed against `main`'s workflow.
- [ ] Before merge: a manual run on this branch fails at its refusal step.
- [ ] After promotion, while no other E2E run is active: `gh workflow run ci.yml --ref main -f sha=<main's head>` passes, with E2E executed, and a run naming a stale SHA is refused. Record whether the commit's status rollup lists the manual run's `test` (due 2026-10-17).

## Related

- BUG-259 (#509) and #1367: no production deployment for a promotion, with CI present.
- #1528, whose promotion carries #1523's code to production.
