# DEBT-523: A Push to Main That GitHub Drops Has No Way to Run Its Checks

**Status:** Verifying — the release watch's first week of scheduled gaps stays under a day, with no `scheduled_checks_stopped` for either watch; due 2026-10-23
**Priority:** P2
**Date:** 2026-10-15

---

## Summary

On 2026-10-15, promotion #1523 merged, carrying #1522's twelve dependency updates. GitHub never processed the push of its merge commit:
- no check suite was created for the commit, so there was no CI run and no `test` check;
- no Vercel deployment was created either;
- production kept serving the previous promotion's release (#1519).

CI ran only on `pull_request` and on `push` to `main`, so nothing could run it on that commit. The promotion guide's manual route was also out of reach. It deploys with `vercel deploy --prod --skip-domain` and promotes only after `main`'s `test` passes on the exact commit, and that check could not exist.

The recovery left was another change through review and promotion, which takes hours, because CodeRabbit's single review slot is shared by every session.

Recovered the same day, with the owner's approval, by a manual release of that commit.
- A draft PR whose head was the commit gave it a passing `test`, with E2E.
- An API deployment from GitHub's copy waited, staged, for a promotion.
- Production has served the commit since 23:38:33Z. The receipts are on #1523.

## Evidence

- **No suites.** The merge commit had no check suite from the merge at 15:44:17Z until 17:06Z. Then the scheduled upstream advisory watch ran on `main`'s head, and its suite was the only one. At 19:26Z there was still no CI suite and no deployment for the commit, and it had no statuses.
- **GitHub recorded no push.** GitHub's activity listing for `main` has no entry for the merge. Its newest entry is #1519's promotion, although `main` points at #1523's merge commit.
- **Not GitHub's status page.** githubstatus.com showed no incident.
- **Not the repository's settings.** #1519's promotion and #1522's merge into `dev` each got their suites within two seconds.
- **The receipts,** with SHAs, are on #1523.
- **The watch's schedule runs hours late.** On 2026-10-16 the watch reached `main` at 11:20Z. Its first scheduled run came at 15:24Z, for the 15:23Z slot; none came for the three slots before it. A dispatched run had passed meanwhile.
  - That lateness is normal here. This repository's daily jobs start 4 to 10 hours late. The three-hourly advisory watch gets about 3.6 of its 8 slots a day, with gaps of up to 10.4 hours.
  - Nothing in the repository blocks the schedule. The workflow is `active` on `main`, the default branch, and its cron is quoted and valid. The repository is public, not a fork or archived, and Actions is enabled. Its runners are the standard ones, free for public repositories, and none of the last day's runs was refused a start.

## Impact

- **Production silently lags `main`.** Today that held twelve dependency updates, including Clerk and Sentry patches, out of production for hours.
- **The third time.** #509 (BUG-259) and #1367 had no production deployment either, but in those Vercel alone skipped, and CI ran. This is the first time GitHub dropped the push itself.
- **Nothing reported it.** Each time, production lagged until someone happened to check the commit. No job compares `main`'s head with what production serves.
- **A watch that stops is silent too.** GitHub can stop a schedule without notice. It does so after 60 days without activity (DEBT-505). In January 2026 a change GitHub then rolled back stopped some repositories' schedules until a push to the default branch resynced them, and reports of stopped schedules continued into September. A watch that never runs reads like one with nothing to report.
  - Nothing in the app checks the release watch.
  - Nothing checks the advisory watch either (DEBT-509). This week it went 47.5 hours without a successful scheduled run, failing on read refusals (BUG-344), and nothing in the app alerted.

## Options

