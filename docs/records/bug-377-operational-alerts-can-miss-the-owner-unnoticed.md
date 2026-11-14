# BUG-377: Operational Alerts Can Miss the Owner, and Nothing Notices

**Status:** Verifying — the next drill reaches the owner by Sentry's email and by its GitHub copy; due 2026-12-04
**Priority:** P2
**Date:** 2026-11-14

---

## Summary

Operational alerts reach the owner by one route: Sentry's email. On 2026-11-03 that email went missing. The alerts' workflow fired for the month's drill, and no email arrived. Nothing noticed, because the watcher checks only that the workflow fired.

The watcher reports through a GitHub issue, and so do the weekly due checks. GitHub never emailed the owner about either, because both jobs open their issues unassigned. So for weeks the owner heard nothing: not the overdue dated actions, and not the warning that Sentry's error quota is running out, which would drop alerts too.

## Evidence

- **The drill fired and its email never arrived.**
  - On 2026-11-03 at 09:54:11Z, the renewal job's drill opened ADDICTION-BOARDS-SERVER-4 in production.
  - The workflow's fire history records it at 09:54:47Z.
  - No email for it is in the owner's inbox, Trash or Spam. The owner checked Spam on 2026-11-14.
  - Emails did arrive for SERVER-1 (the first drill, 2026-10-09), SERVER-2 (2026-10-13) and SERVER-3 (an alert, 2026-11-02, from the same workflow).
- **The cause is unknown.**
  - Sentry's API keeps no record of email delivery.
  - Its status page lists no incident at that hour. The dashboard was down on 2026-11-02 from 15:20Z to 19:41Z, and the API on 2026-11-03 from 14:57Z to 16:30Z.
  - The workflow emails issue owners, falling back to recently active members (`issue_owners`, `ActiveMembers`). One Sentry forum report fixed silently missing alert emails by targeting a team instead. That is not proven here.
- **The watcher cannot see a lost email.** It reads the workflow's `lastTriggered`, which the drill moved. To the watcher, 2026-11-03 looked healthy.
- **Unassigned issues notify nobody.**
  - GitHub emails about an issue that GitHub Actions opens only to the repository's watchers and to its assignees. The owner does not watch this repository: `GET /repos/{owner}/{repo}/subscription` answers 404.
  - `operational-alert-watcher.ts` and `documentation-due-checks.ts` call `createGithubAlertIssues()` with no assignee. `security-txt-renewal.mts` opens its reminders unassigned too, though none has opened yet.
  - The owner's mail has no email about #1610 (the watcher's issue, opened 2026-10-27 and reopened 2026-11-13) or #1569 (the due checks).
  - The release, fix and advisory watches assign the owner, as DEBT-515 established a week after the watcher shipped, and their emails arrive.
- **What went unseen.** #1569 listed 14 overdue dated actions, some for three weeks. #1610 has reported Sentry's error quota past 80% since 2026-11-13.

## Impact

No subscriber is affected before the first live sale. After it, the same gaps could hide alerts that need the owner. A lost alert email could leave a missed renewal-notice deadline, a blocked checkout or a disabled sign-in limiter unnoticed. An unassigned watcher issue hides the checks that exist to catch exactly that.

## Options

1. **Assign the owner on every job's issue.** The watcher and the due checks then reach the owner. This does not cover a lost Sentry email.
2. **Email the owner directly from the workflow,** instead of issue owners falling back to active members. That may make delivery more reliable, but it is unproven and still one route, and the change is the owner's.
3. **Copy each fired alert into a GitHub issue assigned to the owner.** The daily watcher reads which issues the workflow fired for, from the same history it already trusts, and opens a GitHub issue for each. That is a second route, through another provider. The monthly drill then proves both routes. The copy can arrive up to a day late, since GitHub starts the schedule hours late.
4. **Push alerts through Sentry's mobile app.** Push leaves from the same Sentry pipeline as the email, so it would likely fail with it.

## Resolution (decided)

Options 1 and 3.
- **Assignment.** `createGithubAlertIssues` and the security.txt reminders' adapter take the assignee as a required argument, so a job cannot open an issue for the owner without deciding who gets it. Every scheduled job passes the repository owner that Actions names in `GITHUB_REPOSITORY_OWNER`. A local run has no owner and assigns no one.
- **Copies.**
  - Each issue the alerts' workflow fired for in the last seven days gets one GitHub issue, titled with Sentry's issue ID and title, as Sentry's email subject is. It is assigned to the owner and stays open until closed.
  - Each copy's description holds the issue's last fire time. A refire therefore changes it, and the watcher reopens the copy and comments. A copy the owner closed stays closed until then.
  - A failed read of the fire history becomes one of the watcher issue's findings.

Option 2 is held for evidence: if the next drill's Sentry email goes missing while its copy arrives, retarget the workflow, with the owner's approval. Option 4 is not taken.

## Verification

- [x] Red first: each of the three jobs, run as the workflow runs it, assigns its issue to the owner (2026-11-14).
- [x] Red first: a fired alert opens one copy; a second run changes nothing; a refire reopens it with a comment; a closed copy stays closed; a failed or full history read is reported (2026-11-14).
- [ ] After promotion, the next drill, in the cycle from 2026-12-03, reaches the owner both as Sentry's email and as the copy's GitHub email; due 2026-12-04.

## Related

- DEBT-505: the alerts, the drill and the watcher this record repairs.
- DEBT-515: the assignment convention that the watcher and the due checks predate.
