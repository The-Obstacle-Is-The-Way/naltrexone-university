# DEBT-523: A Push to Main That GitHub Drops Has No Way to Run Its Checks

**Status:** Verifying — a manual CI run on `main` executes and passes E2E on `main`'s exact head; due 2026-10-17
**Priority:** P2
**Date:** 2026-10-15

---

## Summary

On 2026-10-15, promotion #1523 merged as `main` `2f1278a1`, carrying #1522's twelve dependency updates. GitHub never processed the push:
- no check suite was created for the commit, so there was no CI run and no `test` check;
- no Vercel deployment was created either;
- production kept serving the previous promotion, `8354159a`.

CI ran only on `pull_request` and on `push` to `main`, so nothing could run it on that commit. The promotion guide's manual route was also out of reach. It deploys with `vercel deploy --prod --skip-domain` and promotes only after `main`'s `test` passes on the exact commit, and that check could not exist.

The only recovery was another change through review and promotion, which takes hours because CodeRabbit's single review slot is shared by every session.

## Evidence

- **No suites.** `commits/2f1278a1…/check-suites` returned `total_count` 0 from the merge at 15:44:17Z until 17:06Z. Then the scheduled upstream advisory watch ran on `main`'s head, and its suite was the only one; at 19:26Z there was still no CI suite and no deployment for the SHA. The commit had no statuses.
- **Not GitHub's status page.** githubstatus.com showed no incident.
- **Not the repository's settings.** The promotion before it (`8354159a`) and `dev`'s `0b2a9282` got their suites within a second.
- **The receipts** are on #1523.

## Impact

- **Production silently lags `main`.** Today that held twelve dependency updates, including Clerk and Sentry patches, out of production for hours.
- **The third time.** #509 (BUG-259) and #1367 had no production deployment either, but in those Vercel alone skipped, and CI ran. This is the first time GitHub dropped the push itself.

## Options

1. **Wait for the next promotion.** No change, but each occurrence costs a review slot and a promotion, and production lags meanwhile.
2. **Let CI be run by hand on `main`.** `workflow_dispatch` gives `main`'s exact head a `test` check in one CI run. E2E has to run in it, as on a push: otherwise a manual run would release to production on a `test` check that skipped E2E. A manual run on any other branch has to be refused, because it would test that branch's head and replace the head's pull-request `test` result. *Recommended.*
3. **Also replace the owner-approved CLI deploy with a Git-sourced one,** such as a Vercel deploy hook. Not pursued: no evidence shows that a Deployment Check holds such a deployment's alias, and the owner-approved route works once option 2 supplies the `test` check.

## Resolution (decided)

Option 2:
- **The trigger.** `.github/workflows/ci.yml` gains `workflow_dispatch`, and E2E runs for it. A first step fails the run unless the ref is `main`.
- **The tests.** `tests/ci-workflow.test.ts` pins the triggers, the refusal and E2E's condition.
- **The guide.** [Promote to production](../guides/release/promote-to-production.md) has a step: read the commit's check suites in the first minute, and run CI by hand when they are missing.

## Verification

- [x] Red first: the new trigger case and the changed E2E-condition case in `tests/ci-workflow.test.ts` both failed before the workflow changed.
- [ ] Before merge: a manual run on this branch fails at its refusal step.
- [ ] After promotion: `gh workflow run ci.yml --ref main` gives `main`'s exact head a passing `test`, with E2E executed (due 2026-10-17).

## Related

- BUG-259 (#509) and #1367: no production deployment for a promotion, with CI present.
- #1528, whose promotion carries #1523's code to production.
