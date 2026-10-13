# ADR-026: Error Monitoring with Sentry

**Status:** Accepted
**Date:** 2026-10-12, recording decisions of 2026-10-05 to 2026-10-08
**Decision Makers:** The owner, who approved the BUG-318 fix on 2026-10-05 and the split into two Sentry projects on 2026-10-08. ADR-023 moved decisions out of records and agent instructions, so they are recorded here.
**Depends On:** ADR-008 (Logging and Observability)

---

## Context

- **Errors must reach the owner.** The owner is the only person running the product. A failure that is only logged reaches nobody: DEBT-505 found deadline and billing failures that wrote a log line and alerted no one.
- **A browser's key is public.** The browser needs its Sentry project's client key (DSN), so anyone can read it and post events to that project, as Sentry intends.
- **The SDK's defaults sent credentials.** On 2026-10-05, a recording transport showed that `@sentry/nextjs` 10.75.1, as configured then, sent Clerk's session, refresh and handshake tokens, the cron bearer token, Stripe and Svix signatures and the visitor's IP on every server error event (BUG-318). Version 11 replaced `sendDefaultPii` with `dataCollection`, whose unset default collects more again. CI stayed green in both cases, because nothing tested what the SDK sends.
- **One error budget.** The plan is Sentry's Developer plan: 5,000 errors a month, shared by every project, with no per-key rate limit.

## Decision

1. **Sentry is the error and alert channel, for the browser and the server.**
   - Its environment is Vercel's name for the deployment, or `local` off Vercel (`sentryEnvironmentFor`). A build mode never stands in for it, since `next start` is a production build.
   - Without a key, a runtime sends nothing.
2. **Two projects, one per trust level (2026-10-08).**
   - The browser project, `addiction-boards-web`, uses the public `NEXT_PUBLIC_SENTRY_DSN`.
   - The server project, `addiction-boards-server`, uses `SENTRY_DSN`, stored as a sensitive Vercel variable and never sent to a browser (`instrumentation.ts`).
   - The operational-alert workflow watches only the server project, so a forged browser event cannot raise an operational alert.
3. **Every runtime states what it collects (2026-10-05).**
   - `SENTRY_DATA_COLLECTION` in `lib/sentry-data-collection.ts` turns off user info, cookies, bodies, database query data, queues, GraphQL and GenAI payloads. It applies a deny list to request and response headers and URL query parameters, covering forwarding and IP headers and the credential carriers Sentry's own list misses.
   - The type `EVERY_CATEGORY_IS_SET` fails compilation when Sentry adds a category this setting leaves unset. Only the two stack-frame settings keep Sentry's defaults.
   - Scrubbers redact credential query parameters in event and breadcrumb URLs. The server also keeps no breadcrumbs, scrubs spans, propagates no trace headers to Stripe, Clerk or any other service, and drops the `ProcessSession` integration (BUG-331, DEBT-505).
   - Sampling: server traces at 5%; browser traces and session replays off.
4. **Privacy is proven through the real SDK.**
   - Tests run the installed SDK against a recording transport and assert what leaves the process (`lib/sentry-data-collection-sdk.test.ts`, `lib/sentry-breadcrumbs-sdk.test.ts`). The shape of the settings object is not evidence.
   - A Sentry major upgrade starts with the migration guide's data-collection section, and lands only with these tests passing on the new version.
5. **Operational alerts are tagged events (DEBT-505).**
   - A failure the owner must act on is sent to the server project as an event tagged `alert.kind`. It carries no request, user, breadcrumb, ID or address.
   - A server-project workflow emails the owner on a new, regressed or reappearing alert.
   - A drill alert goes through the same path once per 30-day cycle, to prove the path works.
   - [Observability](../architecture/observability.md#operational-alerts) lists the alert kinds and what to do for each.

## Consequences

### Positive

1. A failure that needs the owner reaches the owner, instead of a log line.
2. The public browser key cannot forge server events or operational alerts.
3. An SDK upgrade cannot quietly widen what leaves the process: a new category fails compilation, and a wider default fails the real-SDK tests.

### Negative

1. Both projects draw on one monthly error budget, so a browser flood that exhausts it also silences the operational alerts until the month resets.
2. Fewer breadcrumbs and no request bodies leave less context for debugging a server error.
3. Sentry's alert workflows are a beta API, configured in Sentry rather than in this repository.

### Mitigations

- Spike protection is on (BUG-325), and [the flood runbook](../architecture/observability.md#sentry-flood-or-quota-exhaustion) rotates a flooded project's key and treats an exhausted budget as an alerting outage.
- The monthly drill and its watcher detect a broken alert path within one cycle.
- Server logs keep the request-scoped detail that Sentry no longer receives.

## Alternatives Rejected

- **One project for the browser and the server.** Anyone holding the public browser key could post events into the project that raises operational alerts (2026-10-08).
- **The SDK's default data collection.** It sent credentials and the visitor's IP, and Sentry's defaults change between majors (BUG-318, 2026-10-05).
- **Logs as the only signal.** A failure that is only logged reaches nobody (DEBT-505).
- **Testing the settings object.** CI stayed green while the SDK sent credentials, so only the SDK's output counts as evidence.

## Compliance

- `lib/sentry-data-collection-sdk.test.ts` and `lib/sentry-breadcrumbs-sdk.test.ts` run the installed SDK against a recording transport, and fail if a credential, IP or breadcrumb leaves the process.
- `EVERY_CATEGORY_IS_SET` fails compilation when Sentry adds a data-collection category this setting leaves unset.
- The monthly drill alert, and the watcher that expects it, show the alert path still reaches the owner.

## References

- [Observability](../architecture/observability.md): logging, the alert kinds and the runbooks
- `lib/sentry-data-collection.ts`, `instrumentation.ts`, `sentry.client.config.ts`
- [Privacy policy](../policies/legal/privacy-policy.md), whose Sentry row these settings stay within
