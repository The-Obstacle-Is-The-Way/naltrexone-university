# DEBT-505: Failures That Are Only Logged Alert Nobody

**Status:** Verifying — every check is recorded, and the record closes; due 2026-11-25
**Priority:** P2
**Date:** 2026-10-06

---

## Summary

Several conditions a person must act on were only written to the server log. That log goes to stdout, which Vercel's Hobby plan keeps for about an hour, and nothing forwarded it to Sentry. So nobody would have seen them.

The sharpest case is renewal consent: a renewal notice that missed its legal deadline raised only a log line. The same gap hid a blocked checkout whose sync failed and a sign-in limiter that had switched itself off.

## Evidence

At filing (2026-10-06):
- pino wrote to stdout only. Sentry received thrown request errors through `onRequestError`, not log lines, and the project had no log drains.
- The renewal job's missed notice deadlines and anniversary reminders, dispatch's refusal and quarantine alerts, BUG-321's failed checkout sync and BUG-323's limiter failure were log lines only.
- Sentry's plan allows 5,000 errors a month, so forwarding every error line was not affordable, and BUG-318 showed that broad collection leaks credentials.

## Impact

The product is pre-revenue, so nothing was missed. Once annual subscribers exist, a missed renewal-notice deadline is a compliance failure (DEBT-414 F07) that nobody would learn of in time.

## Options

1. Forward every error-level log line to Sentry: noisy, over quota, and it widens collection, which BUG-318 narrowed.
2. An explicit alert port with bounded delivery (chosen).
3. Vercel Pro with a log drain to an alerting service: it costs money and still needs alert rules.

## Resolution (decided)

Option 2. The `OperationalAlerts` port raises a kind from a closed list, with a count only. The adapter sends at most one Sentry event per kind per six-hour window to the server project (while the shared Postgres cooldown fails or takes over a second, one per kind per server instance, tagged `alert.shared_cooldown: unavailable`), whose own workflow emails the owner. A monthly drill proves the path, a daily watcher notices when it stops, and the renewal job checks that GitHub has not stopped the watcher. The drill and the watcher reached production with promotion #1439 on 2026-10-09. The design, its runbook and the Sentry settings made by hand are in `docs/architecture/observability.md`, "Operational alerts".

Decisions:
- Server events moved to their own Sentry project, `addiction-boards-server`, so the browser's public key cannot fake an alert (2026-10-08, approved by the owner). Both projects share the plan's monthly error quota, so a browser flood that uses it up silences the alerts too, and Sentry drops them unseen (`docs/architecture/observability.md`, "Sentry flood or quota exhaustion").
- The path is watched, not assumed, by the drill, the watcher and the owner's inbox filter (2026-10-08, AUDIT-015, the register audit the owner asked for).

## Verification

Every other check passed between 2026-10-08 and 2026-11-14. The drill's delivery check moved to BUG-377.

- [x] Owner: the renewal job's response reports `scheduledChecks: running`; due 2026-11-22. Passed 2026-11-23: the response could not be read, so the field's value was deduced from the run's status and logs.

  Production's `CRON_SECRET` is a Sensitive variable: the dashboard shows no value to copy, so the `curl` below could not be run. The owner ran `vercel crons run /api/cron/send-renewal-notices` (Vercel CLI 66.6.0) instead; Vercel sends the secret itself, and the command prints no response body. In `src/adapters/jobs/scheduled-checks.ts` every outcome but `running` writes a line, the job runs the check before the notices (`src/adapters/jobs/send-due-renewal-notices.ts`), and the route answers 200 only with the job's result (`app/api/cron/send-renewal-notices/route-handler.ts`). So a run that answers 200 and writes no line reports `running`, if its lines would reach the logs. The owner ran it after that pass condition and its control were put to them.
  - The control. At 18:06:12Z an unauthenticated request to the route got a 401 and wrote one `Unauthorized cron request` warning through the same logger. `vercel logs --environment production --query 'requestPath:/api/cron/send-renewal-notices'` returned it within a second, from production deployment `dpl_GwyQfXqhGms2Y64N9oDNM5oi8C27` (main `3bced77e`).
  - The run. Request `8wnqw-1795457262977-3f56be8c99b4`, from `vercel-cron/1.0` at 18:07:42.977Z, answered `httpStatus` 200 on the same deployment (`vercel logs requests`). Production's runtime logs held no line from 18:07:30Z to 18:11:53Z: none on its path, none with its request ID, none containing `scheduled`, none at all. At 18:12Z the same query from 18:06Z still returned the control.
  - Earlier runs agree. `unavailable` raises no alert, and this search came before the run, so it covers only earlier runs: the owner's mailbox held no Sentry email naming `scheduled_checks_unreadable` or `scheduled_checks_stopped`, ever (searched at about 18:00Z; the same search finds the `clerk_session_tokens_rejected` alert's email). GitHub at 18:00Z showed every workflow active, the watcher's last success at 2026-11-22T18:37:55Z, and both watches' last scheduled successes at about 13:00Z.

  An earlier run at 16:23Z also answered 200 and wrote no line, but with no control that proved nothing.

  The owner decided on 2026-11-15 to run the job once by hand by 2026-11-22 and read the field. The call is step 4 of `docs/guides/operations/requeue-renewal-notice.md`, so its warnings apply: it runs the whole job, the route admits five requests a minute, and a call that timed out must not be blindly retried.

  ```bash
  ( set -o pipefail
    curl --fail-with-body --silent --show-error --request POST \
      --header "Authorization: Bearer ${CRON_SECRET:?}" \
      https://addictionboards.com/api/cron/send-renewal-notices |
      jq -e '.scheduledChecks == "running"' )
  ```

  It prints `true` and succeeds only when the field is `running`; an HTTP error or any other value fails it.

  A fallback any session can do: read production's runtime logs within an hour of a run, since Vercel keeps them for an hour. In `src/adapters/jobs/scheduled-checks.ts`, `unreadable` and `stopped` log an error and `unavailable` a warning; only `running` logs nothing. A run that stops before the check logs nothing either, so the logs alone can show a failure but never prove `running`; a completed run's `scheduledChecks` field does, and so does a 200 with no line once a control shows the route's lines arrive. The 2026-11-05 date lapsed with the field unread.

## Related

- DEBT-414 F07, whose delivery check now waits on Resend's first real report.
- DEBT-503 item 3, a consumer of this path.
- BUG-321 and BUG-323, whose failures this makes visible.
- BUG-377: the second route to the owner, and the drill's delivery check.

Corrected 2026-11-15: finished build history is in git at `34d9aea0` (the implementation notes, the passed checks' receipts, the options' detail and drifted line numbers). The Sentry settings made by hand and the facts about `GITHUB_READ_TOKEN`'s expiry and the proxy's alert start moved to `docs/architecture/observability.md`. The decisions are attributed to the owner and to AUDIT-015, and the tokens are not a decision. The lapsed 2026-11-05 check is the owner's manual run by 2026-11-22, with a log read as fallback. The optional mobile-app item is dropped: the runbook's "Being noticed" covers push, and BUG-377 owns delivery. DEBT-414 F07 no longer waits on this record.

Corrected 2026-11-23: the owner's check keeps its wording and the 2026-11-15 decision to read the field. Without the secret the response cannot be read, so the field was deduced from the run's 200 and its silent logs, under a control. The fallback paragraph now names that case: the 200 shows the run did not stop before the check, and the control shows its lines would have arrived.
