# Logging

**Last Updated:** 2026-10-06

## Source of truth

- Implementation: `lib/logger.ts` (Pino)
- Adapter contract: `src/application/ports/logger.ts`
- Request-scoped helpers: `lib/request-context.ts`
- Server telemetry bootstrap: `instrumentation.ts`
- Client telemetry helper: `lib/report-client-error.ts`

## Adapter logger contract

Adapters (controllers, gateways, repositories) depend on a minimal `Logger` interface:

- Methods: `debug`, `info`, `warn`, `error`
- Signature: `(context, message)`

This matches Pino’s native API so log fields stay structured:

```ts
logger.warn({ userId, attempt }, 'Retrying external API call');
logger.error({ error, eventId }, 'Stripe webhook failed');
```

## Default levels

Unless `LOG_LEVEL` is explicitly set:

- Test: `silent`
- Development / Vercel preview: `debug`
- Production / Vercel production: `info`

This behavior is covered by `lib/logger.test.ts`.

## Request-scoped logging

Five existing entry points create a request context and derive a child logger:

```ts
const ctx = createRequestContext();
const logger = getRequestLogger(ctx);
```

That child logger automatically carries `requestId`, and can also include `userId` when available.

The duplicate ID and manual propagation are planned for removal in
[DEBT-504](../debt/debt-504-duplicate-request-correlation.md). Do not extend this
pattern to new routes. Keep explicit logger injection.

## Retention and verification

