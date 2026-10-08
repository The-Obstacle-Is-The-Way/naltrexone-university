# BUG-331: Server Breadcrumbs and Request Spans Carry Credentials the Scrubbers Miss

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — a production server error shows no breadcrumbs, and a sampled request span shows its credential parameters filtered; due 2026-10-22
**Priority:** P2
**Date:** 2026-10-08
**Resolved:** —
**Verification receipts:** —

---

## Summary

[BUG-318](../_archive/bugs/bug-318-sentry-sends-credentials-on-server-error-events.md) narrowed what Sentry receives, and its scrubbers clean the URLs an event carries. For breadcrumbs, `scrubBreadcrumb` redacts the credential parameters on its own list only in `data.url`, `data.from` and `data.to`. Other breadcrumb fields and content, and parameters not on the list, go through. A breadcrumb is a step the server took before the error: an outgoing request, or a console line.

So a server error event can carry, in clear:
- a Clerk handshake nonce, from Clerk's own exchange request;
- whatever a console line logged;
- Stripe and Clerk IDs from outgoing URLs, which the privacy policy allows, but which may belong to another visitor (see Evidence).

Request spans are worse: Next.js's own request span keeps the raw request URL, so any credential in a page's query reaches Sentry in clear. Production's sampled spans held none in the last 14 days (see Evidence).

This affects every server error event today. Operational alerts ([DEBT-505](../debt/debt-505-logged-only-failures-alert-nobody.md)) are not affected: `scrubEvent` keeps an alert event to fixed fields, breadcrumbs dropped.

## Evidence

- **Reproduced through the real SDK** (`@sentry/nextjs` 11.0.0, with `SENTRY_DATA_COLLECTION`, `scrubEvent` and `scrubBreadcrumb`, 2026-10-08). Inside an HTTP request, the server fetched `/v1/clients/handshake_payload?nonce=…` and `/v1/subscriptions?customer=cus_…`, logged a user ID with `console.error`, and captured an ordinary error. The event carried three breadcrumbs, and with them the nonce, the customer ID and the logged ID.
- **Why the scrubbers miss it.** On the server, the SDK already strips the query from a breadcrumb's `url` and passes its `url.query` through Sentry's own query filter. The nonce got through because `nonce` is in neither credential list, ours (`redactCredentialParams`) or the one Sentry's filter gets. A console line's content and the IDs in a URL's path are not credentials to either filter.
- **The nonce.** The proxy runs Clerk's middleware on handshake requests, and Clerk exchanges the nonce for the session cookies by calling its Backend API (`@clerk/backend`, `getCookiesFromHandshake`). Using a leaked nonce also needs our Clerk secret key, but the repository treats it as a credential.
- **Possibly other visitors' data.** If `Sentry.init` runs inside the first request, that request's breadcrumbs land on the default isolation scope, which every later request copies. A simulation showed visitor A's IDs on visitor B's alert. This is not yet proven on Vercel.
- **With server breadcrumbs off** (`maxBreadcrumbs: 0`), the same reproduction sent no breadcrumbs, and none of the three values.
- **Request spans.** At the server's 5% trace sample, Sentry 11 streams spans (envelope items of type `span`). Measured through the real SDK (2026-10-08):
  - `@sentry/nextjs` turns off Sentry's own incoming-request span (`httpIntegration({ disableIncomingRequestSpans: true })`). Each request's server span is Next.js's `BaseServer.handleRequest`, which sets `http.target` to the raw request URL (`next/dist/server/base-server.js:503`). Sentry's query filter does not reach `http.target`, so `__clerk_handshake`, `nonce` and `code` reached Sentry in clear.
  - On an outgoing call's span, Sentry's filter cleaned `url.full` and `url.query`, but kept `nonce` and `code`, which its list lacks.
  - `beforeSend` does not run on spans, and neither does `beforeSendTransaction`: Sentry 11 ignores it unless `traceLifecycle` is `'static'`. `beforeSendSpan` runs on each streamed span; it can rewrite a span but not drop it.
  - Spans also carry the user agent and, on an outgoing Stripe or Clerk call, the ID in its path. The privacy policy covers both: its Sentry row (`app/(marketing)/privacy/privacy-content.ts:66`) lists browser and device information and says submitted data can incidentally contain identifiers. So they stay.
