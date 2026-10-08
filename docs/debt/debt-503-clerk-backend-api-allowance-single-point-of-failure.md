# DEBT-503: Clerk's Shared Backend API Allowance Is a Single Point of Failure

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — item 1 (identity from the session token) implemented; its check follows release; items 2–4 follow
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

Until item 1, every signed-in request spent one call of Clerk's Backend API allowance through `currentUser()`. Clerk limits that allowance per production instance, and when it ran out every signed-in page failed. Since item 1, our code spends it only to provision a new user's row, to refresh the email billing sends to Stripe, and to check a stale email owner under BUG-284's rules. Clerk's middleware still spends it to refresh an expired session token (BUG-323).

[BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md) showed the allowance can also be spent from outside, and fixed that with request limits in our middleware. Those limits trade a full outage for a smaller, cheaper one: once the site-wide cap fills, returning visitors whose session token has expired wait a minute.

This record holds the structural fixes, so that the allowance stops being the one thing every signed-in page depends on.

## Items

### 1. Read identity from the session token, not the Backend API (P2)

- **Evidence.**
  - **Before item 1** (as found 2026-10-05), **every signed-in request spent a Backend API call.** `ClerkAuthGateway.getCurrentUser` called `currentUser()` on every signed-in render and action (`src/adapters/gateways/clerk-auth-gateway.ts`, through `lib/container.ts`), with up to three attempts on a 429.
  - **The ID is already verified locally.** `currentUser()` is `auth()` followed by `users.getUser(userId)` (`@clerk/nextjs` 7.9.4). So the call fetches a profile for an ID `auth()` already trusts. `auth()` accepts only the token the middleware verified, under an HMAC header signature, and throws if the middleware did not run.
  - **Checkout spent a second call.** Billing's `getClerkUserId` made another `currentUser()` call just for the ID.
  - **Clerk's 404 was the only deletion guard.** Only the webhook read the tombstones `user.deleted` writes. On sign-in, Clerk's 404 was what stopped a deleted user's leftover row from being served.
  - **CI meets the limit too.** On 2026-10-07, two overlapping E2E runs on one development instance met this lookup's 429s, so signed-in pages rendered as signed out and `main`'s production deploy waited for a re-run ([DEBT-508](./debt-508-concurrent-e2e-runs-share-clerk-budget-and-stripe-customer.md)).
