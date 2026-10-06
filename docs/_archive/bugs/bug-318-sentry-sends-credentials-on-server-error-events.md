# BUG-318: Sentry Receives Credentials on Every Server Error Event

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-05: the fix is in production and the owner's checks are done ([Owner checks](#owner-checks-owner-only-sentry-and-secret-access))
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** 2026-10-05
**Verification receipts:** #1373 merged `86c62eb9` after exact-head approval 5417478378 on `6102844d` (local full gate passed on that head); promotion #1374 merged `2998928c`: main CI 37342621484 `test` passed 16:54:12Z, production assigned 16:54:15.082Z, trees `6496d9fe`, healthy production. Owner checks done 2026-10-05: settings read, the 1,005 retained events audited, sensitive fields added, and both affected issues deleted (confirmed 404).

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

### Results, 2026-10-05

The owner had the Sentry CLI logged in to the project (`novamindnyc` / `addiction-boards-web`, with event, project and org scopes) and asked for these checks to be run with it. Reads printed names, counts, and whether each value was filtered, never a value.
1. **Settings.** Data Scrubber on, default scrubbers on, IP scrubbing on, no additional sensitive fields.
2. **Stored events.** Sentry holds 1,005 of the project's 3,649 events, from 2026-09-06 to 2026-10-05.
   - The 3,575 browser CSP reports carry no credential parameter.
   - Across all retained events: no `authorization` header, no request body, no user IP, no `__refresh` cookie, and no Clerk handshake or development-browser token in any URL or header.
   - Two production error issues held values unfiltered:
     - ADDICTION-BOARDS-WEB-2A: 2 events, 2 and 4 October, with a `__session_<suffix>` cookie;
     - ADDICTION-BOARDS-WEB-T: 5 retained events, with Clerk's encrypted `x-clerk-request-data` and a token-free `x-clerk-clerk-url`.
   - Clerk session tokens expire about a minute after issue, so the stored ones cannot be replayed.
   - The owner deleted both issues in the Sentry UI, and the API then returned 404 for each. The CLI token lacks `event:admin`, so its own deletion attempt returned 403. The issues' non-sensitive facts (error, route, release, frames) were kept first, for the two application errors they record.
3. **`CRON_SECRET` needs no rotation.** No retained event carries it, and retention begins after its last rotation, per the owner's 2026-09-19 decision.
4. **No Clerk session needs revoking.** The stored session tokens were expired, and no refresh token was stored.
5. **Defense in depth, owner-approved.** The project's additional sensitive fields are now `__session`, `__refresh`, `__clerk`, `x-clerk-request-data` and `x-clerk-clerk-url`, confirmed by read-back. Sentry scrubs these server-side even if a future SDK change sent them.
6. **After the release**, none of the 940 spans received from 16:55Z on carries a cookie, `authorization`, body or Clerk request-data attribute.

## Verification

**External correction, 2026-10-06.** The current `lib/sentry-data-collection-sdk.test.ts` covers ten values, including a breadcrumb's development-browser JWT. Replaying that case offline emitted eight with v11 defaults and zero with the shipped settings. The error still reached the recording transport and body capture was disabled. The earlier nine-value v10 probe and deleted-event inventory are historical operator receipts, not reconstructed here. Span inspection alone does not establish every error-event field; the real-SDK error test supplies that separate evidence.

- [x] Production runs the fix, and the real-SDK test passes in the gate on that commit: #1373 merged `86c62eb9` after exact-head approval 5417478378 on `6102844d` (gate passed on that head), released through promotion #1374 (`2998928c`): main CI 37342621484 `test` passed 16:54:12Z, production assigned 16:54:15.082Z, trees `6496d9fe`, healthy production.
- [x] What reaches Sentry after the release carries no cookie, credential header, body or IP. This was proven through the real SDK in the gate on the released head, and from Sentry's side by the span audit in Results (6), since no server error event has occurred since.
- [x] The owner's checks above are done and recorded here (Results).

## Related

- [DEBT-499](../debt/debt-499-sentry-major-widens-data-collection.md): the upgrade and the settings that fix this.
- [BUG-307](./bug-307-public-playwright-artifacts-expose-test-session-credentials.md): Clerk tokens in public CI artifacts, the same credential class.
- `app/(marketing)/privacy/privacy-content.ts`: the privacy policy's Sentry row.
