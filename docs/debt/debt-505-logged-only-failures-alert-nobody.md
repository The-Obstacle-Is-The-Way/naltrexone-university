# DEBT-505: Failures That Are Only Logged Alert Nobody

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — a test alert of each kind, raised on a deployment, reaches the owner, and a later window emails again; due 2026-10-15
**Priority:** P2
**Date:** 2026-10-06
**Resolved:** —
**Verification receipts:** —

---

## Summary

Several conditions a person must act on are only written to the server log. That log goes to stdout, which Vercel's Hobby plan keeps for about an hour, and nothing forwards it to Sentry. So in practice nobody sees them.

The sharpest case is renewal consent. If a renewal notice misses its legal deadline, the job raises what the code calls an "alert", but it is a log line. The same gap hides a blocked checkout whose sync failed and a sign-in limiter that has switched itself off.

## Evidence

- **Logs stay on the server.** `lib/logger.ts:58` builds pino with no transport, so it writes stdout only. Sentry receives thrown request errors through `onRequestError` (`instrumentation.ts:37`), not log lines. The project is on Vercel's Hobby plan with no log drains (the Drains API returned none on 2026-10-06), and Hobby keeps [runtime logs](https://vercel.com/docs/logs/runtime) for one hour.
- **Alerts that are only log lines:**
  - the renewal job's missed notice deadlines and missed anniversary reminders (`src/adapters/jobs/send-due-renewal-notices.ts`, `alertOnMissedNoticeDeadlines` and `alertOnMissedAnniversaryReminders`);
  - the dispatch use case's refusal and quarantine alerts (`src/application/use-cases/dispatch-renewal-notice-delivery.ts`, the `logger.error` calls in `refusalBeforeSend` and `persistOutcome`);
  - a checkout whose Stripe holds could not be recorded, BUG-321's failed sync (`src/application/use-cases/create-checkout-session.ts:210`);
  - the sign-in limiter's own failure, after which it lets requests through (`proxy.ts:278`, `console.error`; BUG-323).
- **Scale.** At filing (2026-10-06), application code had 57 `logger.error` and 6 `console.error` call sites. Most need no person; the ones above do.
- **Quota.** Sentry's Developer plan allows 5,000 errors a month, so forwarding every error line is not affordable, and BUG-318 showed that broad collection leaks credentials.

## Impact

The product is pre-revenue with no active users, so nothing has been missed yet. Once annual subscribers exist, a missed renewal-notice deadline is a compliance failure ([DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) F07) that nobody would learn of in time.

## Options

1. **Forward every error-level log line to Sentry.** Simple, but noisy, over quota, and it widens data collection, which BUG-318 narrowed.
2. **An explicit alert port with bounded delivery** (recommended).
   - The application layer declares the conditions a person must see.
   - An outer-layer adapter sends each as a Sentry event with fixed tags and no personal data, and an issue alert rule routes it to the owner.
   - An in-process cooldown, then one cooldown key per alert kind on the existing Postgres limiter, bounds the volume.
3. **Upgrade to Vercel Pro and drain logs to an alerting service.** It costs money, still needs alert rules, and is the owner's call.

## Resolution (decided)

Option 2.
- **The port.** Add an `OperationalAlerts` port in the application layer, with one `raise` method taking only a kind from a closed list and a count. Use cases and jobs call it where they now log an alert.

  *Corrected 2026-10-08: one `raise` method replaces one method per kind, and the non-identifying reference is dropped, so no caller-supplied value reaches Sentry.*
- **The adapter.** Implement it with `Sentry.captureMessage` in an outer-layer adapter, so no vendor import enters the application or domain layers.
- **The volume bound.** Two cooldowns per alert kind, each six hours.
  - An in-process cooldown is checked first and is always on.
  - Then one cooldown key on the existing Postgres limiter makes it at most one event per kind per fixed six-hour window across all instances.
  - If the limiter call fails, the event is still sent, tagged as sent without the shared cooldown, and the in-process cooldown bounds it to one per kind per server instance per six hours. Suppressing it instead would silence BUG-323's alert, since that alert reports this same database failing.
  - That fallback has no bound across instances: an outage under load can send one event per kind from each running instance. Sentry's spike protection is the backstop, and the flood response in [Logging](../dev/logging.md) applies.
- **Every episode notifies.** Sentry emails on a new issue, or one that escalates or regresses, but not on a later event in an issue still open. So each kind and fixed six-hour window, the window the shared cooldown counts in, opens its own issue. An error-level event opens as a High-priority issue, and the project's enabled workflow "Send a notification for high priority issues" emails on a new one in production (read from Sentry's API on 2026-10-08). No one has to resolve an earlier issue for the next alert to arrive.
- **A rule of their own.** That default workflow also emails ordinary errors, so narrowing or disabling it to cut error noise would silence these alerts without warning. So the alerts have a workflow of their own, "Operational alerts — email the owner (DEBT-505)", created through Sentry's API on 2026-10-08 and read back: production only; a new, regressed or reappearing issue; events tagged `alert.kind`; email to issue owners, falling back to active members, as the default workflow does; no throttling, since the cooldowns bound the volume.
- **Only our server can raise them.** Sentry's browser key is public by design, and anyone holding it can send an event with any tags ([Sentry's DSN guide](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)). So anyone could trigger, or flood, this workflow with fake alerts, and the default workflow is exposed the same way. So server events moved to a project of their own, as Sentry recommends, on 2026-10-08 with the owner's approval:
  - Sentry project `addiction-boards-server`, with the web project's privacy settings (server-side scrubbing, its default rules, IP scrubbing, the same sensitive fields), read back;
  - its default high-priority workflow, made production-only and throttled to 30 minutes like the web project's, and the alerts' workflow, both read back. The first copy, on the web project, was disabled minutes after creation and then deleted;
  - `SENTRY_DSN` for Production and Preview in Vercel holds that project's key, as a sensitive variable; the browser keeps `NEXT_PUBLIC_SENTRY_DSN`;
  - `instrumentation.ts` uses `SENTRY_DSN` only, never the browser's key.
  The server key is still not a secret in Sentry's sense, so it stays server-only and is rotated if it is ever exposed.
