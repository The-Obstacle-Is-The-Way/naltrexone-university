# DEBT-503: Clerk's Shared Backend API Allowance Is a Single Point of Failure

**Status:** Open — build item 3 (count a cookie nonce); the owner's usage-row read, lapsed 11-08, due 2026-11-22; items 2 and 4 wait for triggers
**Priority:** P3
**Date:** 2026-10-05

---

## Summary

Clerk limits each production instance's Backend API calls, documented as 1,000 per 10 seconds. Until item 1, every signed-in request spent one, so a spent allowance failed every signed-in page, and BUG-323 showed outsiders can spend it. Our code now spends it only to provision a new user's row, to refresh the email billing sends to Stripe, and to check a stale email owner under BUG-284's rules. Clerk's middleware still spends it to refresh an expired session token and to resolve a handshake nonce. BUG-323's request limits bound that: once the site-wide cap fills, returning visitors whose token has expired wait a minute.

**Done and released** (built test-first; the build history is in git at 34d9aea0):

- **Item 1.** Session identity comes from `auth()`, with our row and the deletion tombstone read together, and no Backend API call for an existing row (`src/adapters/gateways/clerk-auth-gateway.ts:50-66`); promotion #1427. A source guard keeps `currentUser` out (`tests/clerk-backend-api-boundary.test.ts`). **Accepted residual:** between Clerk's deletion and its `user.deleted` webhook, a still-valid session token (about 60 seconds) is served its own row, and a billing refresh gets Clerk's 404 and is refused (`clerk-auth-gateway.ts:125-136`). It is bounded and changes no ownership.
- **Item 3.** Alert kinds `clerk_site_limit_reached`, `clerk_backend_calls_refused`, `clerk_signing_keys_unavailable` and `clerk_session_tokens_rejected`, through DEBT-505's path (`lib/clerk-call-failures.ts`; runbook in `docs/architecture/observability.md`). A test event reached the owner on 2026-11-03. A failed refresh logs Clerk's error `code`, added after BUG-374's check saw one server refresh fail on 2026-11-03 with no reason; the `clerk_backend_calls_refused` runbook row reads it (`observability.md:292`). A lone failure, below the alert threshold, needs no check of its own.
- **Item 4, steps 1 to 4.** The daily roll-up into `clerk_backend_call_usage` (`src/adapters/jobs/clerk-backend-call-usage.ts`); refreshes of sessions Clerk signed counted in signed-in buckets of 200 a minute (`CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT`); `clerk_signed_in_limit_reached`; and Clerk refreshing only what the limiter counted (BUG-375). Production checks passed on 2026-11-02 and 2026-11-04, and the malformed-cookie firewall rule came out on 2026-11-02.
- **Item 5.** `clerkMiddleware` gets `jwtKey` from `CLERK_JWT_KEY` (`lib/clerk-jwt-key.ts`), checked on every deploy (`scripts/deploy/check-clerk-jwt-key.ts`), and set in Vercel Production since 2026-10-11. The signed-in production browsing of 2026-11-04 ran with it.

## Items

### 2. Let only forged requests fill the site-wide cap (P3, waits for its trigger)

