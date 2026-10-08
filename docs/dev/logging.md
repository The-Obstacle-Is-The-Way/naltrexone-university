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

Use cases and jobs raise a condition a person must act on through the
`OperationalAlerts` port, beside the log line they already write. The adapter
sends a Sentry event that carries the kind, a count, the cooldown window and
whether the shared cooldown held. `scrubEvent` keeps an alert event to those
fields, so it carries no request, user, breadcrumb, ID or address, whatever the
scope it was raised in held.

- **Delivery.** Each kind and fixed six-hour window opens its own Sentry issue.
  The event is error level, so the issue opens as High priority, and the
  project's "Send a notification for high priority issues" workflow emails it.
  Keep that workflow enabled for production. An earlier issue need not be
  resolved for the next alert to arrive. Off Vercel, events are labelled
  `local`, so a local run never pages as production.
- **Volume.** At most one event per kind per six-hour window across all
  instances, through the Postgres limiter. If that limiter fails, or takes over
  a second to answer, the event is still sent, tagged
  `alert.shared_cooldown: unavailable`, at most once per kind per server
  instance per six hours. A slow database can therefore send one such event
  while healthy.
- **Loss.** A send Sentry does not confirm is logged as
  `operational_alert_send_failed`; its cooldowns stay taken, so check Sentry's
  status and the DSN.
- **Diagnosis.** The log line beside each alert carries the IDs, but Vercel keeps
  it for an hour. Start from the database.

| Kind | Meaning | First steps |
| --- | --- | --- |
| `renewal_notice_deadline_missed` | An annual subscription renews within 30 days and its renewal notice was never delivered. | Find its `renewal_notice_deliveries` rows; the 09:00 UTC job re-checks each run, so the alert recurs while the gap stands. Decide the remedy with counsel (DEBT-414 F07). |
| `anniversary_reminder_deadline_missed` | A monthly subscription's yearly anniversary falls within 30 days with no reminder sent. | As above, for the anniversary reminder. |
| `renewal_notice_send_by_cutoff_passed` | Dispatch refused a notice because its send-by cutoff had passed. | The row is `terminal_failure` with `send_by_cutoff_passed`. Find why it was not sent in time. |
| `renewal_notice_outcome_unknown` | The email provider's answer was ambiguous, so the notice is quarantined and never resent automatically. | The row is `outcome_unknown`. Check the provider's dashboard before any manual resend. |
| `checkout_stripe_holds_unrecorded` | A refused checkout could not record the subscription Stripe already holds (BUG-321). | Compare the user's subscription row with Stripe. The reconcile cron updates only rows that exist, so a missing row waits for the subscription's next webhook; resend its latest event from the Stripe Dashboard to record it now. |
| `clerk_backend_call_limiter_failed` | The sign-in limiter's database call failed, so it is letting requests through (BUG-323). | Check the database. While it fails, only the firewall rule bounds Clerk's Backend API calls. |

## Practices

- Prefer small, structured context objects; keep messages human-readable.
- Do not log secrets/PII. `lib/logger.ts` redacts common sensitive fields, but treat that as defense-in-depth, not permission to log secrets.
- When adding new adapters, inject `logger` via constructor/deps instead of importing global singletons.
- Structured logs and Sentry complement each other. Use logs for request-local diagnosis; use Sentry for exception aggregation and client/server telemetry.
- Do not log the caller's text. Log its length or a fixed reason instead. A refusal a request could forge is a warning or a quiet failure, not an error. A `VALIDATION_ERROR` your own server raises, such as a changed offer, is logged at warn: never silenced, and not an error. Other failures stay errors (BUG-325).
- Log a failed webhook signature check at warn: anyone can send one. An invalid payload behind a valid signature stays an error.

## Sentry flood or quota exhaustion

The browser needs Sentry's client key (DSN), so the key is public, as Sentry intends. Anyone can therefore post events straight to Sentry, without our server. The project is on Sentry's Developer plan, with 5,000 errors a month and no per-key rate limit. Spike protection is on, and limits the damage while you respond (BUG-325 item 5).

If Sentry shows a sudden flood of garbage events, or the month's usage jumps:

1. In the project's inbound filters, block the source IP addresses.
2. Create a new client key, set it as `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel, redeploy, then revoke the old key.

This is a monitoring outage, not a data breach. Escalate to the [incident response procedure](../security/incident-response-and-breach-notification.md) only if the events carry personal data.