- **Decided.**
  - **Session identity.** `getCurrentUser()` reads the Clerk user ID from `auth()`, then reads our `users` row and the deletion tombstone together.
    - A tombstoned ID returns no user, even if a leftover row exists, and makes no Clerk call.
    - An existing row is returned, with no Clerk call and no write.
    - A missing row is provisioned with one Backend API lookup by ID, through today's `ensureClerkUser`, so BUG-284's identity rules and BUG-320's retry hold unchanged. A Clerk 404 there returns no user.
    - Users are never provisioned from token claims. A first visit while Clerk is down fails closed.
  - **Fresh email where it matters.** `requireUser({ currentEmail: true })` refreshes the email from Clerk through the same provisioning path, after the tombstone check. Only Stripe checkout and trial card setup ask for it, after their rate limiter and idempotency replay. A refreshed row whose ID differs is a conflict. Billing reads the Clerk ID from the session, so checkout spends one call instead of two, and a refused or replayed one spends none.
  - **Email freshness.** Email changes otherwise arrive through Clerk's `user.updated` webhook, retried by Clerk's delivery and recorded by the webhook controller. Provisioning, the billing refresh and BUG-284's stale-owner resolver also correct it. Operator recovery is a replay from the Clerk Dashboard, documented in [Deployment Environments](../dev/deployment-environments.md#a-missed-clerk-webhook-leaves-a-stale-email-or-a-deleted-users-row). Clerk does not guarantee webhook delivery, so a stored address must not be the authority for a legal notice: [DEBT-511](./debt-511-legal-notices-use-a-stored-email-clerk-may-have-changed.md) will read it from Clerk at send time, falling back to the stored address only on a notice's last eligible run, when Clerk is unavailable, verified that address within the past 7 days, and no `user.updated` or `user.deleted` for that user is failing. Until DEBT-511 ships, notices still go to the stored address. Before this item, that gap affected anyone who had not signed in since changing their address; this item widens it to active users between checkouts. DEBT-511 ships before paid acquisition, or 35 days before the earliest live renewal if that is sooner.
  - **Deletion races.**
    - A tombstone committed before the read returns no user.
    - One committed after the read serves that one response, as today.
    - Between Clerk's deletion and its webhook, a still-valid token (about 60 seconds) is served its own row. A billing refresh gets Clerk's 404 and is refused. This is bounded, and changes no ownership.
    - Provisioning racing a deletion stays DEBT-502 item 2, with one call site for its fix.
  - **Proof.** The skip-Clerk composition test asserts that a signed-in request with an existing row calls `auth()` and never `currentUser()` or the Backend API. A source guard keeps `currentUser` out of the code. A shared contract runs the five session-identity scenarios against the maintained fakes and real Postgres.
  - **Not adopted.** A custom session-token claim for the email: claims must never provision a user, and freshness is handled above.

  This removes the largest consumer of the allowance, but does not by itself justify raising BUG-323's caps; item 2 still needs a burst and retry budget. It moves here from DEBT-502 item 4.

  *Corrected 2026-10-06: the decision now names the recovery of a stale or missed email update, verified-email selection and deletion races (#1410).*

  *Corrected 2026-10-07: the plan read every caller. "Backend API only to provision" also needs the billing refresh and BUG-284's resolver. The tombstone read is required, since Clerk's 404 was the only sign-in guard. Checkout's second call is removed. The token's trust comes from the middleware's HMAC-signed headers.*
- **Care.** BUG-284's identity rules and BUG-320's provisioning race must hold. Test-first against the maintained fakes and real Postgres.
- **Implemented 2026-10-07.**
  - `ClerkAuthGateway` reads the Clerk user ID from `auth()`. `lib/auth.ts` and every `currentUser()` call are gone, and billing reads the ID from the session.
  - Tests: `clerk-auth-gateway-session.test.ts`, `billing-controller-current-email.test.ts`, the skip-Clerk composition test (`lib/container.skip-clerk.test.ts`), and the source guard `tests/clerk-backend-api-boundary.test.ts`.
  - `tests/shared/session-identity-contract.ts` runs the five scenarios over the fakes and over real Postgres. Clerk's 404 in them is the real SDK's error, the one the Backend API throws; its other answers are built by hand.
  - BUG-320: six concurrent first requests, each on its own connection, provision one row in each of 100 rounds. With BUG-320's retry removed, the test failed in each of five runs.
  - [BUG-332](../bugs/bug-332-concurrent-first-requests-can-deadlock-provisioning.md): that test then found a deadlock among the same inserts, in about one run in three. The gateway now retries provisioning after a `40P01`.
  - After release: `main`'s E2E passes, and DEBT-508's overlap check shows overlapping runs meet no Clerk 429.

### 2. Let only forged requests fill the site-wide cap (P3)

- **Evidence.** BUG-323's site-wide cap counts every request that would make Clerk call its Backend API, real or forged. So an attacker who fills it also delays real returning visitors. Its one-minute window differs from Clerk's ten-second window, so the average ratio does not establish reserved capacity.
- **Options.**
  1. Count only failed lookups. Clerk's answer, read after the middleware runs, shows whether a lookup succeeded.
  2. Accept a handshake value only from a browser our middleware just redirected to Clerk.
  3. Clerk validates the value before spending the allowance. This was reported to Clerk on 2026-10-05.
- **Decided.** Revisit after Clerk replies and item 1 ships, starting from option 1 in two levels. A site-wide ceiling counts every lookup before the call and is never refunded, so it still bounds what Clerk's allowance can spend, including successful refreshes from free accounts. Below it, a lower refusal threshold counts lookups before the call and refunds each one that Clerk's answer shows succeeded, so successful lookups do not count toward it. Refunding needs a new `RateLimiter` port method that decrements the same window row the count used; the port has only `limit` and `pruneExpiredWindows` today. Windows are fixed, so size the ceiling for up to twice its limit across a window boundary. Size the window and cap to Clerk's 10-second window, including retries and concurrent instances; a minute average proves no burst headroom. Do not raise caps from averages alone.

  *Corrected 2026-10-06: #1410 ruled option 1 out by considering only counting after the call; a never-refunded ceiling with a refunded threshold below it keeps the bound, and forged lookups fill the threshold faster than real ones (#1410 review).*

### 3. Alert when a cap trips or Clerk refuses a call (P3)

- **Evidence.** Today a tripped cap is visible only as 429 responses, and a Clerk refusal only as errors from the Backend API's user lookup.
- **Options.** A pino summary alone cannot drive a Sentry alert: the current logger has no Sentry transport. Forwarding every log adds collection and quota costs. A bounded, explicit operational event is sufficient, but one error event per minute would allow 43,200 events in 30 days against this account’s 5,000-error monthly allowance. A per-window bound alone does not protect that quota.
- **Decided.** Raise a cap trip or a Clerk 429 through [DEBT-505](./debt-505-logged-only-failures-alert-nobody.md)'s bounded alert path, as its own alert kind: a Sentry event with fixed tags only, at most one per six hours or, if the limiter errors, one per six hours per server instance, and routed to the owner. Add a structured log line for each trip for diagnosis, since a 429 from `tooManyRequests` logs nothing today. Prove the bound with concurrent writers and sustained trips, and confirm one test event reaches the configured alert before claiming delivery. Document Attack Mode as the response.

  *Corrected 2026-10-06: one cooldown key on the existing limiter replaces #1410's incident transition, cooldown and separate budget, three mechanisms for one bound; the shared alert path now belongs to DEBT-505 (#1410 review).*

  *Corrected 2026-10-06: `lib/logger.ts` writes stdout, while `instrumentation.ts` captures exceptions; no pino-to-Sentry forwarding is installed. The account API confirms Developer, not a paid logging assumption.*

### 4. Measure the real volume of these requests (P3)

- **Decided.** Record the per-minute count of requests that would make Clerk call its Backend API. Retune BUG-323's caps from that number instead of from the allowance alone.

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or deferred with its trigger in the register.

## Related

- [BUG-323](../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md): the request limits this builds on.
- [DEBT-502](./debt-502-account-identity-and-action-hardening.md) item 4: where item 1 was first recorded.