- **In production** (Sentry query of the last 14 days, counts and parameter names only, 2026-10-08): 180 sampled spans had a query in `http.target`. None held a Clerk parameter, a nonce or `session_id`. The names seen were ordinary ones, such as `customer`, `redirect_url` and `limit`. The count covers every environment, Preview included. Why no handshake parameter appeared is not established, so the gap is fixed rather than relied on.

## Impact

- **Data minimisation.** A credential in a request's query, and whatever a server console line logged, can reach Sentry, beyond what BUG-318 decided it should receive. Sentry is a processor named in the privacy policy, and no one outside our Sentry project sees them. None was found in production's sampled spans, so the priority stays P2. BUG-318, which sent credentials on every server error, was P1.
- **No user-visible effect.** Nothing breaks, so nothing would surface this.

## Options

1. **Scrub more.** Add `nonce` to both credential lists and `code` to Sentry's, and have `scrubBreadcrumb` clean every string field. This still lets console content through, cannot reach `http.target`, and each new SDK field is another gap.
2. **No server-side breadcrumbs** (recommended for the server). Set `maxBreadcrumbs: 0` in `instrumentation.ts`. Server errors are diagnosed from their stack traces and our own logs, and breadcrumbs add IDs, not explanations. This also removes the cross-request copy, since nothing is recorded to copy.
3. **Allowlist breadcrumb categories.** Keep some, such as navigation. Server breadcrumbs have none we need.

## Resolution

**Decided:** option 2 for the server, plus our own redaction on every span. Test-first, through the real SDK:
- **One set of server settings.** `SENTRY_SERVER_SETTINGS` holds every server option except the key and environment. `instrumentation.ts` and the real-SDK tests both initialise Sentry with it, so a test cannot pass on settings production does not use.
- **No server breadcrumbs.** `maxBreadcrumbs: 0` stops the SDK recording them. The server's `beforeSend` (`scrubServerEvent`) also drops any an event carries, because a scope's own `addBreadcrumb` ignores that limit.
- **Every span redacted.** `beforeSendSpan` (`scrubSpan`) runs `redactCredentialParams` over a span's name and every string attribute, `http.target` among them.
- **`nonce`** joins the credential parameters `redactCredentialParams` matches.
- **Every breadcrumb field in the browser.** `scrubBreadcrumb` redacts every string in a breadcrumb's data rather than three named fields. The browser SDK writes only `url`, `from` and `to` today, but an SDK can add a field: the server SDK already writes `url.query`.

Sentry's own query filter keeps its list. Our hooks run last on every event, span and breadcrumb, so a second copy of the list there would add nothing a test could see.

Tests:
- a server error raised after an outgoing call and recorded steps, one of them added to a scope directly, carries no breadcrumbs;
- Next.js's request span and an outgoing call's span, opened through Next's own tracer, carry no `__clerk_handshake`, `nonce` or `code`;
- `scrubServerEvent`, `scrubSpan` and `scrubBreadcrumb` unit cases, including a `url.query` field and an array attribute.

**Implemented 2026-10-08,** as decided, in `lib/sentry-data-collection.ts` and `instrumentation.ts`. DEBT-505's real-SDK alert test also runs on `SENTRY_SERVER_SETTINGS` now. Each change was checked against a mutant:
- without `maxBreadcrumbs: 0`, only the settings test fails, since `scrubServerEvent` still drops the breadcrumbs;
- without the breadcrumb drop, the breadcrumb tests fail;
- without `beforeSendSpan`, the span test and the settings tests fail;
- without array handling, its unit case fails; without `nonce`, its unit and SDK cases fail.

An independent adversarial review found the span gap that `scrubSpan` closes. Of its other findings, the scope path, the alert test's settings, the untyped settings object and this record's inaccuracies are fixed. The BUG-318 case it called vacuous on the server stays: the server still must not send that token, which is what the case states.

## Verification

- [x] The real-SDK tests above fail before the fix and pass after it (2026-10-08; see Implemented).
- [ ] A production server error, raised on a deployment, shows no breadcrumbs in Sentry.
- [ ] A sampled production request span with a query shows its credential parameters as `[Filtered]`.

## Related

- [BUG-318](../_archive/bugs/bug-318-sentry-sends-credentials-on-server-error-events.md): the scrubbers this extends.
- [DEBT-505](../debt/debt-505-logged-only-failures-alert-nobody.md): whose review found this, and whose alert events carry fixed fields only.
