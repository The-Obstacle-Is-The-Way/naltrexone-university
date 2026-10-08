# DEBT-505: Failures That Are Only Logged Alert Nobody

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the four logged-only conditions now alert; DEBT-503 item 3 adds its own kind later; delivery is checked on a deployment after release
**Priority:** P2
**Date:** 2026-10-06
**Resolved:** —
**Verification receipts:** —

---

## Summary

Several conditions a person must act on are only written to the server log. That log goes to stdout, which Vercel's Hobby plan keeps for about an hour, and nothing forwards it to Sentry. So in practice nobody sees them.

The sharpest case is renewal consent. If a renewal notice misses its legal deadline, the job raises what the code calls an "alert", but it is a log line. The same gap hides a blocked checkout whose sync failed and a sign-in limiter that has switched itself off.

## Evidence

- **Logs stay on the server.** `lib/logger.ts:58` builds pino with no transport, so it writes stdout only. Sentry receives thrown request errors through `onRequestError` (`instrumentation.ts:34`), not log lines. The project is on Vercel's Hobby plan with no log drains (the Drains API returned none on 2026-10-06), and Hobby keeps [runtime logs](https://vercel.com/docs/logs/runtime) for one hour.
- **Alerts that are only log lines:**
  - the renewal job's missed notice deadlines and missed anniversary reminders (`src/adapters/jobs/send-due-renewal-notices.ts`, `alertOnMissedNoticeDeadlines` and `alertOnMissedAnniversaryReminders`);
  - the dispatch use case's refusal and quarantine alerts (`src/application/use-cases/dispatch-renewal-notice-delivery.ts`, the two `logger.error` calls under "Alerting failure must not undo…");
  - a checkout whose Stripe holds could not be recorded, BUG-321's failed sync (`src/application/use-cases/create-checkout-session.ts:208`);
  - the sign-in limiter's own failure, after which it lets requests through (`proxy.ts:270`, `console.error`; BUG-323).
- **Scale.** Application code has 57 `logger.error` and 6 `console.error` call sites. Most need no person; the ones above do.
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
- **The port.** Add an `OperationalAlerts` port in the application layer, with one method per alert kind, taking only fixed fields: the kind, a count and a non-identifying reference. Use cases and jobs call it where they now log an alert.
- **The adapter.** Implement it with `Sentry.captureMessage` in an outer-layer adapter, so no vendor import enters the application or domain layers.
- **The volume bound.** Two cooldowns per alert kind, each six hours.
  - An in-process cooldown is checked first and is always on.
  - Then one cooldown key on the existing Postgres limiter makes it at most one event per kind per fixed six-hour window across all instances.
  - If the limiter call fails, the event is still sent, tagged as sent without the shared cooldown, and the in-process cooldown bounds it to one per kind per server instance per six hours. Suppressing it instead would silence BUG-323's alert, since that alert reports this same database failing.
  - That fallback has no bound across instances: an outage under load can send one event per kind from each running instance. Sentry's spike protection is the backstop, and the flood response in [Logging](../dev/logging.md) applies.
- **Every episode notifies.** Sentry emails on a new issue, or one that escalates or regresses, but not on a later event in an issue still open. So each kind and fixed six-hour window, the window the shared cooldown counts in, opens its own issue. An error-level event opens as a High-priority issue, and the project's enabled workflow "Send a notification for high priority issues" emails on a new one in production (read from Sentry's API on 2026-10-08). No one has to resolve an earlier issue for the next alert to arrive.
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
  - `CooldownOperationalAlerts` applies both cooldowns; `sendOperationalAlertEvent` is the one file that calls Sentry. The container keeps one in-process cooldown per server process.
  - **Fixed fields only.** Sentry fills an event from the scope it is raised in, so an alert raised inside a request would also carry that request, its user and its breadcrumbs, including outgoing Stripe and Clerk URLs. `scrubEvent` keeps an alert event to its own fields, tags, context and fingerprint, and drops the scope's attachments.
  - **No silent loss.** Sentry's capture never throws, so the boundary rejects when no client is enabled or the flush is not confirmed, and the adapter logs `operational_alert_send_failed`.
  - **Bounded.** The shared cooldown counts as unavailable after one second. The flush waits up to two seconds for processing and then up to two for the transport. So a caller answering a user waits about three seconds in practice and five at most, and only for an alert the in-process cooldown lets through.
  - **Environment.** Sentry's environment is Vercel's name for the deployment, or `local` off Vercel. It used to fall back to the build mode, so a local `next start` labelled its events production and would have paged the owner.
  - Callers: the renewal job's two deadline checks, dispatch's cutoff refusal and outcome-unknown quarantine, the refused checkout's failed sync, and the proxy's limiter failure, which raises after the response through `waitUntil`.
  - Tests: the cooldowns on fakes and on real Postgres (eight concurrent instances send one event, and a restart keeps the window); the sent event through the real Sentry SDK, raised inside a scope holding a request, a user, extra data and breadcrumbs, of which none leaves; both lost-send cases; the container's shared cooldown on Postgres; and each caller, each shown to fail with its alert removed.
  - The runbook is [Operational alerts](../dev/logging.md#operational-alerts).

*Corrected 2026-10-08: grouping every alert of a kind into one issue would have emailed only the first; each kind and cooldown window now opens its own issue.*

## Verification

- [ ] Red first: each listed condition calls the port; the adapter sends fixed tags only; the shared cooldown holds under concurrent calls and survives a restart; when the limiter errors, the event is still sent, tagged, at most once per kind per instance.
- [ ] Engineering: on a deployment, one test event per alert kind, raised from its real call site (the proxy for BUG-323's kind), reaches the Sentry issue alert routed to the owner, recorded with counts only.
- [ ] Engineering: a second alert of one kind, in a later window while the first issue is still open, opens a new issue and emails again; and the workflow that emails on new High-priority production issues is read back from Sentry's API as enabled.
- [ ] The alerts listed above no longer exist as log lines alone.

## Related

- [DEBT-414](./debt-414-public-legal-pages-privacy-terms.md) F07, which cannot be verified until this ships.
- [DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 3, a consumer of this path.
- [BUG-321](../bugs/bug-321-already-subscribed-answer-discarded.md) and [BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md), whose failures this makes visible.
