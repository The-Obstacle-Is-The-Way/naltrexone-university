# BUG-318: Sentry Receives Credentials on Every Server Error Event

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the fix is in production (promotion #1374, 2026-10-05); the record closes once the owner's checks below are done ([Fix](#fix))
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

*Historical, until promotion #1374 on 2026-10-05. Production now runs `@sentry/nextjs` 11.0.0 with explicit restrictive settings (Fix, below).*

Production ran `@sentry/nextjs` 10.75.1 with `Sentry.init({ dsn, tracesSampleRate, environment })` (`instrumentation.ts`). With that configuration, every server error event Sentry captured carried the request's credentials. That includes our `onRequestError` (`Sentry.captureRequestError`) and any `captureException` during a request. It carries:
- every cookie, among them Clerk's session (`__session`), refresh (`__refresh`) and handshake (`__clerk_handshake`) tokens;
- every header except the IP ones, unscrubbed, among them the cron route's `authorization: Bearer <CRON_SECRET>` and the Stripe and Svix webhook signatures;
- the request path with its query string, including Clerk's `__clerk_handshake` token;
- the client IP;
- the incoming request body, up to Sentry's "medium" size (about 10 KB): webhook payloads, server-action input.

The production, Preview and development environments all set a Sentry DSN.

## Evidence

- **Measured, 2026-10-05.** Sentry 10.75.1 was installed in an isolated folder with install scripts disabled. It was given `main`'s exact `Sentry.init` options and a transport that only records envelopes. It then received one `captureRequestError` carrying a cookie header, `authorization`, both webhook signatures, `x-forwarded-for`, `x-prerender-revalidate` and a handshake query parameter. Every one of the nine values, each generated at random for the run, appeared in the envelope it would have sent.
- **In Sentry's 10.75.1 source** (`@sentry/core`):
  - **Cookies and headers are attached unfiltered.** With `sendDefaultPii` unset, `defaultPiiToCollectionOptions` resolves cookies to `{ deny: [...] }`, not `false`. `requestdata.js` therefore sets `include.cookies` true, and `extractNormalizedRequestData` copies every parsed cookie, and every header but the IP headers, onto the event. Deny lists are applied only on the span-attribute path (`utils/request.js`), never on events.
  - **Bodies are captured regardless of settings.** `integrations/http/server-subscription.js` captures incoming request bodies at `maxRequestBodySize = "medium"`, and `requestdata.js` always attaches them (`data: true`).
  - Sentry's migration guide tabulates the v10 default as "cookies: not collected" and "httpBodies: not collected (size only)". The 10.75.1 event path does neither.
- **What Sentry stored is unknown from here.** It depends on which server errors occurred, and on the Sentry project's server-side scrubbing settings ("Data Scrubber", "Use Default Scrubbers", "Scrub IP Addresses"). Only the owner can see those.

## Impact

Credentials sit in a third-party service whose staff and integrations can read them. They also remain in event retention after the session ends.

| What | Risk |
| --- | --- |
| `CRON_SECRET` | Lets anyone call the cron routes until it is rotated. |
| Clerk `__refresh` | Can mint new session tokens until the session ends or is revoked. |
| Clerk `__session` | Lives about a minute. |
| Webhook signatures | Each is a per-request HMAC, valid only for its own payload within the provider's tolerance window. None reveals a signing secret. |

Learner and payer data in request bodies, such as emails in Clerk and Stripe webhook payloads, exceeds what the privacy policy lists for Sentry.

## Fix

DEBT-499's upgrade fixes this. It moves to `@sentry/nextjs` 11 and gives every runtime an explicit restrictive `dataCollection`:
- no cookies, user info, bodies, database query data or queue arguments;
- deny lists that cover the credential headers and parameters above.

It adds `beforeSend` and `beforeBreadcrumb` scrubbers, which redact credential query parameters in the URLs that Sentry's filters do not reach. `lib/sentry-data-collection-sdk.test.ts` replays the scenario above through the real Sentry 11 SDK and `captureRequestError`, and none of the nine values is sent. With Sentry 11's defaults instead of our settings, eight of them are sent, and body capture is on. So merging Dependabot's #1369 as-is would have kept most of this exposure.

## Owner checks (owner-only: Sentry and secret access)

1. In Sentry, check the project's Security & Privacy settings (Data Scrubber, default scrubbers, IP scrubbing).
2. Search stored error events for `request.cookies`, `request.headers.cookie`, `request.headers.authorization` and `request.data`. Delete any that hold values.
3. Rotate `CRON_SECRET` (Production and Preview) if any cron-route error event exists. Rotate it anyway if the search cannot rule that out.
4. If stored events hold `__refresh` values, revoke those users' Clerk sessions.
5. No webhook signing secret needs rotating: a signature does not reveal its secret.

## Verification

- [x] Production runs the fix, and the real-SDK test passes in the gate on that commit: #1373 merged `86c62eb9` after exact-head approval 5417478378 on `6102844d` (gate passed on that head), released through promotion #1374 (`2998928c`): main CI 37342621484 `test` passed 16:54:12Z, production assigned 16:54:15.082Z, trees `6496d9fe`, healthy production.
- [ ] A server error event after the release, viewed in Sentry, shows no cookies, credential headers, body or IP.
- [ ] The owner's checks above are done and recorded here.

## Related

- [DEBT-499](../debt/debt-499-sentry-major-widens-data-collection.md): the upgrade and the settings that fix this.
- [BUG-307](../_archive/bugs/bug-307-public-playwright-artifacts-expose-test-session-credentials.md): Clerk tokens in public CI artifacts, the same credential class.
- `app/(marketing)/privacy/privacy-content.ts`: the privacy policy's Sentry row.
