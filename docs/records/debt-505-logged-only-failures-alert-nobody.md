# DEBT-505: Failures That Are Only Logged Alert Nobody

**Status:** Verifying — the owner runs the renewal job once by hand and its response shows `scheduledChecks: running`; due 2026-11-22
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

- [ ] Owner: the renewal job's response reports `scheduledChecks: running`; due 2026-11-22.

  The owner decided on 2026-11-15 to run the job once by hand by 2026-11-22 and read the field. The call is step 4 of `docs/guides/operations/requeue-renewal-notice.md`, so its warnings apply: it runs the whole job, the route admits five requests a minute, and a call that timed out must not be blindly retried.

  ```bash
  curl --fail-with-body --silent --show-error --request POST \
    --header "Authorization: Bearer ${CRON_SECRET:?}" \
    https://addictionboards.com/api/cron/send-renewal-notices | jq .scheduledChecks
  ```

  A fallback any session can do: read production's runtime logs within an hour of a run, since Vercel keeps them for an hour. In `src/adapters/jobs/scheduled-checks.ts`, `unreadable` and `stopped` log an error and `unavailable` a warning; only `running` logs nothing. A run that stops before the check logs nothing either, so the logs can show a failure but never prove `running`; only a completed run's `scheduledChecks` field does. The 2026-11-05 date lapsed with the field unread.

## Related

- DEBT-414 F07, whose delivery check now waits on Resend's first real report.
- DEBT-503 item 3, a consumer of this path.
- BUG-321 and BUG-323, whose failures this makes visible.
- BUG-377: the second route to the owner, and the drill's delivery check.

Corrected 2026-11-15: finished build history is in git at `34d9aea0` (the implementation notes, the passed checks' receipts, the options' detail and drifted line numbers). The Sentry settings made by hand and the facts about `GITHUB_READ_TOKEN`'s expiry and the proxy's alert start moved to `docs/architecture/observability.md`. The decisions are attributed to the owner and to AUDIT-015, and the tokens are not a decision. The lapsed 2026-11-05 check is the owner's manual run by 2026-11-22, with a log read as fallback. The optional mobile-app item is dropped: the runbook's "Being noticed" covers push, and BUG-377 owns delivery. DEBT-414 F07 no longer waits on this record.