1. **Wait for the next promotion.** No change, but each occurrence costs a review slot and a promotion, and production lags meanwhile.
2. **Let CI be run by hand on `main`.** `workflow_dispatch` gives the dropped commit a full CI run, E2E included, within one run's time. That run is the evidence the guide's owner-approved route needs, which deploys the commit and promotes it once `test` has passed on that exact commit.
   - **Vercel's check tracks it.** A manual run's `test` is a check run on the commit, although the commit's status rollup lists only the push run's. After "Promote #1530" was released, its production deployment's check recorded the manual run's `test`, the latest one on the commit. Whether a passing manual run releases a held deployment by itself is not observed, so the guide's release route keeps its promote step. A failed manual run, a refused one included, also turns that check red until a later `test` passes. *Corrected 2026-10-16: the challenge read the rollup alone, which leaves manual runs out, as the rollup of #1519's promotion commit showed.*
   - **It has to run E2E,** as a push run does, since it is the release evidence.
   - **It has to be bound to the dropped commit.** It must name its SHA and be refused unless that SHA is still `main`'s head. On a branch, or once `main` has moved on, it would spend an E2E run on the shared Clerk test user for no release.
   - **It must not cancel a push run.** Push runs on `main` share its concurrency group, and one may be a newer promotion's release check.
   - *Recommended.*
3. **Deploy from GitHub's copy instead of a local checkout.** Vercel's API creates a production deployment from a `gitSource` (repository, ref and SHA). #1523's release on 2026-10-15 tested it:
   - the Deployment Check held it `STAGED`, "Waiting for checks to complete";
   - it never released itself, because `test` had passed 25 s before it existed, and it needed the promote step;
   - its promotion created no GitHub `Production` deployment, so the route ends by recording one.
   - *Adopted as the guide's step 3,* with the CLI upload as the fallback.
4. **Detect the lag on a schedule.** An hourly job reads `main`'s head and opens an issue for the owner if the head is 45 minutes old with no passing CI run on `main`, or no successful GitHub deployment to Vercel's `Production` environment.
   - Vercel reports each production release there, so this catches all three incidents with only the Actions token, and no Vercel credential.
   - A manual run counts as CI.
   - Neither manual release, through the API or the CLI, creates a GitHub deployment, so the guide's manual route ends by recording one.
   - *Recommended, with option 2.*
5. **Post a `test` commit status from a workflow,** so the Deployment Check sees the manual run. Rejected: a status set with the Actions token counts as coming from GitHub Actions, the ruleset's required source, so a workflow could then pass any head's required check.
6. **Watch the watches.** DEBT-505's renewal job, a Vercel cron that runs daily at 09:00Z, also reads the last successful scheduled run of the release watch and of the advisory watch. It raises `scheduled_checks_stopped` when either has had none for 24 hours, counted from the workflow's creation if none has run yet, or when either is missing or not active.
   - **Why 24 hours.** The advisory watch's longest gap between scheduled runs since 2026-10-08 is 10.4 hours, so a working schedule does not trip it.
   - **A failing watch alerts too.** The check counts only successful runs, so a watch whose runs all fail for a day alerts as well. That would have caught the advisory watch's 47.5 hours this week.
   - **Detection takes up to two days.** The job runs once a day, and the window is a day.
   - **No stand-ins.** A manual run does not count, because it would hide a stopped schedule. A run is dated by when the scheduler created it, so a re-run of an old run cannot hide a stop.
   - **Cost.** Two more reads a day, with the existing read-only token.
   - *Recommended.*
7. **Trigger the watches from outside GitHub.** A Vercel cron would call GitHub's dispatch API every hour. One September report moved to that after pushes did not restart its schedule. It needs a token that can start workflows stored in Vercel, a write credential where today there is only a read one. Reconsidered on 2026-10-23, with the release watch's first week of gaps, or sooner if option 6 alerts.

## Resolution (decided)

Options 2, 3 and 4:
- **The trigger.** `.github/workflows/ci.yml` gains `workflow_dispatch` with a required `sha` input, and E2E runs for it.
  - A first step fails the run unless the input is a full SHA, the run is on `main` at that SHA, and `main`'s head, read again when the step runs, is still that SHA. The run's SHA is fixed at dispatch, and the run can wait behind a push run.
  - A manual run waits for an in-progress push run in its concurrency group instead of canceling it. Any later push-event run, a re-run included, cancels the manual run. Usually `main` has then moved on, and the newer head's push run is the release check; otherwise the manual run is dispatched again.