- **Keep the log line** beside each alert, for immediate diagnosis.
- **Renewal notices are detected from state.** The renewal job already computes missed deadlines from the database each run, so a deadline missed while logs were lost is still found on the next run.
- **Who uses it:**
  - DEBT-414 F07's renewal-notice alerts;
  - the dispatch refusal and quarantine alerts;
  - BUG-321's failed sync;
  - BUG-323's limiter failure;
  - [DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 3's Clerk cap trips.

- **Implemented 2026-10-08.**
  - The port is `OperationalAlerts`, with a closed list of kinds and only a count, so no free text can reach Sentry. One `raise` method covers every kind: the closed list keeps the fields fixed, and a new kind needs no new method.
  - `CooldownOperationalAlerts` applies both cooldowns; `sendOperationalAlertEvent` is the only code that sends an alert to Sentry. The container keeps one in-process cooldown per server process.
  - **Fixed fields only.** Sentry fills an event from the scope it is raised in, so an alert raised inside a request would also carry that request, its user and its breadcrumbs, including outgoing Stripe and Clerk URLs. `scrubEvent` keeps an alert event to its own fields, tags, context and fingerprint, and drops the scope's attachments. The server also leaves out Sentry's `ProcessSession` integration: once Sentry has a release, as on CI and Vercel, it sends a release-health session that copies the scope's user, in an envelope `beforeSend` never sees.

  *Corrected 2026-10-08: the real-SDK tests ran without a release locally, so they missed that session envelope; CI, which has a release, caught it (#1428 review). The tests now set a release.*
  - **Loss detected where the SDK can see it.** Sentry's capture never throws, so the boundary rejects when no client is enabled or the flush does not finish, and the adapter logs `operational_alert_send_failed`. An event Sentry itself refuses, for quota, rate limit or another non-2xx answer, is not detected: the SDK's transport drops it and resolves. The plan's 5,000 errors a month are shared by both projects, so a flood through the browser's public key that uses up the month would silence the alerts too ([flood runbook](../dev/logging.md#sentry-flood-or-quota-exhaustion)).
  - **Bounded.** The shared cooldown counts as unavailable after one second. The flush waits up to two seconds for processing and then up to two for the transport. So a caller answering a user waits at most five seconds: one for the shared cooldown and up to four for the flush, and only for an alert the in-process cooldown lets through. A healthy send takes well under a second.
  - **Environment.** Sentry's environment is Vercel's name for the deployment, or `local` off Vercel. It used to fall back to the build mode, so a local `next start` labelled its events production and would have paged the owner.
  - Callers: the renewal job's two deadline checks, dispatch's cutoff refusal and outcome-unknown quarantine, the refused checkout's failed sync, and the proxy's limiter failure, which raises after the response through `waitUntil`.
  - Tests: the cooldowns on fakes and on real Postgres (eight concurrent instances send one event, and a restart keeps the window); the sent event through the real Sentry SDK, raised inside a scope holding a request, a user, extra data and breadcrumbs, of which none leaves; both lost-send cases; one in-process cooldown across the containers of a process; and each caller, each shown to fail with its alert removed.
  - The runbook is [Operational alerts](../dev/logging.md#operational-alerts).

*Corrected 2026-10-08: grouping every alert of a kind into one issue would have emailed only the first; each kind and cooldown window now opens its own issue.*

## Verification

- [ ] Red first: each listed condition calls the port; the adapter sends fixed tags only; the shared cooldown holds under concurrent calls and survives a restart; when the limiter errors, the event is still sent, tagged, at most once per kind per instance.
- [ ] Engineering: on a deployment, one test event per alert kind, raised from its real call site (the proxy for BUG-323's kind), reaches the Sentry issue alert routed to the owner, recorded with counts only.
- [ ] Engineering: a second alert of one kind, in a later window while the first issue is still open, opens a new issue and emails again.
- [x] Engineering: the alerts' workflow lives on the server project, whose key no browser receives, and is read back from Sentry's API as enabled (2026-10-08).
- [x] Engineering: after the first deployment with the new `SENTRY_DSN`, a server span arrives in the server project and none in the web project. Promotion #1424 deployed at 06:03Z on 2026-10-08. By 07:43Z the server project held spans from production and Preview, and the web project held no event or span from any environment (Sentry API counts only).
- [ ] Engineering: a test alert from a deployment reaches the owner through it.
- [ ] The alerts listed above no longer exist as log lines alone.

## Related

- [DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) F07, which cannot be verified until this ships.
- [DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 3, a consumer of this path.
- [BUG-321](../bugs/bug-321-already-subscribed-answer-discarded.md) and [BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md), whose failures this makes visible.