- **Evidence.** BUG-323's site-wide cap counts every request that would make Clerk call its Backend API, real or forged, so an attacker who fills it also delays real returning visitors. It counts 1,000 requests a minute against Clerk's 1,000 calls per 10 seconds, and up to 2,000 pass across a fixed-window boundary, so a minute's average proves no burst headroom.
- **Options.**
  1. Count only failed lookups, read from Clerk's answer after the middleware runs.
  2. Accept a handshake value only from a browser our middleware just redirected to Clerk.
  3. Clerk validates the value before spending the allowance. Reported to Clerk on 2026-10-05; no reply as of 2026-11-11 (BUG-323's close). BUG-369's two `Authorization` header shapes, a genuine expired session token beside a refresh cookie and an `ak_`, `mt_` or `oat_` value, go to Clerk in a follow-up to that report, which the owner sends.
- **Decided.** Revisit after Clerk replies, starting from option 1 in two levels. A site-wide ceiling counts every lookup before the call and is never refunded, so it still bounds what Clerk's allowance can spend. Below it, a lower refusal threshold counts lookups before the call and refunds each one that Clerk's answer shows succeeded. Refunding needs a new `RateLimiter` port method that decrements the same window row the count used; the port has only `limit` and `pruneExpiredWindows` today. Windows are fixed, so size the ceiling for up to twice its limit across a window boundary, and size the window and cap to Clerk's 10-second window, including retries and concurrent instances. Item 3 already reads Clerk's answer after the middleware runs. The same retry budget gives the gateway's and provisioner's Clerk retries a caller deadline, which DEBT-527 left to this item.
- **Trigger.** Clerk replies to the report, or `clerk_site_limit_reached` fires.

### 3. A failed nonce lookup is counted only from the query (P3)

- **Evidence.** `clerkCallFailure` names a `handshake` failure only when `__clerk_handshake_nonce` is in the query (`lib/clerk-call-failures.ts:109-115`). Clerk reads the nonce from the query, or else from a cookie of that name (`@clerk/backend` 3.27.0, `dist/internal.js:1218`: `getQueryParam(HandshakeNonce) || getCookie(HandshakeNonce)`). On 2026-11-02, thirty failed lookups of a `%` cookie in one minute, each Clerk's 404, raised nothing. The limiter already counts the cookie (`lib/clerk-backend-call-limit.ts:26-29`, `:323-330`).
- **Decided 2026-11-15 by the reviewing session, at the owner's delegation:** count a nonce from either place, as Clerk reads it. That is right wherever production carries the nonce, so the owner's production check of where it travels (decided 2026-11-02, due 2026-11-06, never done) is dropped.
- **Build, test-first.**
  1. Red in `lib/clerk-call-failures.test.ts`: a request with a `__clerk_handshake_nonce` cookie and no query nonce, answered `session-token-missing` with no cookies set, names `handshake`; with cookies set, it names nothing. In `lib/clerk-call-failures-sdk.test.ts`, beside the query case (`:211`), a nonce cookie whose lookup Clerk refuses names `handshake`.
  2. Green: `clerkCallFailure` also reads the Cookie header as Clerk does, through `cookieHeaderAsClerkReadsIt` (`lib/clerk-backend-call-limit.ts:85`), so a `%` value reads the same for both. Its request type gains the headers.
- **Done when** both tests pass.

### 4. Per-address limits sized without traffic (P3, waits for its trigger)

- **Evidence.** A handshake cannot be tied to a session before Clerk resolves it: `@clerk/backend` asks for `format=nonce` on every handshake redirect, and each nonce costs a Backend API lookup, genuine or forged. So handshakes stay limited per address: 30 a minute in the proxy (`CLERK_BACKEND_CALL_RATE_LIMIT`, `src/adapters/shared/rate-limits.ts:29-32`) and 30 in the Vercel firewall rule "BUG-323 Clerk handshake nonce limit" (fixed window per IP, read 2026-11-15). A person needs a handshake on their first return after sign-in if the browser has no `__refresh` cookie yet, or when a server refresh fails. So when more than 30 people on one network address do so in one clock minute, the rest wait up to a minute, and per-address refusals are logged without an alert. The signed-in limit (200, `:44-52`) and the failure-alert threshold (10, `:54-63`) were sized without traffic too; their comments say item 4's measurements retune them.
- **Options for the handshake limit.**
  1. Raise it in the proxy and the firewall to a shared-network size, leaving the site-wide cap to protect the allowance.
  2. Over the firewall's limit, challenge instead of refusing (`--rate-limit-action challenge`), and raise the proxy's limit to at least the firewall's. Needs a test showing a browser completing a handshake through the challenge.
  3. Ask Clerk for the token format, or a handshake that spends no allowance, alongside item 2's report.
  4. Keep 30 until real people are refused.
- **Decided 2026-11-15 by the reviewing session, at the owner's delegation: option 4, accepted.** Before launch there is no traffic to size against, and fellowship cohorts are small. The per-address limit keeps one address from taking a large share of the site-wide cap, which protects the allowance every signed-in page shares. Options 1 and 2 change a live firewall setting, and option 2 needs its own browser test, for a crowd not yet seen. A refused person waits at most a minute.
- **Trigger** for the handshake limit and the retune. It must show real people: an address over its limit can be one bot, which is the limit working, so the `address` bucket's `windows_over_limit` alone does not count.
  - A support report of a sign-in refused or stalled on a shared network.
  - `clerk_signed_in_limit_reached` fires: only sessions Clerk signed fill that bucket, each refused at its own six a minute before it counts there, so at least 34 sessions Clerk signed shared one address. One account signed in many times can also do that, so first confirm distinct users in Clerk's dashboard, as the runbook row says.
  - 30 days of `clerk_backend_call_usage` rows after the first real live subscription, from the owner's read-only count; DEBT-501 item 7's refunded purchase does not count.

  Then size the three limits from the rows' `busiest_minute` in `address`, `signed-in-address` and `call-failed`.
- **The usage-row read.** Step 1 reached production on 2026-11-02. The owner reads `clerk_backend_call_usage` with the query in `docs/architecture/observability.md`: a row for each of the seven buckets, each starting where the one before it ended. An agent cannot, since it never connects to the production database. It was due 2026-11-08. No session held it and the queue review lapsed (due 2026-10-30), so it is re-dated 2026-11-22, to run with DEBT-505's manual renewal run, whose response reports `clerkBackendCallUsage`.

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or left as a Waiting row with its trigger in the records index.

- [ ] Item 3: a failed nonce lookup is named whether the nonce came in the query or the cookie.
- [ ] Item 4: the owner's usage-row read is recorded, showing rows for all seven buckets with no gap.
- [x] Item 4: the handshake limit's choice is recorded (2026-11-15, keep 30).
- [ ] Items 2 and 4 become Waiting rows with their triggers when the rest closes.

## Related

- BUG-323: the request limits this builds on.
- BUG-369, BUG-374 and BUG-375: gaps found and fixed under items 3 and 4.
- DEBT-505: the alert path, and the manual renewal run the usage-row read joins.
- DEBT-537: its `@clerk/backend` 3.28.0 update rechecks `lib/clerk-backend-call-limit.ts`.

Corrected 2026-11-15: finished build history of items 1, 3, 4 (steps 1 to 4) and 5 stripped (it is in git at 34d9aea0), keeping item 1's accepted deletion race and why a refresh logs its `code` (BUG-374); item 5's signed-in production visit was the 2026-11-04 check; item 3 counts a cookie nonce and item 4 keeps 30 a minute, both decided by the reviewing session at the owner's delegation; item 4 regains the retune of the signed-in limit and failure threshold, with a trigger that shows real people; the usage-row read lapsed 11-08 and is re-dated 2026-11-22 with its reason; priority P3, since every open item is P3.