- **The tests.** `tests/ci-manual-run.test.ts` pins the triggers, the input and the concurrency setting, and runs the refusal step's script against a stand-in `git`. `tests/ci-workflow.test.ts` pins E2E's condition.
- **The watch.** `.github/workflows/production-release-watch.yml` runs `scripts/production-release-watch.ts` hourly. It keeps one issue, assigned to the owner, open while `main`'s head has no passing CI run on `main` or no successful GitHub deployment to `Production`.
  - CI is checked first, so a head that production already serves still raises the issue if CI never passed on it.
  - It leaves an open issue alone while the head is new or CI is still running.
  - It reads the head from the commit list, because a single commit's response carries every file's patch.
  - It reads every page of each list: CI runs, deployments and each deployment's statuses. It takes a deployment's newest status by time, then by ID, since GitHub does not document their order. A status it cannot read fails the run rather than being skipped.
  - Its test pins its schedule and its least-privilege permissions.
- **The guide.** Promote to production describes the watch and has these steps:
  - confirm CI's push run in the first minute;
  - run CI by hand when it is missing;
  - deploy from GitHub's copy, promote once `test` has passed, and record the release.
- **The watches are watched (option 6).** The renewal job's check gains the release watch and the advisory watch, each with a 24-hour window, and `docs/architecture/observability.md`'s runbook covers a stopped schedule. *Corrected 2026-10-16: hourly is the watch's schedule, not a guarantee. GitHub starts its runs hours late, and can stop them.*
- **Still the owner's.** The manual run cannot deploy: Vercel builds production only on a push it hears about. The fast route therefore still needs the owner's approval of each manual deploy. Without the owner, the next promotion releases the code.
  - On 2026-10-15 the owner kept that approval per incident, and declined a standing permission for agents.

## Verification

- [x] Red first: the trigger, concurrency and E2E-condition cases in `tests/ci-workflow.test.ts` all failed against `main`'s workflow. The trigger and concurrency cases have since moved to `tests/ci-manual-run.test.ts`.
- [x] After review: `tests/ci-manual-run.test.ts` runs the refusal step's script against a stand-in `git`. It lets a run on `main`'s current head go on. It refuses a run on another branch, at another commit, after `main` has moved on, or when `main`'s head cannot be read.
  - The first version kept its whole check in the step's `if:`, which a test of the script cannot run. So these cases were not a reproduction of its gap.
  - What they do prove: without the comparison with the re-read head, the moved-on and unreadable cases fail.
- [x] Before merge: a manual run on this branch failed at its refusal step. Every later step was skipped except the two that always run, `Evidence summary` and `Postgres log`.
- [x] The deployment from GitHub's copy, on #1523's release: the Deployment Check held it staged, the promote step released it, and no GitHub `Production` deployment followed.
- [x] After promotion: a scheduled run of the production release watch on `main` succeeds and opens no issue. The first, at 15:24Z on 2026-10-16, found production serving `main`'s head, and no issue exists.
- [x] After promotion, while no other E2E run was active, on "Promote #1530"'s merge commit:
  - a manual run naming a stale SHA was refused at its first step;
  - one naming the head passed, with E2E executed;
  - **the status rollup does not list the manual run,** only the push run's `test`. Vercel's check does track it, as option 2 says.
- [x] A dispatched run of the release watch on `main` passed, and found production serving `main`'s head.
- [x] Red first: ten new cases failed before the renewal job's check and its GitHub read covered the two watches.
  - They cover: reading each watch's last scheduled success; a refused or missing read; dating a run by its creation; a day without a scheduled success; a watch that never succeeded; and a missing or inactive watch.
  - The boundary cases pass against either version: just under a day, a new watch's first day, and a watch counted once.
  - A later case pins the alert's count, three for two stopped watches and a stale watcher. It fails if the count becomes one for any number of stopped watches.
- [x] Before merge, read live through the gateway on 2026-10-16: the advisory watch's last successful scheduled run was that morning. The release watch had none yet, still within its first day, so the check read `running`.
- [ ] On 2026-10-23: the release watch's first week of gaps between scheduled runs stays under 24 hours, and the renewal job raised no `scheduled_checks_stopped` for either watch. Option 7 is reconsidered with those gaps.

## Related

- BUG-259 (#509) and #1367: no production deployment for a promotion, with CI present.
- #1531, the release check that let #1523's merge commit be released by hand.