The account APIs confirmed Vercel Hobby and Sentry Developer on 2026-10-06.
Vercel [retains Hobby runtime logs for one hour](https://vercel.com/docs/logs/runtime).
Capture an operational check while its logs still exist; a two-week retrospective
absence check cannot use this store.

`lib/logger.ts` writes pino JSON to stdout. `instrumentation.ts` initializes
Sentry exception/tracing capture, with no pino integration or log forwarding.
A caught error that is only logged is not thereby a Sentry event. An alert on
such an outcome needs explicit, bounded telemetry or a retained operational
receipt; do not claim a Sentry search proves its absence.
[DEBT-505](../debt/debt-505-logged-only-failures-alert-nobody.md) added that
path for the conditions a person must act on: see Operational alerts below.

## Operational alerts

Use cases, jobs and the proxy raise a condition a person must act on through
the `OperationalAlerts` port, beside the log line they already write. The adapter
sends a Sentry event that carries the kind, a count, the cooldown window and
whether the shared cooldown held. `scrubEvent` keeps an alert event to those
fields, so it carries no request, user, breadcrumb, ID or address, whatever the
scope it was raised in held. The server sends no release-health sessions,
which would copy the scope's user past `scrubEvent`.

- **Delivery.** Each kind and fixed six-hour window opens its own Sentry issue,
  and the workflow "Operational alerts — email the owner (DEBT-505)" emails each
  new one: production only, events tagged `alert.kind`, no throttling. It does
  not depend on the default "high priority issues" workflow, so that one can be
  changed to tune ordinary error email. Keep the alerts' own workflow enabled.
  An earlier issue need not be resolved for the next alert to arrive. Both
  workflows live on the server project, `addiction-boards-server`, whose key
  no browser receives, so the browser's public key cannot fake an alert.
  Off Vercel, events are labelled `local`, so a local run never pages as
  production.
- **Volume.** At most one event per kind per six-hour window across all
  instances, through the Postgres limiter. If that limiter fails, or takes over
  a second to answer, the event is still sent, tagged
  `alert.shared_cooldown: unavailable`, at most once per kind per server
  instance per six hours. A slow database can therefore send one such event
  while healthy.
- **Loss.** A send the SDK cannot finish is logged as
  `operational_alert_send_failed`; its cooldowns stay taken, so check Sentry's
  status and the DSN. `operational_alert_unavailable` means the proxy could not
  build the alerts at all, and `operational_alert_shared_cooldown_unavailable`
  that the Postgres cooldown failed or was slow. An event Sentry refuses, for
  quota or rate limit, is dropped without a log line: a flood that uses up the
  month's quota also silences the alerts (see the flood section below).
- **Diagnosis.** The log line beside each alert carries the IDs, but Vercel keeps
  it for an hour. Start from the database.
- **Being noticed.** An alert protects nothing if it sits unread. Its email
  comes from `noreply@md.getsentry.com` with a subject containing
  "Operational alert". Keep a Gmail filter that stars them, marks them
  important, labels them and never sends them to spam, and keep the Sentry
  mobile app's push notifications on for issue alerts. The watcher below
  reports through a GitHub issue, whose email comes from
  `notifications@github.com`, so the filter's query names both senders:
  `(from:noreply@md.getsentry.com subject:"Operational alert") OR (from:notifications@github.com subject:"Operational alerts may not be reaching the owner")`.
- **Drill.** The renewal job sends one `operational_alert_drill` per fixed
  30-day cycle, from the first run that claims the cycle's row in
  `operational_alert_drills`, so the inbox keeps proving the path. Its email
  reads "Operational alert drill: no action needed". The default high-priority
  workflow may also match it, so expect one or two emails; one must come from
  the alerts' workflow. The job's response reports
  `alertDrill`: `raised` means Sentry accepted it, and only the inbox proves
  delivery; `not_sent` means it failed or met a cooldown and gave its cycle
  back, so the next daily run retries. A manual run (`vercel crons run
  /api/cron/send-renewal-notices`) sends one only if the current cycle's has
  not gone out.
- **Watcher.** Neither the alerts nor the drill notice their own absence: a
  stopped cron raises nothing. The renewal job checks in with the Sentry cron
  monitor `send-renewal-notices` on each run it admits, and a daily GitHub
  Actions job, "Operational alert watcher"
  (`scripts/operational-alert-watcher.ts`), reads Sentry at 11:37 UTC. This is
  the one list of its checks. It keeps one GitHub issue, "Operational alerts
  may not be reaching the owner", open while:
  - the job has not checked in for 25 hours, or its last run's status is not
    `ok`;
  - the monitor is disabled or muted;
  - the alerts' workflow is disabled or differs from its recorded setup;
  - the workflow has sent nothing in 32 days, though the drill makes it send
    every 30 (Sentry keeps the drill's own event for 30 days only, so the
    workflow's last send is read);
  - more than 80% of the organization's 5,000 monthly errors were used in the
    last 30 days;
  - Sentry dropped server-project errors in the last two days;
  - or a read fails: a server error or no answer is tried once more, and a
    refusal names its HTTP status.

  It closes the issue once every check passes. It reads Sentry with the
  repository secret `SENTRY_WATCHER_TOKEN`: in Sentry, Settings → Custom
  Integrations → Create New Integration → Internal Integration, with Read on
  Project, Organization and Alerts and nothing else. Without the token the
  issue says the watcher is not configured.
- **Watching the watcher.** GitHub disables a public repository's scheduled
  workflows after 60 days without activity, without notice, and a watcher that
  stops looks like one with nothing to report. So the renewal job checks the
  GitHub side each day, as the watcher checks the job: it reads the
  repository's workflows from GitHub's API and raises
  `scheduled_checks_stopped` when any workflow is disabled for inactivity, or
  the watcher is not active or has not succeeded for three days. Either system
  stopping is reported through the other. A keep-alive commit or API call is
  not used: it works around GitHub's rule, and GitHub disabled the best-known
  keep-alive action's repository for a terms violation. The job reports the
  check as `scheduledChecks`: `running`; `stopped`; `unreadable`, alerted as
  `scheduled_checks_unreadable`, when GitHub refused the read or answered in
  an unexpected shape, since an expired or revoked token would otherwise stop
  the check silently; or `unavailable` for a rate limit or a GitHub outage,
  which passes and is only logged with its HTTP status. The check reads
  GitHub with `GITHUB_READ_TOKEN`; without it, a rate limit is the missing
  token, not a passing condition, so it alerts as
  `scheduled_checks_unreadable`, as does a token the request header refuses.
  The log names the reason and status. One case stays silent: GitHub
  unreachable from Vercel for days, which would also stop the watcher's own
  runs; the monthly drill email then still arrives through Sentry.
- **A known repeat.** A drill whose send Sentry did not confirm gives its
  cycle back even if Sentry received it, so while flushes fail the owner may
  get a drill email each day.

| Kind | Meaning | First steps |
| --- | --- | --- |
| `renewal_notice_deadline_missed` | An annual subscription renews within 30 days, and one of its two notices, the annual reminder or the renewal notice, was never accepted by the email provider. | Find its `renewal_notice_deliveries` rows; the 09:00 UTC job re-checks each run, so the alert recurs while the gap stands. Decide the remedy with counsel (DEBT-414 F07). |
| `anniversary_reminder_deadline_missed` | A monthly subscription's yearly anniversary falls within 30 days with no reminder sent. | As above, for the anniversary reminder. |
| `renewal_notice_send_by_cutoff_passed` | Dispatch refused a notice because its send-by cutoff had passed. | The row is `terminal_failure` with `send_by_cutoff_passed`. Find why it was not sent in time. |
| `renewal_notice_outcome_unknown` | The email provider's answer was ambiguous, so the notice is quarantined and never resent automatically. | The row is `outcome_unknown`. Check the provider's dashboard before any manual resend. |
| `checkout_stripe_holds_unrecorded` | A refused checkout could not record the subscription Stripe already holds (BUG-321). | Compare the user's subscription row with Stripe. The reconcile cron updates only rows that exist, so a missing row waits for the subscription's next webhook; resend its latest event from the Stripe Dashboard to record it now. |
| `clerk_backend_call_limiter_failed` | The sign-in limiter's database call failed, so it is letting requests through (BUG-323). | Check the database. While it fails, only the firewall rule bounds Clerk's Backend API calls. |
| `scheduled_checks_unreadable` | GitHub refused the renewal job's read of the repository's workflows, or answered in a shape it cannot read. | Check `GITHUB_READ_TOKEN` in Vercel Production: it may be missing, expired or revoked. Replace it with a fine-grained token, read-only Actions access to this repository only, and redeploy. If the token is fine, GitHub's API may have changed. |
| `scheduled_checks_stopped` | A scheduled GitHub workflow is disabled for inactivity, or the operational alert watcher is not active or has not succeeded for three days. | In GitHub's Actions tab, re-enable each disabled workflow (`gh workflow enable <file>`), and open the watcher's latest run to see why it failed. The next daily check confirms. A workflow other than the watcher that is disabled by hand is not alerted on. |
| `operational_alert_drill` | A drill: the renewal job sends one per fixed 30-day cycle, through the same path as the deadline alerts. | None; its email proves the path works. If none arrives for 32 days, the watcher's issue says so; treat the alert path as broken: check the server project's recent issues for `alert.kind:operational_alert_drill`, its "Operational alerts — email the owner (DEBT-505)" workflow, and `SENTRY_DSN`. |

## Practices

- Prefer small, structured context objects; keep messages human-readable.
- Do not log secrets/PII. `lib/logger.ts` redacts common sensitive fields, but treat that as defense-in-depth, not permission to log secrets.
- When adding new adapters, inject `logger` via constructor/deps instead of importing global singletons.
- Structured logs and Sentry complement each other. Use logs for request-local diagnosis; use Sentry for exception aggregation and client/server telemetry.
- Do not log the caller's text. Log its length or a fixed reason instead. A refusal a request could forge is a warning or a quiet failure, not an error. A `VALIDATION_ERROR` your own server raises, such as a changed offer, is logged at warn: never silenced, and not an error. Other failures stay errors (BUG-325).
- Log a failed webhook signature check at warn: anyone can send one. An invalid payload behind a valid signature stays an error.

## Sentry flood or quota exhaustion

The browser needs its Sentry project's client key (DSN), so that key is public, as Sentry intends. Anyone can therefore post events to the browser project, without our server. Server events go to a separate server project, `addiction-boards-server`, whose key (`SENTRY_DSN`) no browser receives (DEBT-505). The plan is Sentry's Developer plan, with 5,000 errors a month and no per-key rate limit. Spike protection is on, and limits the damage while you respond (BUG-325 item 5). The month's errors are shared by both projects, so a browser flood that uses them up also stops the [operational alerts](#operational-alerts) until the month resets: treat it as an alerting outage too.

If Sentry shows a sudden flood of garbage events, or the month's usage jumps:

1. In the project's inbound filters, block the source IP addresses.
2. In the flooded project, create a new client key: for the browser project set it as `NEXT_PUBLIC_SENTRY_DSN`, for the server project as `SENTRY_DSN` (sensitive), in Vercel. Redeploy, then revoke the old key. A flood in the server project means its key leaked.

This is a monitoring outage, not a data breach. Escalate to the [incident response procedure](../security/incident-response-and-breach-notification.md) only if the events carry personal data.

